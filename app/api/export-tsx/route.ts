import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { generateMapSceneTsx } from "@/lib/codegen/mapScene";
import { generateDataVizSceneTsx } from "@/lib/codegen/dataVizScene";
import { generateTitleSceneTsx } from "@/lib/codegen/titleScene";
import { generateLowerThirdSceneTsx } from "@/lib/codegen/lowerThirdScene";
import { generateQuoteSceneTsx } from "@/lib/codegen/quoteScene";
import { patchRootTsx, defaultRootTsx } from "@/lib/codegen/rootUpdater";
import { toComponentName } from "@/lib/codegen/util";
import { ExportSpecPayload, parseOrError } from "@/lib/schemas";
import type { SceneSpec } from "@/lib/types";

const MOTION_GRAFIKS_PATH = process.env.MOTION_GRAFIKS_PATH;

/**
 * Resolve to a real absolute path under MOTION_GRAFIKS_PATH and verify the
 * resolved path is still inside the configured root — blocks traversal via
 * `..` or symlinks even if user input slipped past sanitization.
 */
function safeJoin(root: string, ...segments: string[]): string {
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, ...segments);
  if (!target.startsWith(rootAbs + path.sep) && target !== rootAbs) {
    throw new Error(`Path traversal blocked: ${target}`);
  }
  return target;
}

export async function POST(req: NextRequest) {
  if (!MOTION_GRAFIKS_PATH) {
    return NextResponse.json(
      { error: "MOTION_GRAFIKS_PATH not set in .env.local" },
      { status: 500 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseOrError(ExportSpecPayload, rawBody);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const spec = parsed.data.spec as SceneSpec;

  let srcDir: string;
  try {
    srcDir = safeJoin(MOTION_GRAFIKS_PATH, "src");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  try {
    await fs.mkdir(srcDir, { recursive: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Cannot access ${srcDir}: ${e.message}` },
      { status: 500 },
    );
  }

  // Sanitize: Remotion composition IDs allow only [a-zA-Z0-9-] + CJK.
  const fileBaseName =
    spec.name
      .replace(/[^a-zA-Z0-9\-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "Untitled";
  spec.name = fileBaseName;
  const fileName = `${fileBaseName}.tsx`;

  let filePath: string;
  try {
    filePath = safeJoin(srcDir, fileName);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 1) Generate TSX
  const tsx =
    spec.kind === "map"
      ? generateMapSceneTsx(spec)
      : spec.kind === "dataviz"
        ? generateDataVizSceneTsx(spec)
        : spec.kind === "title"
          ? generateTitleSceneTsx(spec)
          : (spec.kind as string) === "quote"
            ? generateQuoteSceneTsx(spec)
            : generateLowerThirdSceneTsx(spec);

  try {
    await fs.writeFile(filePath, tsx, "utf8");
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to write ${filePath}: ${e.message}` },
      { status: 500 },
    );
  }

  // 2) Patch Root.tsx
  const rootPath = safeJoin(srcDir, "Root.tsx");
  let rootSrc: string;
  try {
    rootSrc = await fs.readFile(rootPath, "utf8");
  } catch {
    rootSrc = defaultRootTsx();
  }

  const componentName = toComponentName(spec.name);
  const importPath = `./${fileBaseName}`;
  const compositionId = fileBaseName;
  const durationInFrames = Math.round(spec.durationSec * spec.fps);

  const patched = patchRootTsx({
    rootSource: rootSrc,
    componentName,
    importPath,
    compositionId,
    durationInFrames,
    fps: spec.fps,
    width: spec.width,
    height: spec.height,
  });

  try {
    await fs.writeFile(rootPath, patched, "utf8");
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to patch ${rootPath}: ${e.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    filePath,
    compositionId,
    componentName,
  });
}
