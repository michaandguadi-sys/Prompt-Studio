/**
 * Public, read-only project lookup by share token.
 *   GET /api/v2/share/:token  → { project }  (no auth — see middleware isPublic)
 *
 * Only projects whose owner explicitly published a `shr_…` token are reachable
 * here; the token itself is the capability. We return the validated doc so the
 * public viewer can render it with the same Remotion composition as the editor.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { Project as ProjectSchema } from "@/v2/doc/schema";

const TOKEN_RE = /^shr_[a-f0-9]{8,48}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token || "")) return NextResponse.json({ error: "Bad token" }, { status: 400 });

  let raw: string | null = null;

  if (db) {
    const [row] = await db.select({ doc: schema.projectsV2.doc })
      .from(schema.projectsV2)
      .where(eq(schema.projectsV2.shareToken, token))
      .limit(1);
    raw = row?.doc ?? null;
  } else {
    // Dev FS: no index — scan every per-user folder for a file whose doc carries
    // this token. Fine for local dev (small project counts).
    const root = path.join(process.cwd(), "projects-v2");
    try {
      const dirs = await fs.readdir(root);
      outer: for (const d of dirs) {
        const dir = path.join(root, d);
        let files: string[];
        try { files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")); } catch { continue; }
        for (const f of files) {
          try {
            const text = await fs.readFile(path.join(dir, f), "utf8");
            if (text.includes(token)) { // cheap pre-filter before parse
              const doc = JSON.parse(text);
              if (doc?.shareToken === token) { raw = text; break outer; }
            }
          } catch { /* skip unreadable file */ }
        }
      }
    } catch { /* no projects-v2 dir yet */ }
  }

  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Re-validate before serving publicly so a corrupt/legacy doc can't crash the viewer.
  let parsed;
  try { parsed = ProjectSchema.safeParse(JSON.parse(raw)); } catch { parsed = null as any; }
  if (!parsed?.success) return NextResponse.json({ error: "Corrupt project" }, { status: 500 });

  const project = parsed.data;
  // Trim to what the viewer needs; keep id/name out of guessable-enumeration risk minimal.
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      composition: project.composition,
      scenes: project.scenes,
      activeSceneId: project.activeSceneId,
      schemaVersion: project.schemaVersion,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
}
