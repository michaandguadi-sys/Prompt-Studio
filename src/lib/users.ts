/**
 * Resolve the internal user id for a Clerk id — PROVISIONING the row on demand
 * if the Clerk `user.created` webhook hasn't landed yet (or failed / isn't
 * configured). Signing in must never dead-end at "User not found": the webhook
 * is the canonical provisioner, but the app can't depend on its timing.
 */
import { db, schema } from "./db";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { devGetOrCreateUserByClerk } from "./devAgentStore";

export async function resolveOrCreateUserId(clerkId: string): Promise<string> {
  if (!db) return devGetOrCreateUserByClerk(clerkId).id;

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  if (existing) return existing.id;

  // Not provisioned yet — create it now (email is NOT NULL, so pull it from the
  // Clerk session; the user.updated webhook keeps it fresh afterwards).
  let email = "";
  let name: string | null = null;
  try {
    const cu = await currentUser();
    email = cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? "";
    name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null;
  } catch { /* best-effort — a blank email is fine, the webhook backfills it */ }

  await db.insert(schema.users).values({ clerkId, email, name }).onConflictDoNothing();
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  if (!row) throw new Error("Failed to provision user row");
  return row.id;
}
