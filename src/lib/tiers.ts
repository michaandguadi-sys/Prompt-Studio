export type Tier = "free" | "creator" | "teams" | "custom" | "agency";

export type TierConfig = {
  label: string;
  minutesPerMonth: number;
  /**
   * Hard cap on the number of rendered animations per billing period.
   * `null` = no count cap (the tier is metered by render minutes instead).
   * The Free tier uses this to allow exactly one trial animation.
   */
  maxRenders: number | null;
  priceUSD: number;
  /** Stripe price ID — set via env after Stripe products are created */
  stripePriceId: string | null;
  features: string[];
};

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    label: "Free",
    // Free is gated by animation count (maxRenders), not minutes — this value
    // is cosmetic headroom so the minutes meter never binds before the cap.
    minutesPerMonth: 10,
    maxRenders: 1,
    priceUSD: 0,
    stripePriceId: null,
    features: ["1 free animation", "1080p export", "Watermark on export", "All scene types"],
  },
  creator: {
    label: "Creator",
    minutesPerMonth: 250,
    maxRenders: null,
    priceUSD: 30,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR ?? null,
    features: ["250 render min/mo", "4K exports", "No watermark", "Brand preset", "Priority queue"],
  },
  teams: {
    label: "Teams",
    minutesPerMonth: 800,
    maxRenders: null,
    priceUSD: 60,
    stripePriceId: process.env.STRIPE_PRICE_TEAMS ?? null,
    features: ["800 render min/mo", "4K exports", "Multi-user (up to 5)", "Shared asset library", "Priority queue"],
  },
  custom: {
    label: "Custom",
    minutesPerMonth: 1500,
    maxRenders: null,
    priceUSD: 100,
    stripePriceId: process.env.STRIPE_PRICE_CUSTOM ?? null,
    features: ["1500 render min/mo (negotiable)", "All Teams features", "Custom branding", "Dedicated support"],
  },
  agency: {
    label: "Agency",
    minutesPerMonth: 1500,
    maxRenders: null,
    priceUSD: 120,
    stripePriceId: process.env.STRIPE_PRICE_AGENCY ?? null,
    features: ["1500 render min/mo", "White-label", "Unlimited seats", "Custom integrations", "SLA"],
  },
};

export function tierFromStripePrice(priceId: string): Tier | null {
  for (const [tier, cfg] of Object.entries(TIERS)) {
    if (cfg.stripePriceId === priceId) return tier as Tier;
  }
  return null;
}
