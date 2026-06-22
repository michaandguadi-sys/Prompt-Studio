import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

/**
 * GET    /api/scenes/[id]  — fetch one scene (owner only)
 * DELETE /api/scenes/[id]  — delete a scene (owner only)
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db.select().from(schema.scenes)
    .where(and(eq(schema.scenes.id, id), eq(schema.scenes.userId, user.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ scene: { ...row, spec: JSON.parse(row.spec) } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(schema.scenes)
    .where(and(eq(schema.scenes.id, id), eq(schema.scenes.userId, user.id)));

  return NextResponse.json({ ok: true });
}
