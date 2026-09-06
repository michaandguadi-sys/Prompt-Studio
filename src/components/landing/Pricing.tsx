"use client";

import React from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

interface PricingPlan {
  name: string;
  price: string;
  suffix?: string;
  /** Highlighted note under the price — e.g. the annual discount or "lifetime". */
  note?: string;
  tagline: string;
  featured: boolean;
  cta: string;
  features: string[];
}

interface PricingProps {
  serifFont: string;
  plans: PricingPlan[];
  signedIn?: boolean;
}

export const Pricing: React.FC<PricingProps> = ({ serifFont, plans, signedIn }) => {
  // Picking a plan is purchase intent: signed-in → the real pricing/checkout
  // page; new visitors sign up first, then land back on pricing to buy.
  const ctaHref = signedIn ? "/pricing" : "/sign-up?redirect_url=%2Fpricing";
  return (
    <section id="pricing" className="relative mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-medium tracking-tight text-white" style={{ fontFamily: serifFont }}>
          Start free. <span className="text-white/40">Pay when it matters.</span>
        </h2>
      </Reveal>
      <Reveal delay={80}>
        <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-white/50">
          Every feature is free forever with a small watermark. Upgrade only when your story deserves the full frame.
        </p>
      </Reveal>
      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((p, i) => (
          <Reveal key={p.name} delay={i * 110}>
            <div 
              className={`relative flex h-full flex-col rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1.5 ${p.featured ? "border-[#6E7BFF]/50 bg-[#6E7BFF]/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`} 
              style={p.featured ? { boxShadow: "0 24px 70px -28px rgba(110,123,255,0.6)" } : undefined}
            >
              {p.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6E7BFF] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most popular
                </div>
              )}
              <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/50">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-light text-white" style={{ fontFamily: serifFont }}>{p.price}</span>
                {p.suffix && <span className="text-sm text-white/40">{p.suffix}</span>}
              </div>
              {p.note && (
                <div className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  {p.note}
                </div>
              )}
              <p className="mt-2 text-[13px] text-white/50">{p.tagline}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((ft) => (
                  <li key={ft} className="flex items-start gap-2 text-[13px] text-white/65">
                    <Check size={15} className="mt-0.5 shrink-0 text-[#6E7BFF]" /> {ft}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref}
                className={`mt-7 inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${p.featured ? "text-white hover:-translate-y-0.5" : "border border-white/15 text-white/80 hover:border-white/30 hover:text-white"}`}
                style={p.featured ? { background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 10px 30px -10px rgba(110,123,255,0.7)" } : undefined}
              >
                {p.cta} <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
};
