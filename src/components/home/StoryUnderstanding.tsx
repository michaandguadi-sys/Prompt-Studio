"use client";

import React, { useMemo } from "react";
import { MapPin, ArrowRight, Film, Globe2 } from "lucide-react";
import { interpret } from "@/lib/parse";
import { coordsFor, isLikelyPlaceName } from "./worldCoords";
import { looksNoisy } from "./mapPreview";

/**
 * StoryUnderstanding — the director's live read of a prompt, as glass chips:
 * establishing region · journey places · style · runtime. Uses the same instant
 * intent engine that drives the map. SHARED by both loaders (the /home
 * GeneratingOverlay and the landing BuildFlow) so the "the AI understood my
 * story" moment is authored — and improved — in exactly one place.
 *
 * Pure presentation: no animation baked in (callers wrap it to control entrance
 * + reduced-motion). Renders nothing when there's nothing yet understood.
 */

export type Understanding = {
  journey: string[];
  style: string | null;
  context: string | null;
  dur: number;
};

/** Derive the understanding from a prompt (or null when there's nothing to show). */
export function deriveUnderstanding(idea: string | undefined): Understanding | null {
  const t = (idea ?? "").trim();
  if (t.length < 2) return null;
  try {
    const it = interpret(t);
    // Gazetteer-gate the names (same rule as the map) so trailing style words
    // ("…vintage atlas") never render as a location chip.
    const raw = it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations;
    const journey = raw.filter((n) => !looksNoisy(n) && (coordsFor(n) || isLikelyPlaceName(n, t))).slice(0, 4);
    if (journey.length === 0 && !it.style) return null;
    return { journey, style: it.style?.style ?? null, context: it.context, dur: it.durationSec > 0 ? Math.round(it.durationSec) : 0 };
  } catch { return null; }
}

export const StoryUnderstanding: React.FC<{ idea?: string } & React.HTMLAttributes<HTMLDivElement>> = ({ idea, className = "", ...rest }) => {
  const u = useMemo(() => deriveUnderstanding(idea), [idea]);
  if (!u) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`} {...rest}>
      {u.context && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#2FE0FF]/30 bg-[#2FE0FF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7fe9ff]">
          <Globe2 size={10} /> {u.context}
        </span>
      )}
      {u.journey.map((p, i) => (
        <span key={`${p}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={11} className="text-[#6E7BFF]/70" />}
          <span className="inline-flex items-center gap-1 rounded-full border border-[#6E7BFF]/35 bg-[#6E7BFF]/12 px-2 py-0.5 text-[11px] font-medium text-[#aab4ff]">
            <MapPin size={10} /> {p}
          </span>
        </span>
      ))}
      {u.style && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#B57BFF]/30 bg-[#B57BFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#d3b3ff]">
          <Film size={10} /> {u.style}
        </span>
      )}
      {u.dur > 0 && (
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/45">~{u.dur}s</span>
      )}
    </div>
  );
};
