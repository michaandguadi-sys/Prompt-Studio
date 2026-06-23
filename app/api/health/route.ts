import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/providers";

/**
 * Deploy-verification endpoint. Hit `GET /api/health` right after setting env
 * vars (locally or in Vercel) to see at a glance which integrations are wired.
 *
 * Returns ONLY booleans — never any secret value — so it's safe to leave public
 * (it's listed in middleware's public matcher). `db.reachable` does a real
 * round-trip (SELECT 1) so you can tell "URL is set" from "URL actually works".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Live DB ping — distinguishes "configured" from "actually connects".
  let dbReachable = false;
  if (db) {
    try {
      // postgres-js: db.execute runs raw SQL; wrap so a bad URL never 500s here.
      await (db as any).execute?.("select 1");
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }

  const env = process.env;
  const services = {
    clerk: {
      configured: !!(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY),
      webhook: !!env.CLERK_WEBHOOK_SECRET,
    },
    database: { configured: !!env.DATABASE_URL, reachable: dbReachable },
    stripe: {
      configured: !!env.STRIPE_SECRET_KEY,
      webhook: !!env.STRIPE_WEBHOOK_SECRET,
      prices: {
        creator: !!env.STRIPE_PRICE_CREATOR,
        teams: !!env.STRIPE_PRICE_TEAMS,
        custom: !!env.STRIPE_PRICE_CUSTOM,
        agency: !!env.STRIPE_PRICE_AGENCY,
      },
    },
    storage: {
      configured: !!(
        env.R2_ACCOUNT_ID &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY &&
        env.R2_BUCKET_NAME
      ),
      publicUrl: !!env.R2_PUBLIC_URL,
    },
    mapbox: { configured: !!env.NEXT_PUBLIC_MAPBOX_TOKEN },
    ai: { configured: aiConfigured() },
    appUrl: { configured: !!env.NEXT_PUBLIC_APP_URL },
  };

  // "ready" = the minimum needed to actually serve signed-in users end-to-end:
  // auth + persistence + render output storage. AI/Stripe are optional at launch
  // (heuristic planner works without AI; free tier needs no Stripe).
  const ready =
    services.clerk.configured &&
    services.database.configured &&
    services.database.reachable &&
    services.storage.configured &&
    services.mapbox.configured;

  return NextResponse.json(
    { ok: true, ready, services, ts: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
