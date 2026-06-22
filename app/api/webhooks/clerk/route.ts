/**
 * Clerk → Supabase user sync webhook.
 *
 * Clerk fires this when a user is created or deleted. We create a matching
 * row in `users` and bootstrap a free `subscriptions` row on sign-up.
 *
 * Setup (once):
 *  1. Go to Clerk Dashboard → Webhooks → Add Endpoint
 *  2. URL: https://your-domain.com/api/webhooks/clerk
 *  3. Events: user.created, user.updated, user.deleted
 *  4. Copy the Signing Secret → CLERK_WEBHOOK_SECRET in .env.local
 */
import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { TIERS } from "@/lib/tiers";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured", { status: 500 });
  if (!db)     return new Response("Database not configured", { status: 503 });

  const hdrs = await headers();
  const svixId        = hdrs.get("svix-id");
  const svixTimestamp = hdrs.get("svix-timestamp");
  const svixSignature = hdrs.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (evt.type === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const name  = [first_name, last_name].filter(Boolean).join(" ") || null;

    const [user] = await db
      .insert(schema.users)
      .values({ clerkId: id, email, name })
      .onConflictDoNothing()
      .returning();

    if (user) {
      await db.insert(schema.subscriptions).values({
        userId: user.id,
        tier: "free",
        minutesLimit: TIERS.free.minutesPerMonth,
        status: "active",
      });
    }
  }

  if (evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const name  = [first_name, last_name].filter(Boolean).join(" ") || null;
    await db
      .update(schema.users)
      .set({ email, name })
      .where(eq(schema.users.clerkId, id));
  }

  if (evt.type === "user.deleted" && evt.data.id) {
    await db
      .delete(schema.users)
      .where(eq(schema.users.clerkId, evt.data.id));
    // subscriptions + renderLogs cascade-delete via FK
  }

  return new Response("OK", { status: 200 });
}
