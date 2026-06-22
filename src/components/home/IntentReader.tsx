"use client";

import React, { useMemo } from "react";
import { MapPin, ArrowRight, Globe2, Film, Clapperboard, Sparkles, Check, Wand2 } from "lucide-react";
import { interpret } from "@/lib/parse";

/**
 * The "reads-your-mind" layer. As the user types, the rule-based `interpret()`
 * engine runs LIVE, client-side, with zero latency — and we render the
 * director's growing understanding of the sentence: the places it found, the
 * era it'll establish, the journey, the look it'll grade with, and how
 * confidently it can already direct it. The film, previewed before you commit.
 *
 * Pure presentation over the existing parser — no network, no model, instant.
 */

const STYLE_SWATCH: Record<string, [string, string, string]> = {
  cinematic: ["#0a0f1f", "#1b2550", "#6E7BFF"],
  documentary: ["#0c1018", "#23303f", "#2FE0FF"],
  noir: ["#050507", "#161616", "#8a8f9c"],
  vintage: ["#1a1206", "#3a2a12", "#caa15a"],
  antique: ["#1a1206", "#3a2a12", "#caa15a"],
  luxury: ["#0a0a0c", "#241a2e", "#B57BFF"],
  adventure: ["#06140f", "#123a2a", "#36d39a"],
  conflict: ["#160606", "#3a1212", "#ff5a5a"],
  minimal: ["#0a0c12", "#1b2030", "#9fb0d0"],
};
const swatchFor = (style?: string): [string, string, string] =>
  (style && STYLE_SWATCH[style.toLowerCase()]) || ["#0a0f1f", "#1b2550", "#6E7BFF"];

const ACTION_VERB: Record<string, string> = {
  highlight: "Reveal", camera: "Fly to", route: "Journey", mixed: "Direct", unknown: "Map",
};

