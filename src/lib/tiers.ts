export type Tier = "free" | "creator" | "pro";

export type TierConfig = {
  label: string;
  minutesPerMonth: number;
  /**
   * Hard cap on the number of rendered animations per billing period.
   * `null` = no count cap (the tier is metered by render minutes instead).
   * The Free tier uses this to allow a few trial animations.
   */
  maxRenders: number | null;
  /** Headline price (USD): monthly for subscriptions, one-time for lifetime, 0 for free. */
  priceUSD: number;
  /** Annual price (USD) for subscription tiers that offer a yearly discount. */
  priceAnnualUSD?: number;
  /** How this tier is sold — drives the Stripe checkout `mode` + the price copy. */
  billing: "free" | "subscription" | "lifetime";
  /**
   * Renders run on the user's own machine via the self-hosted agent → zero
   * marginal render cost, so paid tiers are effectively UNLIMITED. We back this
   * with a very high `minutesPerMonth` sentinel (so the quota never binds) and
   * this flag drives the "Unlimited" copy in the UI.
   */
  unlimited?: boolean;
  /** Early access to upcoming features — the headline Pro perk. */
  earlyAccess?: boolean;
  /** Stripe price ID for the monthly subscription OR the one-time (lifetime) price. */
  stripePriceId: string | null;
  /** Stripe price ID for the annual subscription (Creator). */
  stripePriceIdAnnual?: string | null;
  features: string[];
  /**
   * Hard resolution ceiling: `settings.scale` is server-clamped to this at
   * every render entry point (/api/v2/render, /api/agent/render,
   * /api/v2/snapshot). 1 = full 4K-class canvas (dimsFor); 0.34 ≈ 720p on the
   * 16:9 base. Client render presets are cosmetic — this is the enforcement.
   */
  maxScale: number;
  /**
   * May render on the self-hosted agent. The agent runs on the USER'S machine
   * against the public bundle, so any watermark/scale flag delivered there is
   * advisory at best — tiers whose renders carry branding or a resolution cap
   * must render on the server-authoritative cloud path instead.
   */
  agentAllowed: boolean;
};

// Sentinel "minutes" for unlimited tiers — high enough to never bind the quota.
const UNLIMITED_MIN = 100000;

/**
 * Pricing strategy (2026-07): the moat is the self-hosted render agent — renders
 * cost us nothing, so both paid tiers get UNLIMITED 4K renders. Free is metered
 * by animation count + a 720p cap + watermark as the acquisition / virality loop.
 *
 * The ladder is a clean three: Free · Creator ($7.99/mo or $40/yr — ~58% off) ·
 * Pro ($250 once, lifetime, first access to upcoming features).
 *
 * Stripe: set STRIPE_PRICE_CREATOR (monthly), STRIPE_PRICE_CREATOR_ANNUAL
 * (yearly), and STRIPE_PRICE_PRO (a ONE-TIME price) after creating the products.
 */
export const TIERS: Record<Tier, TierConfig> = {
  free: {
    label: "Free",
    minutesPerMonth: 10, // cosmetic — Free is gated by maxRenders, not minutes
    maxRenders: 3,
    priceUSD: 0,
    billing: "free",
    stripePriceId: null,
    features: ["3 animations / month", "Full AI Director & editor", "720p export", "Small watermark", "All scene types"],
    maxScale: 0.34, // 3840×2160 × 0.34 ≈ 1305×734 — the 720p class
    agentAllowed: false, // branded renders must stay on the tamper-proof cloud path
  },
  creator: {
    label: "Creator",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 7.99,
    priceAnnualUSD: 40, // $7.99×12 = $95.88 → $40/yr ≈ 58% off
    billing: "subscription",
    unlimited: true,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR ?? null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_CREATOR_ANNUAL ?? null,
    features: ["Unlimited 4K renders", "No watermark", "All styles + looks", "GPS track flythroughs", "Public share links"],
    maxScale: 1,
    agentAllowed: true,
  },
  pro: {
    label: "Pro",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 250,
    billing: "lifetime",
    unlimited: true,
    earlyAccess: true,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
    features: [
      "Everything in Creator",
      "Lifetime access — pay once",
      "First access to upcoming features",
      "AI Director — premium model",
      "Story arcs — multi-scene films",
      "Brand kits + FCPXML / NLE export",
      "Priority render queue",
    ],
    maxScale: 1,
    agentAllowed: true,
  },
};

/** Map a Stripe price ID (monthly, annual, or one-time) back to its tier. */
export function tierFromStripePrice(priceId: string): Tier | null {
  for (const [tier, cfg] of Object.entries(TIERS)) {
    if (cfg.stripePriceId === priceId || cfg.stripePriceIdAnnual === priceId) return tier as Tier;
  }
  return null;
}
