/**
 * Publish / un-publish a project as a public read-only viewer link.
 *   POST /api/v2/projects/share  body { id, enable }
 *     enable:true  → ensures a `shr_…` token, returns { token, url }
 *     enable:false → clears the token,        returns { token:null }
 *
 * The token is the source of truth for the public lookup. We mirror it into the
 * stored doc too so an exported .json carries its own share state, but the DB
 * column / FS file is what /api/v2/share/[token] reads. Ownership is enforced by
 * scoping every query to the authenticated user.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveUserId } from "@/lib/auth/resolveUserId";

const newToken = () => "shr_" + randomBytes(12).toString("hex"); // 24 hex chars
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, "").trim();
const userDir = (userId: string) => path.join(process.cwd(), "projects-v2", safeId(userId) || "anon");

function publicUrl(req: NextRequest, token: string): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    req.nextUrl.origin;
  return `${origin.replace(/\/$/, "")}/v/${token}`;
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const id = typeof body?.id === "string" ? body.id : "";
  const enable = body?.enable !== false; // default to enabling
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (db) {
    const [row] = await db.select({ doc: schema.projectsV2.doc, shareToken: schema.projectsV2.shareToken })
      .from(schema.projectsV2)
      .where(and(eq(schema.projectsV2.id, id), eq(schema.projectsV2.userId, userId)))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const token = enable ? (row.shareToken || newToken()) : null;
    let docJson = row.doc;
    try { const doc = JSON.parse(row.doc); doc.shareToken = token; docJson = JSON.stringify(doc); } catch { /* keep raw doc */ }
    await db.update(schema.projectsV2)
      .set({ shareToken: token, doc: docJson })
      .where(and(eq(schema.projectsV2.id, id), eq(schema.projectsV2.userId, userId)));
    return NextResponse.json({ ok: true, token, url: token ? publicUrl(req, token) : null });
  }

  // Dev FS
  const file = path.join(userDir(userId), `${safeId(id)}.json`);
  let doc: any;
  try { doc = JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
  const token = enable ? (doc.shareToken || newToken()) : null;
  doc.shareToken = token;
  await fs.writeFile(file, JSON.stringify(doc), "utf8");
  return NextResponse.json({ ok: true, token, url: token ? publicUrl(req, token) : null });
}
