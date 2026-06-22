/**
 * Mapanisy v2 project store — PER USER.
 *   GET    /api/v2/projects        → { projects: [{ id, name, updatedAt }] }
 *   GET    /api/v2/projects?id=ID  → { project }
 *   POST   /api/v2/projects        → save { name, project }  → { id }
 *   DELETE /api/v2/projects?id=ID  → { ok }
 *
 * Storage is per-user and DB-gated:
 *  - When DATABASE_URL is configured → Postgres `projects_v2` table scoped to
 *    the authenticated user (the production path).
 *  - Otherwise (local dev with no DB) → a per-user folder on disk so projects
 *    still persist and never leak across accounts.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveUserId } from "@/lib/auth/resolveUserId";
import { Project as ProjectSchema } from "@/v2/doc/schema";

// ── Dev filesystem store (per-user folder), used only when there's no DB ──────
const ROOT = path.join(process.cwd(), "projects-v2");
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, "").trim();
const userDir = (userId: string) => path.join(ROOT, safeId(userId) || "anon");

export async function GET(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");

  if (db) {
    if (id) {
      const [row] = await db.select({ doc: schema.projectsV2.doc })
        .from(schema.projectsV2)
        .where(and(eq(schema.projectsV2.id, id), eq(schema.projectsV2.userId, userId)))
        .limit(1);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      try { return NextResponse.json({ project: JSON.parse(row.doc) }); }
      catch { return NextResponse.json({ error: "Corrupt project" }, { status: 500 }); }
    }
    const rows = await db.select({ id: schema.projectsV2.id, name: schema.projectsV2.name, updatedAt: schema.projectsV2.updatedAt, shareToken: schema.projectsV2.shareToken })
      .from(schema.projectsV2)
      .where(eq(schema.projectsV2.userId, userId))
      .orderBy(desc(schema.projectsV2.updatedAt));
    return NextResponse.json({ projects: rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.getTime(), shared: !!r.shareToken })) });
  }

  // Dev FS path (per-user folder)
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  if (id) {
    try {
      const raw = await fs.readFile(path.join(dir, `${safeId(id)}.json`), "utf8");
      return NextResponse.json({ project: JSON.parse(raw) });
    } catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
  }
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const projects = await Promise.all(files.map(async (f) => {
      try {
        const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
        return { id: data?.id ?? f.replace(/\.json$/, ""), name: data?.name ?? f, updatedAt: data?.updatedAt ?? 0, shared: !!data?.shareToken };
      } catch { return null; }
    }));
    return NextResponse.json({ projects: projects.filter(Boolean).sort((a: any, b: any) => b.updatedAt - a.updatedAt) });
  } catch { return NextResponse.json({ projects: [] }); }
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const parsed = ProjectSchema.safeParse(body?.project);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });

  const project = parsed.data;
  project.name = (body?.name || project.name || "Untitled animation").toString().slice(0, 120);
  project.updatedAt = Date.now();

  if (db) {
    // Preserve any existing share token: it's managed only via the share
    // endpoint, so a normal editor save must never clear a live public link.
    const [existing] = await db.select({ shareToken: schema.projectsV2.shareToken })
      .from(schema.projectsV2)
      .where(and(eq(schema.projectsV2.id, project.id), eq(schema.projectsV2.userId, userId)))
      .limit(1);
    project.shareToken = existing?.shareToken ?? null;
    const docJson = JSON.stringify(project);
    await db.insert(schema.projectsV2)
      .values({ id: project.id, userId, name: project.name, doc: docJson, shareToken: project.shareToken, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.projectsV2.id,
        // Scope the update to this user so a guessed id can't overwrite another
        // user's project (the row only updates when it's already theirs).
        where: eq(schema.projectsV2.userId, userId),
        // share_token intentionally omitted — preserved across saves.
        set: { name: project.name, doc: docJson, updatedAt: new Date() },
      });
    return NextResponse.json({ ok: true, id: project.id });
  }

  // Dev FS: the file's own shareToken is the source of truth — read it back and
  // keep it so a save doesn't drop a published link.
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeId(project.id)}.json`);
  try {
    const prev = JSON.parse(await fs.readFile(file, "utf8"));
    if (prev?.shareToken) project.shareToken = prev.shareToken;
  } catch { /* new project — no prior token */ }
  await fs.writeFile(file, JSON.stringify(project), "utf8");
  return NextResponse.json({ ok: true, id: project.id });
}

export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (db) {
    await db.delete(schema.projectsV2).where(and(eq(schema.projectsV2.id, id), eq(schema.projectsV2.userId, userId)));
    return NextResponse.json({ ok: true });
  }
  try { await fs.unlink(path.join(userDir(userId), `${safeId(id)}.json`)); } catch {}
  return NextResponse.json({ ok: true });
}
