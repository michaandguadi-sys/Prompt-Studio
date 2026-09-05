import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TIERS } from "@/lib/tiers";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";

/**
 * Resolve the internal user id (Postgres row id, or dev-store id when there's no
 * DATABASE_URL) from the current Clerk session. Returns null when unauthenticated.
 * Shared by the project store + share endpoints so they scope rows identically.
 *
 * Provisions the row ON DEMAND if it does not exist yet. It previously returned
 * null in that case, and every caller reads null as "not signed in" → 401. That
 * locked a genuinely signed-in user out of saving, listing, sharing or deleting
 * projects whenever the users row was missing, which is the NORMAL state:
 *
 *   • CLERK_WEBHOOK_SECRET is documented as optional (.env.production.example),
 *     so a deploy without it NEVER creates a users row and project storage is
 *     permanently broken for everyone.
 *   • Even configured, user.created is async — a fast signup reaches the editor
 *     before the webhook lands.
 *
 * The dev store already auto-created (devGetOrCreateUserByClerk); this brings the
 * Postgres path to the same behaviour, and matches the free-tier grant quota.ts
 * already does on demand.
 */
export async function resolveUserId(): Promise<string | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  if (!db) return devGetOrCreateUserByClerk(clerkId).id;

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  if (existing) return existing.id;

  // ── Provision on demand (same shape as the clerk webhook) ────────────────
  let email = `${clerkId}@placeholder.local`;
  let name: string | null = null;
  try {
    const u = await currentUser();
    email = u?.emailAddresses?.[0]?.emailAddress ?? email;
    name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || null;
  } catch {
    // Clerk lookup is best effort — never block on it. email is NOT NULL, so
    // the deterministic placeholder above keeps the insert valid, and the
    // webhook's user.updated handler corrects it later.
  }

  const [created] = await db
    .insert(schema.users)
    .values({ clerkId, email, name })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });

  if (created) {
    // Free tier so checkQuota meters them from the first render.
    await db
      .insert(schema.subscriptions)
      .values({
        userId: created.id,
        tier: "free",
        minutesLimit: TIERS.free.minutesPerMonth,
        status: "active",
      })
      .onConflictDoNothing();
    return created.id;
  }

  // onConflictDoNothing returned nothing → the webhook (or a concurrent
  // request) won the race and the row now exists. Re-read it.
  const [raced] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  return raced?.id ?? null;
}
