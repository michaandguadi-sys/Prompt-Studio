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
      // Must match the shipping pricing model: Free / Creator (monthly +
      // annual) / Pro (one-time lifetime). The old teams/custom/agency price
      // vars no longer exist anywhere, so they always reported false.
      prices: {
        creator: !!env.STRIPE_PRICE_CREATOR,
        creatorAnnual: !!env.STRIPE_PRICE_CREATOR_ANNUAL,
        pro: !!env.STRIPE_PRICE_PRO,
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

  // "ready" = the minimum a user needs to sign in and generate a story.
  //
  // It previously also required database + R2 storage + a Mapbox token, but all
  // three are documented as OPTIONAL (LAUNCH.md, .env.production.example): the
  // app falls back to a JSON file store, streams renders from its own volume,
  // and renders with MapLibre + free tiles. The documented minimum env could
  // therefore never return ready:true, so the runbook's own post-deploy check
  // ("curl /api/health → ready") failed on every correct MVP deploy.
  //
  // Optional capabilities are still reported under `services` and summarised in
  // `mode`, so you can see what is enabled without it gating the health check.
  const ready =
    services.clerk.configured &&
    services.appUrl.configured &&
    services.ai.configured;

  const mode = {
    persistence: services.database.reachable
      ? "postgres"
      : services.database.configured
        ? "postgres-unreachable"
        : "file-store",
    renderDelivery: services.storage.configured ? "r2" : "local-volume",
    tiles: services.mapbox.configured ? "mapbox" : "maplibre-free",
    billing: services.stripe.configured ? "stripe" : "disabled",
  };

  return NextResponse.json(
    { ok: true, ready, mode, services, ts: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
