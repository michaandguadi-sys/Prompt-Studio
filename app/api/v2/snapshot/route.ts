/**
 * POST /api/v2/snapshot — render ONE frame of a composition as an image.
 *
 * The engine behind the Still Image Suite: bloggers pick a moment, we render
 * it through the exact same Remotion pipeline as video (every layer, grade and
 * font pixel-identical to the film), and stream the image back.
 *
 * Body: {
 *   composition: Composition,   // the scene document (validated by Zod)
 *   frame?: number,             // which frame to render (default 0)
 *   format?: "png" | "jpeg" | "webp" | "pdf",   // default "png"
 *   scale?: number,             // 0.1–1 of the 4K-class canvas (default 1)
 *   jpegQuality?: number,       // 1–100 for jpeg/webp (default 90)
 * }
 * Responds with the binary image. Free tier gets the same watermark as video.
 *
 * Stills render in-process (one Chromium page, a few seconds) — a module-level
 * queue serialises them so parallel clicks can't stampede the server.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { existsSync } from "fs";
import path from "path";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkQuota } from "@/lib/quota";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";
import { rateLimit } from "@/lib/rateLimit";
import { Composition, dimsFor } from "@/v2/doc/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_FORMATS = new Set(["png", "jpeg", "webp", "pdf"]);
const MIME: Record<string, string> = {
  png: "image/png", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf",
};

/** Prefer a system Chromium (Docker: apt `chromium`; mac: Chrome) — no download. */
function systemBrowser(): string | undefined {
  for (const p of [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

/** Serialise renders — stills are quick, but Chromium instances are not free. */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("snapshot", clerkId, { maxRequests: 20, windowSec: 60 })) {
    return NextResponse.json({ error: "Slow down — try again in a moment." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const parsed = Composition.safeParse(body?.composition);
  if (!parsed.success) return NextResponse.json({ error: "Invalid composition" }, { status: 400 });
  const comp = parsed.data;

  const format = VALID_FORMATS.has(body?.format) ? (body.format as string) : "png";
  const scale = Math.min(1, Math.max(0.1, Number(body?.scale) || 1));
  const jpegQuality = Math.min(100, Math.max(1, Math.round(Number(body?.jpegQuality) || 90)));
  const totalFrames = Math.max(1, Math.round(comp.durationSec * comp.fps));
  const frame = Math.min(totalFrames - 1, Math.max(0, Math.round(Number(body?.frame) || 0)));

  // Same watermark rule as video renders: free tier (when billing is wired).
  let watermark = false;
  try {
    if (db) {
      const [user] = await db.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.clerkId, clerkId)).limit(1);
      if (user) { const q = await checkQuota(user.id); watermark = q.tier === "free"; }
    } else {
      devGetOrCreateUserByClerk(clerkId); // keep the dev store consistent
    }
  } catch { /* quota is advisory for stills — never block the render */ }

  // The bundle must be served from the APP origin so /api/sat and /api/dem
  // tile proxies resolve (same root cause as video renders).
  const origin = (process.env.RENDER_ORIGIN || req.nextUrl.origin).replace(/\/$/, "");
  const serveUrl = `${origin}/remotion-bundle/`;

  try {
    const buffer = await enqueue(async () => {
      const { renderStill, selectComposition, ensureBrowser } =
        await import("@remotion/renderer");
      const browserExecutable = systemBrowser();
      if (!browserExecutable) await ensureBrowser();
      const chromiumOptions = { gl: (process.env.RENDER_GL as any) || "angle" };
      const inputProps = { comp, watermark };
      const composition = await selectComposition({
        serveUrl, id: "MapanisyV2", chromiumOptions, browserExecutable, inputProps,
      });
      const { buffer: buf } = await renderStill({
        composition, serveUrl, frame,
        imageFormat: format as any,
        // This Remotion version only accepts a quality knob for JPEG.
        jpegQuality: format === "jpeg" ? jpegQuality : undefined,
        scale,
        chromiumOptions, browserExecutable, inputProps,
        output: null, // return the buffer instead of writing a file
        timeoutInMilliseconds: 90_000,
      });
      return buf;
    });

    if (!buffer) throw new Error("Renderer returned no image");
    const { width, height } = dimsFor(comp.aspect);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": MIME[format],
        "Cache-Control": "no-store",
        "X-Frame-Rendered": String(frame),
        "X-Image-Size": `${Math.round(width * scale)}x${Math.round(height * scale)}`,
      },
    });
  } catch (e: any) {
    console.error("[snapshot]", e?.message ?? e);
    return NextResponse.json(
      { error: "Still render failed — is the app reachable at its own origin?", detail: String(e?.message ?? e).slice(0, 300) },
      { status: 500 },
    );
  }
}
