import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "presets");

type PresetKind = "style" | "scene";

const KINDS: PresetKind[] = ["style", "scene"];

function dirFor(kind: PresetKind) {
  return path.join(ROOT, kind === "style" ? "styles" : "scenes");
}

async function ensureDirs() {
  for (const k of KINDS) await fs.mkdir(dirFor(k), { recursive: true });
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
}

/** GET /api/presets?kind=style|scene */
export async function GET(req: NextRequest) {
  await ensureDirs();
  const kind = (req.nextUrl.searchParams.get("kind") ?? "style") as PresetKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  try {
    const files = await fs.readdir(dirFor(kind));
    const presets = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(dirFor(kind), f), "utf8");
          try {
            return { id: f.replace(/\.json$/, ""), data: JSON.parse(raw) };
          } catch {
            return null;
          }
        }),
    );
    return NextResponse.json({
      presets: presets.filter(Boolean),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/presets  body: { kind, name, data } */
export async function POST(req: NextRequest) {
  await ensureDirs();
  const { kind, name, data } = await req.json();
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Missing data" }, { status: 400 });

  const id = safeName(name);
  const file = path.join(dirFor(kind), `${id}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return NextResponse.json({ ok: true, id });
}

/** DELETE /api/presets?kind=...&id=... */
export async function DELETE(req: NextRequest) {
  await ensureDirs();
  const kind = (req.nextUrl.searchParams.get("kind") ?? "style") as PresetKind;
  const id = req.nextUrl.searchParams.get("id");
  if (!KINDS.includes(kind) || !id) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  await fs.unlink(path.join(dirFor(kind), `${safeName(id)}.json`)).catch(() => {});
  return NextResponse.json({ ok: true });
}