/** A single understanding token — a glowing glass chip that springs in. */
const Chip: React.FC<{ children: React.ReactNode; tone?: "iris" | "cyan" | "violet" | "amber" | "muted"; i: number }> = ({ children, tone = "muted", i }) => {
  const tones: Record<string, string> = {
    iris: "border-[#6E7BFF]/40 bg-[#6E7BFF]/12 text-iris",
    cyan: "border-[#2FE0FF]/40 bg-[#2FE0FF]/10 text-[#0e7d92]",
    violet: "border-[#B57BFF]/40 bg-[#B57BFF]/10 text-[#7b4fc7]",
    amber: "border-amber-300/40 bg-amber-300/10 text-amber-700",
    muted: "border-line bg-graphite/[0.04] text-graphite/70",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium backdrop-blur-md ${tones[tone]}`}
      style={{ animation: `intentChipIn 0.42s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both` }}
    >
      {children}
    </span>
  );
};

export const IntentReader: React.FC<{ text: string }> = ({ text }) => {
  const trimmed = text.trim();
  const it = useMemo(() => {
    if (trimmed.length < 2) return null;
    try { return interpret(trimmed); } catch { return null; }
  }, [trimmed]);

  // Confidence drives the right-hand "lock" — the moment it feels ready to shoot.
  const conf = it ? Math.round(it.confidence * 100) : 0;
  const ready = conf >= 62;
  const locations = it?.locations ?? [];
  const sw = swatchFor(it?.style?.style);

  return (
    <div className="relative mx-auto mt-4 max-w-2xl">
      <style>{`
        @keyframes intentChipIn { 0%{opacity:0; transform:translateY(7px) scale(0.94)} 100%{opacity:1; transform:none} }
        @keyframes intentThink { 0%,100%{opacity:.35; transform:scale(.85)} 50%{opacity:1; transform:scale(1)} }
        @keyframes intentSweep { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
      `}</style>

      <div className="rounded-2xl border border-line bg-white/85 px-4 py-3 shadow-floaty backdrop-blur-xl">
        {/* Header row: live status + confidence lock */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full rounded-full"
                style={{ background: ready ? "#36d39a" : "#6E7BFF", animation: trimmed ? "intentThink 1.4s ease-in-out infinite" : undefined }}
              />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-graphite/50">
              {trimmed.length < 2 ? "Listening" : ready ? "Ready to direct" : "Reading your story"}
            </span>
          </div>
          {trimmed.length >= 2 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium tabular-nums text-graphite/40">{conf}%</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-graphite/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${conf}%`,
                    background: ready
                      ? "linear-gradient(90deg,#36d39a,#2FE0FF)"
                      : "linear-gradient(90deg,#6E7BFF,#2FE0FF,#B57BFF)",
                    backgroundSize: "200% 100%",
                    animation: "intentSweep 3s linear infinite",
                  }}
                />
              </div>
              {ready ? <Check size={13} className="text-[#36d39a]" /> : <Wand2 size={12} className="text-graphite/40" />}
            </div>
          )}
        </div>

        {/* The understanding itself */}
        {trimmed.length < 2 ? (
          <p className="py-1.5 text-[13px] leading-relaxed text-graphite/45">
            Describe a place, an era, a journey, a conflict — I&rsquo;m already composing it as you type.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Spell corrections — the quiet "I fixed that for you" */}
            {it?.corrections.slice(0, 2).map((c, k) => (
              <Chip key={`c${k}`} tone="amber" i={k}>
                <span className="text-amber-700/60 line-through">{c.from}</span>
                <ArrowRight size={10} className="opacity-50" />
                {c.to}
              </Chip>
            ))}

            {/* Establishing region */}
            {it?.context && (
              <Chip tone="cyan" i={2}><Globe2 size={11} /> Establish {it.context}</Chip>
            )}

            {/* A journey reads as a flowing route */}
            {it?.route ? (
              <Chip tone="iris" i={3}>
                <MapPin size={11} />
                <span className="inline-flex items-center gap-1">
                  {it.route.from}
                  {[...it.route.via, it.route.to].map((p, k) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <ArrowRight size={10} className="text-iris/60" /> {p}
                    </span>
                  ))}
                </span>
              </Chip>
            ) : (
              locations.slice(0, 4).map((l, k) => (
                <Chip key={`l${k}`} tone="iris" i={3 + k}>
                  <MapPin size={11} /> {ACTION_VERB[it?.action ?? "unknown"]} {l}
                </Chip>
              ))
            )}

            {locations.length > 4 && <Chip tone="muted" i={7}>+{locations.length - 4} more</Chip>}

            {/* The look it'll grade with — a live style swatch */}
            {it?.style && (
              <Chip tone="violet" i={8}>
                <span
                  className="h-3.5 w-3.5 rounded-[4px] ring-1 ring-graphite/15"
                  style={{ background: `linear-gradient(135deg, ${sw[0]} 0%, ${sw[1]} 55%, ${sw[2]} 100%)` }}
                />
                {it.style.style} · {it.style.mapTheme}
              </Chip>
            )}

            {/* Runtime */}
            {it && (
              <Chip tone="muted" i={9}><Clapperboard size={11} /> ~{it.durationSec}s</Chip>
            )}

            {/* Nothing concrete yet — keep it warm, never an error */}
            {it && !it.context && !it.route && locations.length === 0 && (
              <Chip tone="muted" i={2}>
                <Sparkles size={11} className="text-iris/60" /> I&rsquo;ll research the facts and design the beats
              </Chip>
            )}
          </div>
        )}

        {/* The director's one-line plan — the "here's the film" payoff */}
        {ready && it && (
          <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5 text-[12px] text-graphite/60">
            <Film size={12} className="shrink-0 text-iris" />
            <span className="truncate">{it.preview.slice(0, 3).join("   ·   ")}</span>
          </div>
        )}
      </div>
    </div>
  );
};
