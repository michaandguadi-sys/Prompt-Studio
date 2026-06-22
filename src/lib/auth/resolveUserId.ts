import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";

/**
 * Resolve the internal user id (Postgres row id, or dev-store id when there's no
 * DATABASE_URL) from the current Clerk session. Returns null when unauthenticated.
 * Shared by the project store + share endpoints so they scope rows identically.
 */
export async function resolveUserId(): Promise<string | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.clerkId, clerkId))
      .limit(1);
    return user?.id ?? null;
  }
  return devGetOrCreateUserByClerk(clerkId).id;
}
