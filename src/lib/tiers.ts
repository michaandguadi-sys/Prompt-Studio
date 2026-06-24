export type Tier = "free" | "creator" | "teams" | "custom" | "agency";

export type TierConfig = {
  label: string;
  minutesPerMonth: number;
  /**
   * Hard cap on the number of rendered animations per billing period.
   * `null` = no count cap (the tier is metered by render minutes instead).
   * The Free tier uses this to allow a few trial animations.
   */
  maxRenders: number | null;
  priceUSD: number;
  /**
   * Renders run on the user's own machine via the self-hosted agent → zero
   * marginal render cost, so paid tiers are effectively UNLIMITED. We back this
   * with a very high `minutesPerMonth` sentinel (so the quota never binds) and
   * this flag drives the "Unlimited" copy in the UI.
   */
  unlimited?: boolean;
  /** Contact-only tier — shown as a strip, not a checkout card. */
  contact?: boolean;
  /** Stripe price ID — set via env after Stripe products are created */
  stripePriceId: string | null;
  features: string[];
};

// Sentinel "minutes" for unlimited tiers — high enough to never bind the quota.
const UNLIMITED_MIN = 100000;

/**
 * Pricing strategy (2026-06): the moat is the self-hosted render agent — renders
 * cost us nothing, so every paid tier gets UNLIMITED 4K renders (something
 * cloud-render competitors can't offer). Free is metered by animation count +
 * watermark as the acquisition / virality loop.
 *
 * NOTE: tier IDs are kept stable (creator/teams/custom/agency) so DB rows, the
 * Stripe price env vars, and tierFromStripePrice don't churn. The customer-facing
 * ladder is: Free · Creator $19 · Pro $39 (id `teams`) · Studio $99 (id `custom`)
 * · Enterprise (id `agency`, contact-only).
 */
export const TIERS: Record<Tier, TierConfig> = {
  free: {
    label: "Free",
    minutesPerMonth: 10, // cosmetic — Free is gated by maxRenders, not minutes
    maxRenders: 3,
    priceUSD: 0,
    stripePriceId: null,
    features: ["3 animations / month", "1080p export", "Watermark", "All scene types"],
  },
  creator: {
    label: "Creator",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 19,
    unlimited: true,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR ?? null,
    features: ["Unlimited 4K renders", "No watermark", "All styles + looks", "GPS track flythroughs", "Public share links"],
  },
  // id `teams` → the Pro tier
  teams: {
    label: "Pro",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 39,
    unlimited: true,
    stripePriceId: process.env.STRIPE_PRICE_TEAMS ?? null,
    features: ["Everything in Creator", "AI Director (premium model)", "Story arcs — multi-scene films", "Brand kits + NLE / FCPXML export", "Priority render queue"],
  },
  // id `custom` → the Studio tier
  custom: {
    label: "Studio",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 99,
    unlimited: true,
    stripePriceId: process.env.STRIPE_PRICE_CUSTOM ?? null,
    features: ["Everything in Pro", "3 team seats", "White-label share viewer", "Early access to new features", "Priority support"],
  },
  // id `agency` → Enterprise (contact-only)
  agency: {
    label: "Enterprise",
    minutesPerMonth: UNLIMITED_MIN,
    maxRenders: null,
    priceUSD: 0,
    unlimited: true,
    contact: true,
    stripePriceId: process.env.STRIPE_PRICE_AGENCY ?? null,
    features: ["Everything in Studio", "Unlimited seats", "Custom integrations / API", "Dedicated support + SLA"],
  },
};

export function tierFromStripePrice(priceId: string): Tier | null {
  for (const [tier, cfg] of Object.entries(TIERS)) {
    if (cfg.stripePriceId === priceId) return tier as Tier;
  }
  return null;
}
