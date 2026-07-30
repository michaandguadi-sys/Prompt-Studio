/**
 * POST /api/stripe/checkout
 * Body: { priceId: string }
 *
 * Creates a Stripe Checkout session for the signed-in user and returns the URL.
 * The client redirects to that URL; Stripe handles payment, then redirects back.
 *
 * Setup:
 *  1. Create products + prices in Stripe Dashboard
 *  2. Copy price IDs → STRIPE_PRICE_CREATOR / _TEAMS / _CUSTOM / _AGENCY in .env.local
 *  3. Set NEXT_PUBLIC_APP_URL to your domain (e.g. https://promptstudio.app)
 */
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { TIERS, tierFromStripePrice } from "@/lib/tiers";

export async function POST(req: Request) {
  if (!stripe) return Response.json({ error: "Stripe not configured" }, { status: 503 });
  if (!db)     return Response.json({ error: "Database not configured" }, { status: 503 });

  const { userId: clerkId } = await auth();
  if (!clerkId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId } = await req.json() as { priceId: string };
  if (!priceId || typeof priceId !== "string") {
    return Response.json({ error: "priceId is required" }, { status: 400 });
  }

  // Only allow price IDs that map to a known tier — reject arbitrary Stripe
  // prices. Includes the annual (yearly) Creator price alongside the monthly.
  const knownPriceIds = Object.values(TIERS)
    .flatMap((t) => [t.stripePriceId, t.stripePriceIdAnnual])
    .filter(Boolean);
  if (!knownPriceIds.includes(priceId)) {
    return Response.json({ error: "Unknown priceId" }, { status: 400 });
  }
  // The Pro tier is a ONE-TIME (lifetime) purchase; everything else recurs.
  const tier = tierFromStripePrice(priceId);
  const isLifetime = tier ? TIERS[tier].billing === "lifetime" : false;

  // Look up the user + existing subscription
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const [sub] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id)).limit(1);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3030";

  // Reuse existing Stripe customer if we have one
  let customerId = sub?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { clerkId, userId: user.id },
    });
    customerId = customer.id;
    // Persist immediately so we don't create duplicates on retries — and if the
    // user has no subscription row yet (webhook-race, or operating on the free
    // fallback), CREATE one now so the customer id sticks and the post-payment
    // webhook grant has a row to land on.
    if (sub) {
      await db.update(schema.subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, sub.id));
    } else {
      await db.insert(schema.subscriptions).values({
        userId: user.id,
        tier: "free",
        status: "active",
        minutesLimit: TIERS.free.minutesPerMonth,
        stripeCustomerId: customerId,
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: isLifetime ? "payment" : "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?upgraded=1`,
    cancel_url:  `${appUrl}/pricing`,
    // tier travels on the session so the webhook can grant lifetime access on
    // `checkout.session.completed` (one-time payments create no subscription).
    metadata: { userId: user.id, tier: tier ?? "" },
    ...(isLifetime
      ? {}
      : { subscription_data: { metadata: { userId: user.id, clerkId } } }),
    allow_promotion_codes: true,
  });

  return Response.json({ url: session.url });
}
