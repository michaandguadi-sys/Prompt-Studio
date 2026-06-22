/**
 * Stripe → DB subscription sync webhook.
 *
 * Handles the full subscription lifecycle: checkout completion, upgrades,
 * downgrades, cancellations, and payment failures.
 *
 * Setup (once):
 *  1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *  2. URL: https://your-domain.com/api/webhooks/stripe
 *  3. Events to listen for:
 *       checkout.session.completed
 *       customer.subscription.created
 *       customer.subscription.updated
 *       customer.subscription.deleted
 *       invoice.payment_failed
 *  4. Copy Signing Secret → STRIPE_WEBHOOK_SECRET in .env.local
 *
 * Local testing: stripe listen --forward-to localhost:3030/api/webhooks/stripe
 */
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { tierFromStripePrice, TIERS } from "@/lib/tiers";
import type Stripe from "stripe";

export async function POST(req: Request) {
  if (!stripe) return new Response("Stripe not configured", { status: 503 });
  if (!db)     return new Response("Database not configured", { status: 503 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not set", { status: 500 });

  const body = await req.text();
  const sig  = (await headers()).get("stripe-signature");
  if (!sig)  return new Response("Missing stripe-signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const userId = session.metadata?.userId;
      if (!userId) break;

      const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
      await syncSubscription(userId, stripeSub);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId = stripeSub.metadata?.userId;
      if (!userId) break;
      await syncSubscription(userId, stripeSub);
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId = stripeSub.metadata?.userId;
      if (!userId) break;

      // Downgrade to free on cancellation
      await db.update(schema.subscriptions)
        .set({
          tier: "free",
          status: "canceled",
          minutesLimit: TIERS.free.minutesPerMonth,
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodEnd: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.userId, userId));
      break;
    }

    case "invoice.payment_failed": {
      // In the basil API the invoice object's subscription field is not
      // typed on the top-level; access it via the raw object.
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subId = invoice.subscription;
      if (!subId) break;
      await db.update(schema.subscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(schema.subscriptions.stripeSubscriptionId, subId));
      break;
    }
  }

  return new Response("OK", { status: 200 });
}

async function syncSubscription(userId: string, stripeSub: Stripe.Subscription) {
  const priceId = stripeSub.items.data[0]?.price.id;
  const tier    = (priceId ? tierFromStripePrice(priceId) : null) ?? "free";
  const tierCfg = TIERS[tier];

  // In the basil API, current_period_start/end moved to the SubscriptionItem.
  const item = stripeSub.items.data[0] as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  };

  await db.update(schema.subscriptions)
    .set({
      tier,
      status:               stripeSub.status,
      minutesLimit:         tierCfg.minutesPerMonth,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId:        priceId ?? null,
      currentPeriodStart:   item.current_period_start ? new Date(item.current_period_start * 1000) : null,
      currentPeriodEnd:     item.current_period_end   ? new Date(item.current_period_end   * 1000) : null,
      updatedAt:            new Date(),
    })
    .where(eq(schema.subscriptions.userId, userId));
}
