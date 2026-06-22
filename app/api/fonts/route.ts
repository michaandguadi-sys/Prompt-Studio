import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const STUDIO_FONTS = path.join(process.cwd(), "public", "fonts");
const MOTION_FONTS = process.env.MOTION_GRAFIKS_PATH
  ? path.join(process.env.MOTION_GRAFIKS_PATH, "public", "fonts")
  : null;

const ALLOWED_EXT = new Set([".woff2", ".woff", ".ttf", ".otf"]);

async function ensureDirs() {
  await fs.mkdir(STUDIO_FONTS, { recursive: true });
  if (MOTION_FONTS) await fs.mkdir(MOTION_FONTS, { recursive: true });
}

/** GET /api/fonts → list uploaded fonts */
export async function GET() {
  try {
    await ensureDirs();
    const files = await fs.readdir(STUDIO_FONTS);
    const fonts = files
      .filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase()))
      .map((f) => {
        const base = path.basename(f, path.extname(f));
        return {
          file: f,
          family: base.replace(/[-_]/g, " ").trim(),
          url: `/fonts/${f}`,
        };
      });
    return NextResponse.json({ fonts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/fonts (multipart) → upload one or more font files */
export async function POST(req: NextRequest) {
  try {
    await ensureDirs();
    const form = await req.formData();
    const files = form.getAll("font") as File[];
    if (files.length === 0) {
      return NextResponse.json({ error: "No 'font' file provided" }, { status: 400 });
    }

    const saved: string[] = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { error: `Unsupported font format: ${ext}. Use .woff2/.woff/.ttf/.otf` },
          { status: 400 },
        );
      }
      const safeName = file.name.replace(/[^\w.\- ]/g, "_");
      const bytes = Buffer.from(await file.arrayBuffer());

      await fs.writeFile(path.join(STUDIO_FONTS, safeName), bytes);
      if (MOTION_FONTS) {
        await fs.writeFile(path.join(MOTION_FONTS, safeName), bytes);
      }
      saved.push(safeName);
    }

    return NextResponse.json({ ok: true, saved });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE /api/fonts?file=Foo.woff2 */
export async function DELETE(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const safe = path.basename(file);
  try {
    await fs.unlink(path.join(STUDIO_FONTS, safe)).catch(() => {});
    if (MOTION_FONTS) {
      await fs.unlink(path.join(MOTION_FONTS, safe)).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
