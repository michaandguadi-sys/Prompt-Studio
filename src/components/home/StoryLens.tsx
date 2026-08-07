"use client";

import React from "react";
import { MapPin, ArrowRight, Film, Globe2, Sparkles, Clapperboard, Check } from "lucide-react";
import type { Interpretation } from "@/lib/parse/intent";

/** The verb the director will apply — shown only when it adds meaning the
 *  journey chain doesn't already imply (route arrows already read as a journey). */
const ACTION_VERB: Partial<Record<Interpretation["action"], string>> = {
  highlight: "Reveal",
  camera: "Fly to",
};

/**
 * StoryLens — the dark-glass strip under the prompt that turns the intent
 * engine's live understanding into two addictive feedback loops:
 *
 *   1. THE JOURNEY — the story's stops as a flowing timeline; every place you
 *      type clicks into the chain (and blooms on the map behind).
 *   2. STORY RICHNESS — not a score, a creative meter: Simple → Detailed →
 *      Cinematic, with ONE gentle hint for the next detail worth adding.
 *
 * Pure presentation over `interpret()` — zero network, every keystroke counts.
 */

export type Richness = { level: 0 | 1 | 2 | 3 | 4 | 5; label: string; hint: string | null };

/** Score the prompt's craft — and pick the single most useful next hint. */
export function scoreRichness(text: string, it: Interpretation | null): Richness {
  const t = text.toLowerCase();
  const hasPlace = !!it && (it.locations.length > 0 || !!it.route || !!it.context);
  const hasJourney = !!it?.route || (it?.locations.length ?? 0) >= 2;
  const hasStyle = !!it?.style;
  const hasMood = /\b(moody|epic|dramatic|calm|serene|dark|golden|dawn|dusk|night|sunset|sunrise|mysterious|nostalgic|triumphant|tense|hopeful|melancholic|vibrant)\b/.test(t);
  const hasCamera = /\b(fly|flythrough|fly-through|orbit|zoom|sweep|pan|push|dive|soar|swoop|glide|aerial|bird'?s|drone|dolly|track(?:ing)? shot)\b/.test(t);
  const hasTransport = /\b(train|plane|flight|car|road|drive|driving|boat|sail|ship|ferry|bike|cycling|hike|hiking|walk|trek|helicopter|motorcycle|van|bus)\b/.test(t);
  const hasTime = /\b(\d{4}|century|summer|winter|spring|autumn|fall of|era|ancient|medieval|day \d+|week|month)\b/.test(t);

  let pts = 0;
  if (hasPlace) pts++;
  if (hasJourney) pts++;
  if (hasStyle || hasMood) pts++;
  if (hasCamera) pts++;
  if (hasTransport || hasTime || text.trim().length > 90) pts++;
  const level = Math.min(5, pts) as Richness["level"];

  const label = level <= 1 ? "Simple" : level <= 3 ? "Detailed" : "Cinematic";

  let hint: string | null = null;
  if (text.trim().length >= 8) {
    if (!hasPlace) hint = "Name a place — a city, country, or mountain range.";
    else if (!hasStyle && !hasMood) hint = "Try naming the mood — golden hour, moody, epic…";
    else if (!hasCamera) hint = "Describe the camera — “slow orbit”, “fly through”, “zoom out”…";
    else if (hasJourney && !hasTransport) hint = "Say how you travel — by train, plane, sailboat…";
    else if (!hasTime) hint = "Anchor it in time — “1989”, “at dawn”, “summer 2024”…";
  }
  return { level, label, hint };
}

export const StoryLens: React.FC<{
  text: string;
  it: Interpretation | null;
  /** VERIFIED place names (parent gates them against the gazetteer/geocoder) —
   *  so a style word like "playful" never shows up as a journey stop. */
  journey?: string[];
}> = ({ text, it, journey: journeyProp }) => {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  const rich = scoreRichness(text, it);
  const journey: string[] = (journeyProp ?? (it?.route
    ? [it.route.from, ...it.route.via, it.route.to]
    : (it?.locations ?? []))).slice(0, 5);

  // Signals the intent engine already resolved — surfaced so the panel reflects
  // what the director UNDERSTOOD and will DO, not just the words typed.
  const verb = it ? (ACTION_VERB[it.action] ?? "") : "";
  const corrections = (it?.corrections ?? []).slice(0, 2);
  const showExpansion = !!it?.expandedFrom && it.expandedFrom !== it.context;
  const durationSec = it && it.durationSec > 0 ? Math.round(it.durationSec) : 0;

  return (
    <div
      className="mx-auto mt-3 max-w-2xl rounded-2xl border border-white/[0.09] bg-white/[0.05] px-4 py-3 backdrop-blur-2xl"
      style={{ animation: "lensRise 0.4s cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <style>{`
        @keyframes lensRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes lensChip { from { opacity: 0; transform: translateY(6px) scale(0.92); } to { opacity: 1; transform: none; } }
        @keyframes lensDot  { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>

      {/* ── Quiet spell-fix moment: "frnace → France, handled" ── */}
      {corrections.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium text-white/30">Fixed</span>
          {corrections.map((c, i) => (
            <span key={`${c.from}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-[#36d39a]/25 bg-[#36d39a]/10 px-2 py-0.5 text-[10.5px] font-medium text-[#7ee8c2]" style={{ animation: "lensChip 0.35s ease both" }}>
              <Check size={9} /> {c.from} → {c.to}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* ── The journey chain ── */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {journey.length > 0 ? (
            <>
              {verb && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-iris/70" style={{ animation: "lensChip 0.35s ease both" }}>{verb}</span>
              )}
              {it?.context && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#2FE0FF]/30 bg-[#2FE0FF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7fe9ff]" style={{ animation: "lensChip 0.35s ease both" }}>
                  <Globe2 size={10} /> {it.context}
                </span>
              )}
              {showExpansion && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#2FE0FF]/30 bg-[#2FE0FF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7fe9ff]" style={{ animation: "lensChip 0.35s ease both" }}>
                  <Globe2 size={10} /> {it!.expandedFrom} → {it!.locations.length} countries
                </span>
              )}
              {journey.map((p, i) => (
                <span key={`${p}-${i}`} className="inline-flex items-center gap-1.5" style={{ animation: `lensChip 0.35s ease ${i * 0.06}s both` }}>
                  {i > 0 && <ArrowRight size={11} className="text-iris/60" />}
                  <span className="inline-flex items-center gap-1 rounded-full border border-iris/35 bg-iris/12 px-2 py-0.5 text-[11px] font-medium text-[#aab4ff]">
                    <MapPin size={10} /> {p}
                  </span>
                </span>
              ))}
              {(journeyProp ?? it?.locations ?? []).length > 5 && !it?.route && (
                <span className="text-[10px] text-white/30">+{(journeyProp ?? it!.locations).length - 5} more</span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-white/35">
              <Sparkles size={11} className="text-iris/60" />
              {it?.style ? `${it.style.style} look locked — now name a place` : "I'll research the facts and design the beats"}
            </span>
          )}
          {it?.style && journey.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#B57BFF]/30 bg-[#B57BFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#d3b3ff]" style={{ animation: "lensChip 0.35s ease 0.2s both" }}>
              <Film size={10} /> {it.style.style}
            </span>
          )}
        </div>

        {/* ── Story richness meter ── */}
        <div className="flex shrink-0 items-center gap-2" title="Story richness — more craft in the prompt, more cinema in the film">
          {durationSec > 0 && (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/40" title="Estimated runtime">~{durationSec}s</span>
          )}
          <Clapperboard size={11} className={rich.level >= 4 ? "text-[#36d39a]" : "text-white/30"} />
          <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${rich.level >= 4 ? "text-[#7ee8c2]" : rich.level >= 2 ? "text-white/55" : "text-white/35"}`}>
            {rich.label}
          </span>
          <span className="flex items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-[7px] w-[7px] rounded-full"
                style={{
                  animation: i < rich.level ? `lensDot 0.3s ease ${i * 0.05}s both` : undefined,
                  background: i < rich.level
                    ? rich.level >= 4
                      ? "linear-gradient(135deg,#36d39a,#2FE0FF)"
                      : "linear-gradient(135deg,#6E7BFF,#B57BFF)"
                    : "rgba(255,255,255,0.12)",
                  boxShadow: i < rich.level && rich.level >= 4 ? "0 0 8px rgba(54,211,154,0.5)" : undefined,
                }}
              />
            ))}
          </span>
        </div>
      </div>

      {/* ── One gentle hint — never a complaint ── */}
      {rich.hint && (
        <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-white/32" style={{ animation: "lensRise 0.4s ease 0.15s both" }}>
          <span className="text-iris/70">✦</span> {rich.hint}
        </div>
      )}
    </div>
  );
};
