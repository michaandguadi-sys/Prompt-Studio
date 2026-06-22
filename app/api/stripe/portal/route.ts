/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session so the user can manage their
 * subscription (upgrade, downgrade, cancel, update payment method).
 * Returns { url } — client redirects there.
 *
 * Prerequisite: enable the portal at https://dashboard.stripe.com/settings/billing/portal
 */
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

export async function POST() {
  if (!stripe) return Response.json({ error: "Stripe not configured" }, { status: 503 });
  if (!db)     return Response.json({ error: "Database not configured" }, { status: 503 });

  const { userId: clerkId } = await auth();
  if (!clerkId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const [sub] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id)).limit(1);

  if (!sub?.stripeCustomerId) {
    return Response.json({ error: "No active Stripe subscription found" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3030";
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appUrl}/dashboard`,
  });

  return Response.json({ url: session.url });
}
