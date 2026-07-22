/**
 * Quota enforcement — checks a user's usage this billing period against their
 * subscription limit. Called server-side before each render.
 *
 * Two metering modes, chosen per tier:
 *   • count mode  — the tier has TIERS[tier].maxRenders set (the Free plan:
 *                   1 animation). Gated by number of completed renders.
 *   • minutes mode — maxRenders is null (paid tiers). Gated by render minutes.
 * `unit` tells the UI which one is binding so copy reads correctly.
 */
import { db, schema } from "./db";
import { eq, gte, and, sum, count } from "drizzle-orm";
import { TIERS, type Tier } from "./tiers";

/**
 * TEST MODE — grant every logged-in user the Pro/unlimited plan.
 *
 * Set `TEST_UNLIMITED=true` in the environment to let the whole team exercise
 * every paid feature (unlimited 4K renders, no watermark, data layers, brand
 * kits, story arcs, premium AI, priority queue) without paying. It is an
 * EXPLICIT opt-in and OFF by default, so it can never activate accidentally —
 * the code below is completely inert unless the flag is set.
 *
 * ⚠️ REMOVE (unset the env var) BEFORE PUBLIC LAUNCH — while on, it gives away
 *    every paid feature for free to anyone who can sign in.
 *
 * PRODUCTION FAIL-CLOSED: like the sibling BYPASS_QUOTA, the flag is IGNORED in
 * production builds (NODE_ENV === "production") so a single forgotten/leaked env
 * var can never hand out Pro on the live site. A deliberate staging build that
 * runs NODE_ENV=production can still force it on with a second explicit opt-in,
 * TEST_UNLIMITED_ALLOW_PROD=true. In development the single flag is enough.
 */
export function grantAllPro(): boolean {
  if (process.env.TEST_UNLIMITED !== "true") return false;
  if (process.env.NODE_ENV === "production" && process.env.TEST_UNLIMITED_ALLOW_PROD !== "true") return false;
  return true;
}

if (process.env.TEST_UNLIMITED === "true") {
  // Loud, once-per-process notice (error-level — this hands out every paid
  // feature) so it can never quietly ride to launch.
  if (!grantAllPro()) {
    console.error("[entitlements] TEST_UNLIMITED=true is IGNORED in this production build. Set TEST_UNLIMITED_ALLOW_PROD=true to force it on a deliberate staging build, or remove it before launch.");
  } else {
    console.error("[entitlements] TEST_UNLIMITED active — every logged-in user is treated as Pro/unlimited. REMOVE before public launch.");
  }
}

export type QuotaResult = {
  allowed: boolean;
  usedMinutes: number;
  limitMinutes: number;
  /** Completed renders this period. */
  usedRenders: number;
  /** Animation cap for count-metered tiers; null when metered by minutes. */
  maxRenders: number | null;
  /** Which limit binds this tier — drives UI copy ("animation" vs "minute"). */
  unit: "animation" | "minute";
  tier: Tier;
  periodStart: Date;
  /** 0–1 fraction of the binding limit consumed. */
  fraction: number;
};

/**
 * A fully-unlocked Pro/unlimited quota. Shared by the TEST_UNLIMITED override
 * and the dev BYPASS_QUOTA path so both hand out identical, always-allowed Pro
 * entitlements (no watermark, full-scale renders, all features).
 */
export function unlimitedProQuota(): QuotaResult {
  return {
    allowed: true,
    usedMinutes: 0,
    limitMinutes: TIERS.pro.minutesPerMonth,
    usedRenders: 0,
    maxRenders: null,
    unit: "minute",
    tier: "pro",
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    fraction: 0,
  };
}

export async function checkQuota(userId: string): Promise<QuotaResult> {
  // TEST MODE: TEST_UNLIMITED=true → treat everyone as Pro/unlimited. Checked
  // first so it applies on every path (with or without a DB). Off by default.
  if (grantAllPro()) return unlimitedProQuota();

  // Dev/testing bypass: add BYPASS_QUOTA=true to .env.local to unlock all tiers.
  // REFUSED in production — it would disable all metering and branding, so a
  // leaked env var must never be able to hand out clean unlimited renders.
  const bypassRequested = process.env.BYPASS_QUOTA === "true";
  const isProd = process.env.NODE_ENV === "production";
  if (bypassRequested && isProd) {
    console.error("[quota] BYPASS_QUOTA=true is set in PRODUCTION — ignoring it. Remove the env var.");
  }
  if ((bypassRequested && !isProd) || !db) {
    return {
      allowed: true, usedMinutes: 0, limitMinutes: 9999,
      usedRenders: 0, maxRenders: null, unit: "minute",
      tier: "pro", periodStart: new Date(), fraction: 0,
    };
  }

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (!sub) {
    return {
      allowed: false, usedMinutes: 0, limitMinutes: 0,
      usedRenders: 0, maxRenders: 0, unit: "animation",
      tier: "free", periodStart: new Date(), fraction: 1,
    };
  }

  const tier = sub.tier as Tier;
  const maxRenders = TIERS[tier]?.maxRenders ?? null;
  const periodStart = sub.currentPeriodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [row] = await db
    .select({
      total: sum(schema.renderLogs.durationSeconds),
      renders: count(schema.renderLogs.id),
    })
    .from(schema.renderLogs)
    .where(and(
      eq(schema.renderLogs.userId, userId),
      gte(schema.renderLogs.createdAt, periodStart),
      eq(schema.renderLogs.status, "completed"),
    ));

  // Drizzle sum() returns a decimal string or null; Number() handles both safely.
  const usedSeconds = Math.max(0, Number(row?.total ?? 0) || 0);
  const usedMinutes = usedSeconds / 60;
  const usedRenders = Math.max(0, Number(row?.renders ?? 0) || 0);
  const limitMinutes = sub.minutesLimit ?? 0;

  // Count-metered tiers (Free) bind on render count; paid tiers bind on minutes.
  const unit: "animation" | "minute" = maxRenders != null ? "animation" : "minute";
  const allowed = maxRenders != null
    ? usedRenders < maxRenders
    : limitMinutes > 0 && usedMinutes < limitMinutes;
  const fraction = maxRenders != null
    ? Math.min(maxRenders > 0 ? usedRenders / maxRenders : 1, 1)
    : Math.min(limitMinutes > 0 ? usedMinutes / limitMinutes : 1, 1);

  return {
    allowed,
    usedMinutes: Math.round(usedMinutes * 10) / 10,
    limitMinutes,
    usedRenders,
    maxRenders,
    unit,
    tier,
    periodStart,
    fraction,
  };
}
