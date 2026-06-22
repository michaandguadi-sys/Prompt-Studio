"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight, Compass, Clapperboard, Newspaper, GraduationCap, Building2, Wand2 } from "lucide-react";

/**
 * First-run onboarding — the biggest activation lever. On the very first visit
 * we welcome the creator, ask what they make (persona, remembered), then offer
 * tailored starter ideas. Picking one SEEDS the prompt box (via localStorage +
 * a window event AiIdeaBox listens for) so they land one click from their first
 * render. Shown once (localStorage-gated); fully skippable.
 */
const SEEN_KEY = "mapanisy-onboarded";
const PERSONA_KEY = "mapanisy-persona";
export const SEED_KEY = "mapanisy-seed-prompt";

const PERSONAS = [
  { id: "travel", label: "Travel", icon: Compass, ideas: ["My road trip from Lisbon to Istanbul", "Hiking the Inca Trail to Machu Picchu", "Island-hopping across the Greek islands"] },
  { id: "documentary", label: "Documentary", icon: Clapperboard, ideas: ["The fall of the Berlin Wall, 1989", "The expansion of the Roman Empire", "How the Silk Road connected East and West"] },
  { id: "news", label: "News", icon: Newspaper, ideas: ["The India–Pakistan border conflict", "Global shipping through the Suez Canal", "Migration routes across the Mediterranean"] },
  { id: "education", label: "Education", icon: GraduationCap, ideas: ["The spread of the Black Death across Europe", "The breakup of Pangaea", "Magellan's voyage around the world"] },
  { id: "realestate", label: "Real estate", icon: Building2, ideas: ["A neighborhood tour of Brooklyn", "Fly into a property in the Hollywood Hills", "The best cafés in central Lisbon"] },
  { id: "other", label: "Something else", icon: Wand2, ideas: ["The expansion of an empire over time", "A cinematic journey from A to B", "Highlight a country and its neighbours"] },
];

export const OnboardingModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);

  useEffect(() => { try { if (!localStorage.getItem(SEEN_KEY)) setOpen(true); } catch { /* SSR */ } }, []);
  if (!open) return null;

  const done = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch {} setOpen(false); };
  const pick = (id: string) => { setPersona(id); try { localStorage.setItem(PERSONA_KEY, id); } catch {} };
  const tryIdea = (idea: string) => {
    try { localStorage.setItem(SEED_KEY, idea); } catch {}
    window.dispatchEvent(new CustomEvent("mapanisy-seed", { detail: idea }));
    done();
  };

  const p = PERSONAS.find((x) => x.id === persona);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={done} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white text-graphite shadow-2xl">
        <div className="aurora-bg" style={{ height: 240 }} />
        <button onClick={done} className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-graphite/45 hover:text-graphite"><X size={16} /></button>

        <div className="relative px-7 pb-7 pt-8">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-graphite/45">Welcome to Mapanisy</div>
          {!p ? (
            <>
              <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">What do you make?</h2>
              <p className="mb-5 text-[14px] text-graphite/60">Pick one and we’ll line up a few ideas to start from. You can change everything later.</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {PERSONAS.map((x) => (
                  <button key={x.id} onClick={() => pick(x.id)} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-graphite/[0.03] px-3 py-4 text-center transition-colors hover:border-iris hover:bg-iris/10">
                    <x.icon size={20} className="text-iris" />
                    <span className="text-[12px] font-medium text-graphite/85">{x.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={done} className="mt-5 text-[12px] text-graphite/45 hover:text-graphite">Skip — I’ll explore on my own</button>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">Try one of these</h2>
              <p className="mb-5 text-[14px] text-graphite/60">Tap an idea — we’ll drop it into the prompt, ready to generate. Or start from a blank one.</p>
              <div className="space-y-2">
                {p.ideas.map((idea) => (
                  <button key={idea} onClick={() => tryIdea(idea)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-graphite/[0.03] px-4 py-3 text-left transition-colors hover:border-iris hover:bg-iris/10">
                    <span className="text-[14px] text-graphite/85">{idea}</span>
                    <ArrowRight size={15} className="shrink-0 text-iris" />
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-4">
                <button onClick={() => setPersona(null)} className="text-[12px] text-graphite/45 hover:text-graphite">← Back</button>
                <button onClick={done} className="text-[12px] text-graphite/45 hover:text-graphite">Start from scratch</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
