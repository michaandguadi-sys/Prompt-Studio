"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

interface FinalCTAProps {
  serifFont: string;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ serifFont }) => {
  return (
    <section className="relative overflow-hidden px-6 py-32 text-center sm:py-40">
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(110,123,255,0.14), transparent 70%)" }} />
      <div className="relative mx-auto max-w-4xl">
        <h2 className="text-3xl font-medium tracking-tight text-white sm:text-6xl" style={{ fontFamily: serifFont }}>
          Build your first cinematic map <br />
          <span className="text-[#6E7BFF]">in the next five minutes.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/50">
          Join thousands of storytellers using AI to bring spatial data to life. Start free, upgrade for unlimited power.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-6">
          <Link 
            href="/sign-up" 
            className="group relative inline-flex items-center gap-2 rounded-xl bg-[#6E7BFF] px-8 py-4 text-lg font-semibold text-white transition-all hover:scale-105 active:scale-95" 
            style={{ boxShadow: "0 14px 40px -12px rgba(110,123,255,0.7)" }}
          >
            Start for free now
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40">
             <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-[#6E7BFF]" /> No credit card required</span>
             <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-[#6E7BFF]" /> Free tier forever</span>
          </div>
        </div>
      </div>
    </section>
  );
};
