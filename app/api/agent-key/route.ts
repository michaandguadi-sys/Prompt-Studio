/**
 * GET  /api/agent-key  — returns the current user's agent key (generates one if missing)
 * POST /api/agent-key  — regenerates and returns a fresh agent key
 *
 * Works in two modes:
 *   - DB configured  → reads/writes users.agent_key (upserts the user row if the
 *                      Clerk webhook hasn't created it yet)
 *   - No DB (dev)    → file-backed devAgentStore so the feature works locally
 */
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { devGetOrCreateUserByClerk, devRotateKeyByClerk } from "@/lib/devAgentStore";

function newKey(): string {
  return randomBytes(20).toString("hex"); // 40-char hex string
}

/** Find the user row, creating it from Clerk identity if the webhook missed it. */
async function getOrCreateUser(clerkId: string) {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  if (existing) return existing;

  // Webhook hasn't synced this user yet — create the row now so the key sticks.
  let email = "";
  let name: string | null = null;
  try {
    const cu = await currentUser();
    email = cu?.emailAddresses?.[0]?.emailAddress ?? "";
    name = cu?.fullName ?? null;
  } catch { /* best-effort */ }

  const [created] = await db
    .insert(schema.users)
    .values({ clerkId, email, name })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Race: another request created it — re-select.
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  return row ?? null;
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Dev fallback — no database.
  if (!db) {
    const { agentKey } = devGetOrCreateUserByClerk(clerkId);
    return NextResponse.json({ agentKey, dev: true });
  }

  const user = await getOrCreateUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.agentKey) return NextResponse.json({ agentKey: user.agentKey });

  // Generate on first request
  const key = newKey();
  await db.update(schema.users).set({ agentKey: key }).where(eq(schema.users.id, user.id));
  return NextResponse.json({ agentKey: key });
}

export async function POST(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Dev fallback — no database.
  if (!db) {
    const { agentKey } = devRotateKeyByClerk(clerkId);
    return NextResponse.json({ agentKey, dev: true });
  }

  const user = await getOrCreateUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const key = newKey();
  await db.update(schema.users).set({ agentKey: key }).where(eq(schema.users.id, user.id));
  return NextResponse.json({ agentKey: key });
}
