"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, Clapperboard, Wand2, ChevronDown } from "lucide-react";
import { AiIdeaBox } from "./AiIdeaBox";
import { ImportTrackBox } from "./ImportTrackBox";
import { IntentReader } from "./IntentReader";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/** Rotating "story sparks" — the headline's last word cycles so the page feels
 *  alive and hints at the breadth of what the director can shoot. */
const SPARKS = ["sentence.", "headline.", "memory.", "dataset.", "journey.", "moment."];

/**
 * THE LIVING COMMAND — bright editorial entry. A calm, magazine-grade page: a
 * serif headline, one command, and a director that visibly understands your
 * story AS YOU TYPE (the IntentReader). The proven AiIdeaBox generation flow
 * runs underneath, untouched; this is the experience wrapped around it.
 */
export const DirectorStage: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [spark, setSpark] = useState(0);

  useEffect(() => {
    if (prompt.trim()) return;
    const t = setInterval(() => setSpark((s) => (s + 1) % SPARKS.length), 2600);
    return () => clearInterval(t);
  }, [prompt]);

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-paper-50 px-6 pb-16 pt-[7vh]">
      {/* Light editorial backdrop — faint graticule + a soft warm wash */}
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{
        backgroundImage:
          "linear-gradient(rgba(20,28,55,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(20,28,55,0.035) 1px, transparent 1px)",
        backgroundSize: "46px 46px",
        maskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 78%)",
        WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 78%)",
      }} />
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{
        background: "radial-gradient(90% 55% at 50% -8%, rgba(110,123,255,0.10), transparent 60%)",
      }} />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
        {/* Eyebrow */}
        <div className="mb-5 inline-flex items-center gap-2.5">
          <span className="h-px w-7 bg-line" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.38em] text-iris">The AI map-story director</span>
          <span className="h-px w-7 bg-line" />
        </div>

        {/* Headline — editorial serif */}
        <h1 className="mb-4 text-[clamp(2.5rem,5.4vw,4.2rem)] font-medium leading-[1.04] tracking-[-0.01em] text-graphite" style={{ fontFamily: SERIF }}>
          Direct a cinematic map
          <br />
          <span className="text-graphite/45">from a single </span>
          <span key={spark} className="text-iris" style={{ animation: "intentChipIn 0.5s cubic-bezier(0.22,1,0.36,1) both" }}>
            {prompt.trim() ? "story." : SPARKS[spark]}
          </span>
        </h1>

        <p className="mx-auto mb-7 max-w-xl text-[15px] leading-relaxed text-graphite/55">
          Type it the way you&rsquo;d say it. A director researches the facts, plans the beats,
          and builds a broadcast-ready 4K animation — and it&rsquo;s already reading your mind below.
        </p>

        {/* The command card + the live mind-reading layer */}
        <div className="w-full max-w-2xl text-left">
          <AiIdeaBox onPromptChange={setPrompt} />

          {/* THE MAGIC — the director's live understanding of your sentence */}
          <IntentReader text={prompt} />

          <div className="my-4 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.3em] text-graphite/30">
            <div className="h-px flex-1 bg-line" /> or start from a route <div className="h-px flex-1 bg-line" />
          </div>
          <ImportTrackBox />
        </div>

        {/* Trust strip */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-graphite/55">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-iris" /> Fact-checked, journalist-grade</span>
          <span className="inline-flex items-center gap-1.5"><Clapperboard size={13} className="text-iris" /> True 4K · 24fps export</span>
          <span className="inline-flex items-center gap-1.5"><Wand2 size={13} className="text-iris" /> Edit by asking — or with no AI at all</span>
        </div>
      </div>

      {/* Scroll cue to the deck below */}
      <div className="relative z-10 mt-8 flex justify-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.3em] text-graphite/35">
          <span>Your films &amp; sparks</span>
          <ChevronDown size={13} className="animate-bounce" />
        </div>
      </div>
    </section>
  );
};
