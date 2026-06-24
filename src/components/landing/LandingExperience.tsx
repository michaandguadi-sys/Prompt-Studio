"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowRight, MapPin, Wand2, Route, Film, Share2, Check,
  ChevronDown, Globe2, Zap, MountainSnow, MousePointer2,
} from "lucide-react";

import { Hero } from "./Hero";
import { Problem } from "./Problem";
import { Capabilities } from "./Capabilities";
import { Pricing } from "./Pricing";
import { FAQ } from "./FAQ";
import { FinalCTA } from "./FinalCTA";
import { Reveal } from "./Reveal";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/* ───────────────────────── hooks ───────────────────────── */

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setY(window.scrollY)); };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  return y;
}

/** Scroll progress 0→1 across a tall section's pin range. */
function useSectionProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        const passed = Math.min(Math.max(-r.top, 0), Math.max(total, 1));
        setP(total > 0 ? passed / total : 0);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    on();
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [ref]);
  return p;
}

const PHRASES = ["the fall of the Berlin Wall, 1989", "my 14-day trek across Patagonia", "how the Roman Empire expanded", "a night flight from Tokyo to Reykjavík"];
function useTyped(speed = 52, pause = 1500) {
  const [text, setText] = useState(""); const [i, setI] = useState(0); const [del, setDel] = useState(false);
  useEffect(() => {
    const cur = PHRASES[i % PHRASES.length];
    let t: ReturnType<typeof setTimeout>;
    if (!del && text === cur) t = setTimeout(() => setDel(true), pause);
    else if (del && text === "") { setDel(false); setI((v) => v + 1); return; }
    else t = setTimeout(() => setText(cur.slice(0, text.length + (del ? -1 : 1))), del ? 26 : speed);
    return () => clearTimeout(t);
  }, [text, del, i, speed, pause]);
  return text;
}

/* ───────────────────────── loader ───────────────────────── */

