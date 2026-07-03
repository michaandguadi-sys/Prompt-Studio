"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight, Check, Wand2 } from "lucide-react";
import { SIGNATURE_STYLES } from "@/lib/presets/signatureStyles";
import { fontStack } from "@/v2/doc/themes";

/**
 * First-run onboarding — 3 progressive steps:
 *   1. Use case  → who the creator is
 *   2. Visual style → picks a SIGNATURE_STYLE; stored + broadcast so AiIdeaBox
 *      pre-selects it immediately (the choice has real authority)
 *   3. Starter idea → pre-fills the prompt with a curated example
 *
 * Style references are grounded in proven real-world journalism/documentary
 * archetypes (NYT editorial, Nat Geo, Al Jazeera, etc.).
 * Shown once (localStorage-gated); fully skippable at any step.
 */

export const SEEN_KEY    = "mapanisy-onboarded";
export const PERSONA_KEY = "mapanisy-persona";
export const SEED_KEY    = "mapanisy-seed-prompt";
export const STYLE_KEY   = "mapanisy-style"; // shared with AiIdeaBox

// ─── Use cases ────────────────────────────────────────────────────────────────

type UseCase = {
  id: string;
  label: string;
  subtitle: string;
  emoji: string;
  recommendedStyles: string[]; // SIGNATURE_STYLE ids, ranked
};

const USE_CASES: UseCase[] = [
  { id:"news",        label:"News & Journalism",  subtitle:"Conflicts, elections, breaking stories", emoji:"📰", recommendedStyles:["editorial","war-room"]          },
  { id:"documentary", label:"Documentary",         subtitle:"History, timelines, real events",        emoji:"🎬", recommendedStyles:["expedition-1900","editorial"]    },
  { id:"travel",      label:"Travel & Adventure", subtitle:"Routes, journeys, destinations",         emoji:"🌍", recommendedStyles:["terra-verde","expedition-1900"]  },
  { id:"education",   label:"Education",           subtitle:"Explainers, geography, research",        emoji:"🎓", recommendedStyles:["editorial","neo-atlas"]          },
  { id:"data",        label:"Data & Business",     subtitle:"Stats, trends, supply chains",           emoji:"📊", recommendedStyles:["neo-atlas","editorial"]          },
  { id:"other",       label:"Something else",      subtitle:"Creative, experimental or personal",     emoji:"✦",  recommendedStyles:["editorial"]                      },
];

// ─── Starter ideas per use case ───────────────────────────────────────────────

const IDEAS: Record<string, string[]> = {
  news:        ["Russia–Ukraine: two years of frontline shifts",     "The global semiconductor supply chain crisis",  "Mediterranean migration routes, 2024"],
  documentary: ["The fall of the Roman Empire across three centuries","How the Silk Road connected East and West",    "Magellan's circumnavigation of the globe"],
  travel:      ["My road trip from Lisbon to Istanbul",              "Hiking the Inca Trail to Machu Picchu",        "Island-hopping across the Greek islands"],
  education:   ["The breakup of Pangaea over 200 million years",     "Population growth in Asia since 1950",         "The spread of the Black Death across Europe"],
  data:        ["Global CO₂ emissions by country, 2000–2024",        "The world's busiest shipping lanes",           "Tech investment hubs by venture capital"],
  other:       ["The expansion of an empire over time",              "A cinematic journey from A to B",              "Highlight a country and its neighbours"],
};

// ─── Style reference metadata ─────────────────────────────────────────────────
// Grounded in research: these are the proven journalism/documentary archetypes.

const STYLE_REFS: Record<string, { ref: string; color: string }> = {
  "war-room":        { ref:"Al Jazeera · Reuters",     color:"#ff5a44" },
  "expedition-1900": { ref:"National Geographic · PBS", color:"#c9a35c" },
  "editorial":       { ref:"NYT · Vox · BBC",           color:"#6E7BFF" },
  "neo-atlas":       { ref:"FiveThirtyEight · WIRED",   color:"#4ab8ff" },
  "noir-dossier":    { ref:"Investigative · Film noir", color:"#999"    },
  "terra-verde":     { ref:"Travel · Nature · Routes",  color:"#2ec4b6" },
};

