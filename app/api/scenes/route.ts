import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

/**
 * GET  /api/scenes  — list all saved scenes for the signed-in user
 * POST /api/scenes  — save a new scene
 */

export async function GET() {
  if (!db) return NextResponse.json({ scenes: [] });

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return NextResponse.json({ scenes: [] });

  const rows = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.userId, user.id))
    .orderBy(desc(schema.scenes.updatedAt));

  const scenes = rows.map((r) => ({
    ...r,
    spec: JSON.parse(r.spec),
  }));

  return NextResponse.json({ scenes });
}

export async function POST(req: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, kind, spec } = body as { name?: string; kind?: string; spec?: unknown };

  const VALID_KINDS = ["map", "dataviz", "title", "lowerthird", "quote"] as const;

  if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 500) {
    return NextResponse.json({ error: "name must be 1–500 characters" }, { status: 400 });
  }
  if (!kind || !VALID_KINDS.includes(kind as any)) {
    return NextResponse.json({ error: `kind must be one of: ${VALID_KINDS.join(", ")}` }, { status: 400 });
  }
  const specStr = JSON.stringify(spec);
  if (!spec || typeof spec !== "object" || specStr.length > 1_000_000) {
    return NextResponse.json({ error: "spec missing or too large (max 1 MB)" }, { status: 400 });
  }

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [scene] = await db.insert(schema.scenes).values({
    userId: user.id,
    name: name.trim(),
    kind,
    spec: specStr,
  }).returning();

  return NextResponse.json({ scene: { ...scene, spec } }, { status: 201 });
}
