"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, Wand2, ArrowRight, Film, Zap, MousePointer2, ChevronDown } from "lucide-react";

interface HeroProps {
  scrollY: number;
  typedText: string;
  serifFont: string;
}

export const Hero: React.FC<HeroProps> = ({ scrollY, typedText, serifFont }) => {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {/* Background Visual */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div 
          className="absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-[58%] rounded-full opacity-60" 
          style={{ 
            background: "radial-gradient(circle, rgba(110,123,255,0.18), transparent 62%)", 
            transform: `translate(-50%,-58%) translateY(${scrollY * 0.15}px)` 
          }} 
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            transform: `translateY(${scrollY * 0.25}px)`, 
            backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", 
            backgroundSize: "60px 60px", 
            maskImage: "radial-gradient(80% 60% at 50% 40%, #000 20%, transparent 75%)", 
            WebkitMaskImage: "radial-gradient(80% 60% at 50% 40%, #000 20%, transparent 75%)" 
          }} 
        />
      </div>

      <div className="relative" style={{ transform: `translateY(${scrollY * -0.08}px)`, opacity: Math.max(0, 1 - scrollY / 600) }}>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur" style={{ animation: "fade-up .8s .2s both" }}>
          <Sparkles size={12} className="text-[#6E7BFF]" /> The AI Motion Map Studio
        </div>
        
        <h1 className="mx-auto max-w-4xl text-[clamp(2.6rem,7vw,5.2rem)] font-medium leading-[1.02] tracking-[-0.02em]" style={{ fontFamily: serifFont, animation: "fade-up .9s .3s both" }}>
          From a sentence to a<br />
          <span style={{ background: "linear-gradient(105deg,#9CA6FF,#2fe0ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            cinematic 4K map
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/55" style={{ animation: "fade-up .9s .45s both" }}>
          The world's first AI-powered studio designed for creators, journalists, and explorers. Turn any story or GPS track into broadcast-ready motion graphics.
        </p>

        {/* Live typed prompt */}
        <div className="mx-auto mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-left backdrop-blur-xl" style={{ animation: "fade-up .9s .6s both", boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)" }}>
          <Wand2 size={16} className="shrink-0 text-[#6E7BFF]" />
          <span className="flex-1 truncate text-[15px] text-white/85">
            {typedText}
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-[#6E7BFF]" />
          </span>
          <Link href="/sign-up" className="hidden shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20 sm:inline-flex">
            Try it <ArrowRight size={12} />
          </Link>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-white/45" style={{ animation: "fade-up .9s .75s both" }}>
          <span className="inline-flex items-center gap-1.5"><Film size={13} className="text-[#6E7BFF]" /> True 4K · 24fps</span>
          <span className="inline-flex items-center gap-1.5"><Zap size={13} className="text-[#6E7BFF]" /> Unlimited renders</span>
          <span className="inline-flex items-center gap-1.5"><MousePointer2 size={13} className="text-[#6E7BFF]" /> No design skills</span>
        </div>
      </div>

      <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-white/35" style={{ opacity: Math.max(0, 1 - scrollY / 300) }}>
        <span className="text-[10px] uppercase tracking-[0.3em]">Descend</span>
        <ChevronDown size={18} className="animate-bounce" />
      </div>
    </section>
  );
};
