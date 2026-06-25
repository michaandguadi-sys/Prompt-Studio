"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Layers } from "lucide-react";
import { ProjectsGrid } from "@/components/home/ProjectsGrid";
import { TemplatesGrid } from "@/components/home/TemplatesGrid";
import { AiIdeaBox } from "@/components/home/AiIdeaBox";
import { ImportTrackBox } from "@/components/home/ImportTrackBox";
import { IntentReader } from "@/components/home/IntentReader";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/**
 * HOME — focused entirely on the one thing Mapanisy does: turn an idea (or a GPS
 * track) into a cinematic 4K map animation. No manual scene builders — the AI
 * Director is the hero, with your films + curated sparks below. Design language
 * mirrors the landing (serif display type, iris accent, graticule + glow).
 */
export const HomeContent: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <div className="relative pb-20">
      {/* Background — graticule + glow, echoing the landing */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: "linear-gradient(rgba(20,28,55,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(20,28,55,0.03) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage: "radial-gradient(100% 55% at 50% 0%, #000 30%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(100% 55% at 50% 0%, #000 30%, transparent 72%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(70% 38% at 50% -5%, rgba(110,123,255,0.10), transparent 60%)" }} />

      {/* Header */}
      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-6 pt-8">
        <div className="flex items-center gap-2">
          <span className="h-px w-5 bg-iris/40" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-iris">Mapanisy Studio</span>
        </div>
        <Link href="/brand" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/80 px-3 py-1.5 text-[11px] font-medium text-graphite/55 backdrop-blur transition-colors hover:border-iris/40 hover:text-iris">
          <Sparkles size={12} /> Brand kit
        </Link>
      </header>

      {/* AI Director — the hero */}
      <section className="relative mx-auto max-w-3xl px-6 pt-10 text-center">
        <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.05] tracking-[-0.015em] text-graphite" style={{ fontFamily: SERIF }}>
          {greeting} — what will you<br /><span className="text-iris">map</span> today?
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-graphite/55">
          Describe a story or a place. A director researches it, composes the shot and builds a cinematic 4K map animation — then you fine-tune by asking.
        </p>

        <div className="mt-8 text-left">
          <AiIdeaBox onPromptChange={setPrompt} />
          <IntentReader text={prompt} />
        </div>

        <div className="mt-8 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.3em] text-graphite/30">
          <div className="h-px flex-1 bg-line" />
          or start from a GPS route
          <div className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-5 text-left"><ImportTrackBox /></div>
      </section>

      {/* Your films */}
      <div className="relative mx-auto max-w-5xl px-6 pt-16">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="text-[20px] font-medium text-graphite" style={{ fontFamily: SERIF }}>Your films</h2>
            <p className="text-[12px] text-graphite/50">Saved animations — pick up where you left off.</p>
          </div>
          <Link href="/studio2" className="inline-flex items-center gap-1.5 text-xs text-graphite/45 transition-colors hover:text-iris">
            <Layers size={12} /> Blank map
          </Link>
        </div>
        <ProjectsGrid />
      </div>

      {/* Start from a spark */}
      <div className="relative mx-auto max-w-5xl px-6 pt-14">
        <div className="mb-4">
          <h2 className="text-[20px] font-medium text-graphite" style={{ fontFamily: SERIF }}>Start from a spark</h2>
          <p className="text-[12px] text-graphite/50">Curated starting points — open one and make it yours.</p>
        </div>
        <TemplatesGrid />
      </div>

      {/* Footer strip */}
      <div className="relative mx-auto max-w-5xl px-6 pt-12">
        <div className="flex items-center justify-between gap-4 border-t border-line px-1 pt-5 text-xs text-graphite/50">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-iris animate-breathe" /> Exports up to <span className="font-medium text-graphite/65">4K · 24fps</span> — landscape, vertical or square.
          </div>
          <Link href="/brand" className="inline-flex items-center gap-1.5 transition-colors hover:text-iris"><Sparkles size={11} /> Set up brand</Link>
        </div>
      </div>
    </div>
  );
};
