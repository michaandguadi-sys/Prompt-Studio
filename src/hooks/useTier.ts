"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/lib/tiers";

/**
 * Fetches the current user's subscription tier from /api/quota once on mount.
 *
 * Used by the browser preview + Quick Export paths to decide whether to show
 * the Free-tier watermark. The authoritative watermark decision for 4K agent
 * renders is made server-side in /api/agent/render — this hook only drives the
 * client-side preview/Quick-Export overlay so Free users can't sidestep it via
 * the in-browser recorder.
 *
 * Defaults to a non-watermarked state while loading so paid users never flash a
 * watermark; the Free path resolves within one request.
 */
export type UseTierResult = {
  tier: Tier | null;
  loading: boolean;
  /** True only once we've confirmed the user is on the Free plan. */
  watermark: boolean;
  /** Metering mode for the resolved tier; null until loaded. */
  unit: "animation" | "minute" | null;
  /** Completed renders this period (count-metered tiers). */
  usedRenders: number | null;
  /** Animation cap for count-metered tiers; null when metered by minutes. */
  maxRenders: number | null;
};

export function useTier(): UseTierResult {
  const [state, setState] = useState<{
    tier: Tier | null;
    unit: "animation" | "minute" | null;
    usedRenders: number | null;
    maxRenders: number | null;
  }>({ tier: null, unit: null, usedRenders: null, maxRenders: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quota");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) {
          setState({
            tier: (data?.tier as Tier) ?? null,
            unit: data?.unit ?? null,
            usedRenders: typeof data?.usedRenders === "number" ? data.usedRenders : null,
            maxRenders: typeof data?.maxRenders === "number" ? data.maxRenders : null,
          });
        }
      } catch {
        if (!cancelled) setState({ tier: null, unit: null, usedRenders: null, maxRenders: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    tier: state.tier,
    loading,
    watermark: state.tier === "free",
    unit: state.unit,
    usedRenders: state.usedRenders,
    maxRenders: state.maxRenders,
  };
}