const MapLoader: React.FC<{ done: boolean }> = ({ done }) => (
  <div
    className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
    style={{ background: "radial-gradient(120% 90% at 50% 30%, #0b1024 0%, #05060e 70%)", opacity: done ? 0 : 1, pointerEvents: done ? "none" : "auto", transition: "opacity 0.9s ease 0.1s" }}
    aria-hidden={done}
  >
    <svg viewBox="0 0 200 200" className="h-40 w-40" style={{ filter: "drop-shadow(0 0 24px rgba(110,123,255,0.5))" }}>
      <defs>
        <radialGradient id="ld-g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6E7BFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6E7BFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="90" fill="url(#ld-g)" />
      {[34, 58, 82].map((r, k) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#6E7BFF" strokeWidth="1" strokeOpacity={0.18 + k * 0.04}>
          <animate attributeName="r" values={`${r};${r + 8};${r}`} dur="3.4s" begin={`${k * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <path d="M30 120 Q 80 40 150 70" fill="none" stroke="#2fe0ff" strokeWidth="2" strokeLinecap="round" strokeDasharray="200" strokeDashoffset="200">
        <animate attributeName="stroke-dashoffset" from="200" to="0" dur="1.6s" fill="freeze" />
      </path>
      <circle cx="150" cy="70" r="4" fill="#2fe0ff">
        <animate attributeName="r" values="4;7;4" dur="1.2s" begin="1.5s" repeatCount="indefinite" />
      </circle>
      {[[60, 150], [120, 140], [80, 95], [140, 110]].map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r="2" fill="#9CA6FF">
          <animate attributeName="opacity" values="0.25;1;0.25" dur="2.2s" begin={`${k * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
    <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.5em] text-white/70" style={{ paddingLeft: "0.5em" }}>Prompt Studio</div>
    <div className="mt-3 h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
      <div className="h-full w-1/2 rounded-full" style={{ background: "linear-gradient(90deg,transparent,#6E7BFF,transparent)", animation: "loaderSweep 1.4s cubic-bezier(.5,0,.3,1) infinite" }} />
    </div>
  </div>
);

/* ───────────────────────── page ───────────────────────── */

export const LandingExperience: React.FC = () => {
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDone(true), 2100); return () => clearTimeout(t); }, []);
  const y = useScrollY();
  const typed = useTyped();
  const flyRef = useRef<HTMLElement>(null);
  const flyP = useSectionProgress(flyRef);
  const navSolid = y > 40;

  // Fly-through logic preserved
  const scale = 1 + flyP * 7.5;
  const captionIdx = flyP < 0.34 ? 0 : flyP < 0.68 ? 1 : 2;
  const FLY = [
    { k: "Name any place or moment", s: "“the Berlin Wall, 1989” — a sentence is the whole brief." },
    { k: "A director researches it", s: "Facts checked, the angle found, the scene composed." },
    { k: "You land in 4K", s: "Cinematic camera, graded look, ready to publish." },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05060e] text-white antialiased">
      <MapLoader done={done} />

      {/* ── Nav ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${navSolid ? "border-b border-white/10 bg-[#05060e]/80 backdrop-blur-xl" : "border-b border-transparent"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 6px 20px -6px rgba(110,123,255,0.8)" }}><span className="text-[14px] font-black">P</span></span>
            <span className="text-[17px] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Prompt Studio</span>
          </div>
          <nav className="hidden items-center gap-7 text-[13px] text-white/55 md:flex">
            <a href="#capabilities" className="transition-colors hover:text-white">Capabilities</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="text-[13px] text-white/60 transition-colors hover:text-white">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 8px 24px -8px rgba(110,123,255,0.7)" }}>Start free</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <Hero scrollY={y} typedText={typed} serifFont={SERIF} />

        {/* ── Social Proof / Logo Bar ── */}
        <section className="border-y border-white/5 bg-white/[0.01] py-12">
           <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <p className="text-center text-sm font-semibold leading-8 text-white/30 uppercase tracking-[0.2em] mb-8">Trusted by creators worldwide</p>
            <div className="mx-auto grid max-w-lg grid-cols-4 items-center gap-x-8 gap-y-10 sm:max-w-xl sm:grid-cols-6 sm:gap-x-10 lg:mx-0 lg:max-w-none lg:grid-cols-5 opacity-40 grayscale">
               <div className="flex items-center justify-center font-bold text-xl">VOX</div>
               <div className="flex items-center justify-center font-bold text-xl">NYT</div>
               <div className="flex items-center justify-center font-bold text-xl">NASA</div>
               <div className="flex items-center justify-center font-bold text-xl">BBC</div>
               <div className="flex items-center justify-center font-bold text-xl lg:hidden xl:flex">VICE</div>
            </div>
          </div>
        </section>

        {/* ── Problem ── */}
        <Problem serifFont={SERIF} />

        {/* ── Fly-through: The "Magic" Moment ── */}
        <section ref={flyRef} className="relative" style={{ height: "300vh" }}>
          <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden bg-[#05060e]">
             <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(110,123,255,0.12), transparent 70%)" }} />
             
             {/* The Map Visual */}
             <div className="relative flex flex-col items-center justify-center w-full max-w-4xl px-6">
                <div className="mb-12 text-center" style={{ opacity: Math.max(0, 1 - flyP * 2) }}>
                   <span className="text-[#6E7BFF] font-semibold uppercase tracking-widest text-xs">The Magic</span>
                   <h2 className="text-4xl mt-2 font-medium" style={{ fontFamily: SERIF }}>Scroll to descend into the data</h2>
                </div>

                <div className="relative transition-all duration-300" style={{ transform: `scale(${scale})`, opacity: Math.max(0.1, 1 - flyP * 0.4) }}>
                  <svg viewBox="0 0 400 400" className="h-[70vmin] w-[70vmin]" style={{ filter: "drop-shadow(0 0 40px rgba(110,123,255,0.35))" }} aria-hidden>
                    <circle cx="200" cy="200" r="150" fill="none" stroke="#2c344a" strokeWidth="1" />
                    {[40, 80, 120].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#212b43" strokeWidth="1" />)}
                    <line x1="50" y1="200" x2="350" y2="200" stroke="#212b43" strokeWidth="1" />
                    <line x1="200" y1="50" x2="200" y2="350" stroke="#212b43" strokeWidth="1" />
                    <path d="M120 150 Q150 110 200 130 T280 160 Q300 200 260 230 T180 250 Q130 230 120 190 Z" fill="rgba(110,123,255,0.10)" stroke="#6E7BFF" strokeWidth="1.5" />
                    <path d="M90 240 Q140 280 200 300" fill="none" stroke="#2fe0ff" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="200" cy="300" r="5" fill="#2fe0ff" />
                    <circle cx="90" cy="240" r="4" fill="#6E7BFF" />
                  </svg>
                </div>

                {/* Caption stack */}
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  {FLY.map((f, i) => (
                    <div key={i} className="absolute w-full px-6 text-center" style={{ opacity: captionIdx === i ? 1 : 0, transform: `translateY(${captionIdx === i ? 0 : captionIdx > i ? -24 : 24}px)`, transition: "opacity .5s ease, transform .5s ease" }}>
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/60 backdrop-blur">Stage {i + 1}</div>
                      <h2 className="text-3xl font-medium tracking-tight" style={{ fontFamily: SERIF }}>{f.k}</h2>
                      <p className="mx-auto mt-3 max-w-sm text-sm text-white/50">{f.s}</p>
                    </div>
                  ))}
                </div>
             </div>

             {/* progress rail */}
             <div className="absolute bottom-20 left-1/2 h-1 w-48 -translate-x-1/2 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-[#6E7BFF]" style={{ width: `${flyP * 100}%` }} />
             </div>
          </div>
        </section>

        {/* ── Capabilities (Bento) ── */}
        <Capabilities 
          serifFont={SERIF} 
          images={{
            hero: "/landing/assets/hero.png",
            editor: "/landing/assets/editor.png",
            export4k: "/landing/assets/export4k.png"
          }}
        />

        {/* ── Pricing ── */}
        <Pricing serifFont={SERIF} plans={PRICING} />

        {/* ── FAQ ── */}
        <div id="faq">
          <FAQ serifFont={SERIF} />
        </div>

        {/* ── Final CTA ── */}
        <FinalCTA serifFont={SERIF} />

      </main>

      <footer className="border-t border-white/5 px-6 py-12 bg-black/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-[13px] text-white/40 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)" }}>
              <span className="text-[12px] font-black">P</span>
            </span>
            <span className="font-medium text-white/70" style={{ fontFamily: SERIF }}>Prompt Studio</span>
            <span className="text-white/20">|</span>
            <span>Motion Graphics for the Spatial Age</span>
          </div>
          <div className="flex items-center gap-8">
            <Link href="#capabilities" className="hover:text-white/70 transition-colors">Capabilities</Link>
            <Link href="#pricing" className="hover:text-white/70 transition-colors">Pricing</Link>
            <Link href="/sign-in" className="hover:text-white/70 transition-colors">Sign in</Link>
            <Link href="/sign-up" className="text-white hover:text-[#6E7BFF] transition-colors">Get Started</Link>
          </div>
        </div>
        <div className="mt-8 text-center text-[11px] text-white/20">
          © {new Date().getFullYear()} Prompt Studio. All rights reserved. Built with Remotion & Next.js.
        </div>
      </footer>
    </div>
  );
};

const PRICING = [
  { name: "Free", price: "$0", suffix: "", tagline: "For trying it out.", featured: false, cta: "Start free", features: ["3 animations / month", "1080p export", "Watermark", "All scene types"] },
  { name: "Creator", price: "$19", suffix: "/mo", tagline: "For solo creators.", featured: true, cta: "Start free", features: ["Unlimited 4K renders", "No watermark", "All styles + GPS tracks", "Share links"] },
  { name: "Pro", price: "$39", suffix: "/mo", tagline: "For power users.", featured: false, cta: "Go Pro", features: ["Everything in Creator", "AI Director + story arcs", "Brand kits + NLE export", "Priority support"] },
];