function cardTexture(id: string): React.CSSProperties {
  switch (id) {
    case "noir-dossier":    return { backgroundImage:"repeating-linear-gradient(0deg,rgba(0,0,0,0.4) 0 1px,transparent 1px 3px)" };
    case "neo-atlas":       return { backgroundImage:"linear-gradient(rgba(255,255,255,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.12) 1px,transparent 1px)", backgroundSize:"9px 9px" };
    case "war-room":        return { backgroundImage:"radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.55) 100%)" };
    case "expedition-1900": return { backgroundImage:"radial-gradient(ellipse at center,rgba(243,230,200,0.18) 0%,transparent 60%),radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.4) 110%)" };
    default:                return { backgroundImage:"radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.35) 115%)" };
  }
}

// Progress dots
const Steps: React.FC<{ current: number }> = ({ current }) => (
  <div className="mb-5 flex items-center gap-2">
    {[1,2,3].map(s => (
      <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === current ? "w-6 bg-iris" : s < current ? "w-1.5 bg-iris/40" : "w-1.5 bg-black/10"}`} />
    ))}
    <span className="ml-auto text-[10px] font-medium tabular-nums text-graphite/35">{current} / 3</span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const OnboardingModal: React.FC = () => {
  const [open,    setOpen]    = useState(false);
  const [step,    setStep]    = useState(1);
  const [ucId,    setUcId]    = useState<string | null>(null);
  const [styleId, setStyleId] = useState("auto");

  useEffect(() => {
    try { if (!localStorage.getItem(SEEN_KEY)) setOpen(true); } catch { /* SSR */ }
  }, []);

  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setOpen(false);
  };

  const pickUseCase = (id: string) => {
    setUcId(id);
    try { localStorage.setItem(PERSONA_KEY, id); } catch {}
    // Pre-select the top recommended style for this use case so step 2 feels curated
    const top = USE_CASES.find(u => u.id === id)?.recommendedStyles[0] ?? "auto";
    setStyleId(top);
    setStep(2);
  };

  const commitStyle = () => {
    // Persist + broadcast → AiIdeaBox will react immediately
    try { localStorage.setItem(STYLE_KEY, styleId); } catch {}
    window.dispatchEvent(new CustomEvent("mapanisy-style", { detail: styleId }));
    setStep(3);
  };

  const tryIdea = (idea: string) => {
    try { localStorage.setItem(SEED_KEY, idea); } catch {}
    window.dispatchEvent(new CustomEvent("mapanisy-seed", { detail: idea }));
    close();
  };

  const uc        = USE_CASES.find(u => u.id === ucId);
  const recs      = uc?.recommendedStyles ?? [];
  const ideas     = IDEAS[ucId ?? "other"] ?? IDEAS.other;
  const styleName = styleId === "auto"
    ? "Director's choice"
    : SIGNATURE_STYLES.find(s => s.id === styleId)?.name ?? styleId;

  // Recommended styles first, then the rest
  const sortedStyles = [
    ...SIGNATURE_STYLES.filter(s => recs.includes(s.id)),
    ...SIGNATURE_STYLES.filter(s => !recs.includes(s.id)),
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <button onClick={close} aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-graphite/35 transition-colors hover:bg-black/5 hover:text-graphite">
          <X size={16} />
        </button>

        {/* Aurora header */}
        <div className="aurora-bg" style={{ height:160 }} />

        <div className="relative px-7 pb-7 pt-6">
          <Steps current={step} />

          {/* ─── Step 1: Use case ──────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-graphite/40">
                Welcome to Mapanisy
              </div>
              <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-graphite">
                What are you creating?
              </h2>
              <p className="mb-5 text-[13px] leading-relaxed text-graphite/55">
                Choose your content type — we'll recommend the right visual style and starter ideas.
              </p>

              <div className="grid grid-cols-3 gap-2.5">
                {USE_CASES.map(uc => (
                  <button key={uc.id} onClick={() => pickUseCase(uc.id)}
                    className="group flex flex-col items-start gap-1.5 rounded-xl border border-line bg-white px-3.5 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-iris/60 hover:bg-iris/[0.04] hover:shadow-md">
                    <span className="text-xl leading-none">{uc.emoji}</span>
                    <span className="text-[12.5px] font-semibold text-graphite">{uc.label}</span>
                    <span className="text-[10.5px] leading-snug text-graphite/45">{uc.subtitle}</span>
                  </button>
                ))}
              </div>

              <button onClick={close}
                className="mt-5 text-[11px] text-graphite/35 transition-colors hover:text-graphite">
                Skip — I'll explore on my own
              </button>
            </>
          )}

          {/* ─── Step 2: Style pick ─────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-iris/70">
                Step 2 · Visual style
              </div>
              <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-graphite">Pick your look</h2>
              <p className="mb-4 text-[13px] leading-relaxed text-graphite/55">
                Locks in colour grade, typography and map treatment.
                {recs.length > 0 && (
                  <> <span className="font-semibold text-iris">✦ Highlighted</span> = recommended for {uc?.label}.</>
                )}
              </p>

              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {/* Director's choice */}
                <button onClick={() => setStyleId("auto")}
                  className={`overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 ${styleId === "auto" ? "border-iris ring-2 ring-iris/25" : "border-line hover:border-iris/40"}`}>
                  <div className="relative flex h-[68px] items-center justify-center overflow-hidden"
                    style={{ background:"conic-gradient(from 210deg at 60% 40%,#0a0303,#161009,#02060c,#05060e,#03100c,#0a0303)" }}>
                    <Wand2 size={20} className="text-white/80 drop-shadow" />
                    {styleId === "auto" && (
                      <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-iris">
                        <Check size={9} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <div className="text-[11.5px] font-semibold text-graphite">Director's choice</div>
                    <div className="text-[10px] text-graphite/38">AI picks the best look</div>
                  </div>
                </button>

                {/* Signature style cards */}
                {sortedStyles.map(s => {
                  const active      = styleId === s.id;
                  const recommended = recs.includes(s.id);
                  const ref         = STYLE_REFS[s.id];
                  return (
                    <button key={s.id} onClick={() => setStyleId(s.id)}
                      className={`overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 ${active ? "border-iris ring-2 ring-iris/25" : "border-line hover:border-iris/40"}`}>
                      <div className="relative h-[68px] overflow-hidden"
                        style={{ background:`linear-gradient(140deg,${s.swatches[0]} 0%,${s.swatches[0]} 52%,${s.swatches[1]} 52%,${s.swatches[1]} 78%,${s.swatches[2]} 78%)` }}>
                        <div className="absolute inset-0" style={cardTexture(s.id)} />
                        <span className="absolute bottom-1 left-2 text-[18px] font-bold leading-none text-white drop-shadow-md"
                          style={{ fontFamily:fontStack(s.fontDisplay) }}>Aa</span>
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full"
                          style={{ background:s.swatches[2], boxShadow:`0 0 8px ${s.swatches[2]}` }} />
                        {recommended && !active && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold leading-none text-iris">
                            ✦ For you
                          </span>
                        )}
                        {active && (
                          <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-iris">
                            <Check size={9} color="white" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="text-[11.5px] font-semibold text-graphite">{s.name}</div>
                        {ref && (
                          <div className="truncate text-[10px]" style={{ color:ref.color, opacity:0.85 }}>
                            {ref.ref}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setStep(1)}
                  className="text-[12px] text-graphite/38 transition-colors hover:text-graphite">
                  ← Back
                </button>
                <button onClick={commitStyle}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-all hover:-translate-y-0.5">
                  Next <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* ─── Step 3: Starter idea ──────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-iris/70">
                Step 3 · First animation
              </div>
              <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-graphite">Try one of these</h2>
              <p className="mb-4 text-[13px] leading-relaxed text-graphite/55">
                Tap an idea — it drops into the prompt box with your{" "}
                <span className="font-semibold text-graphite/80">{styleName}</span>{" "}
                style ready to go.
              </p>

              <div className="space-y-2.5">
                {ideas.map(idea => (
                  <button key={idea} onClick={() => tryIdea(idea)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-iris hover:bg-iris/[0.04] hover:shadow-md">
                    <span className="text-[14px] leading-snug text-graphite/80">{idea}</span>
                    <ArrowRight size={15} className="shrink-0 text-iris" />
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <button onClick={() => setStep(2)}
                  className="text-[12px] text-graphite/38 transition-colors hover:text-graphite">
                  ← Back
                </button>
                <button onClick={close}
                  className="text-[12px] text-graphite/38 transition-colors hover:text-graphite">
                  Start from scratch →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
