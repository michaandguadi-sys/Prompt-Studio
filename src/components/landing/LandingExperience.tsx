"use client";

/**
 * Mapanisy landing — the sales page IS the product.
 *
 * The hero is a live, working demo: a real MapLibre satellite world (the same
 * LiveStoryMap the app uses) that reacts while the visitor types — places
 * bloom, routes draw, the camera moves. The CTA carries their prompt through
 * sign-up straight into the studio (localStorage seed), so the first thing a
 * new user sees is THEIR story, already understood.
 *
 * Design language: one continuous brand world with the app — night satellite,
 * iris/cyan gradients, Newsreader serif, glass panels. Interactions: cursor-
 * following glow, marquees, tilt-on-hover cards, scroll reveals, breathing
 * CTA. Everything degrades gracefully (reduced motion, SSR, no keys needed).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MapPin, Sparkles, ArrowRight, Wand2, Globe2, Route as RouteIcon,
  BarChart3, Mic2, Film, Check, ChevronDown, Mountain, Play,
} from "lucide-react";
import { LiveStoryMap } from "@/components/home/LiveStoryMap";
import { interpret } from "@/lib/parse";
import { coordsFor, isLikelyPlaceName, type GeoStop } from "@/components/home/worldCoords";
import { PRO_MAP_STYLES } from "@/lib/presets/proMapStyles";
import { FAQ } from "./FAQ";
import { Pricing } from "./Pricing";
import { FinalCTA } from "./FinalCTA";
import { Reveal } from "./Reveal";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/* ── Hero demo placeholder reel ─────────────────────────────────────────────── */
const DEMO_IDEAS = [
  "Fly from New York to Iceland with smooth camera moves",
  "My backpacking trip through Japan — Tokyo, Kyoto, Osaka",
  "The fall of the Berlin Wall, November 1989",
  "A road trip from Chicago to Los Angeles, vintage atlas style",
  "Sailing from Barcelona to Athens at golden hour",
  "Highlight every country I've visited: France, Italy, Japan, Brazil",
];

const MARQUEE_USES = [
  ["🎬", "Documentary openers"], ["✈️", "Travel films"], ["📺", "YouTube explainers"],
  ["🏛", "History timelines"], ["📊", "Data journalism"], ["📱", "Shorts & Reels"],
  ["🥾", "GPX adventure recaps"], ["🌍", "Geography lessons"], ["📰", "News graphics"],
  ["🎓", "Course intros"], ["🚂", "Journey stories"], ["🛰", "Satellite flyovers"],
] as const;

const FEATURES = [
  { icon: <Wand2 size={17} />, title: "The AI Director", body: "Reads your idea, researches the facts, plans the camera, times every beat — like a documentary editor who never sleeps." },
  { icon: <Mountain size={17} />, title: "Real terrain & satellite", body: "True 3D elevation and satellite imagery. The camera banks through the Alps like a helicopter crew shot it." },
  { icon: <RouteIcon size={17} />, title: "Your GPS tracks", body: "Drop a GPX, FIT, KML or GeoJSON — your hike becomes a cinematic flythrough with dwell, draw and drama." },
  { icon: <BarChart3 size={17} />, title: "Data-driven maps", body: "Choropleths, proportional bubbles, weighted flows — NYT-grade data storytelling from a pasted table." },
  { icon: <Mic2 size={17} />, title: "AI voiceover", body: "Documentary narration generated from your script and baked into the export, timed to the camera." },
  { icon: <Film size={17} />, title: "One-click 4K", body: "Render in the cloud or on your machine. Landscape, vertical or square — plus live share links." },
];

/* ── Interactive tilt card (subtle 3D on pointer) ───────────────────────────── */
const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
  };
  const onLeave = () => { const el = ref.current; if (el) el.style.transform = ""; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      className={`transition-transform duration-300 will-change-transform ${className}`}>
      {children}
    </div>
  );
};

/* ── Main ───────────────────────────────────────────────────────────────────── */

export function LandingExperience({ signedIn = false }: { signedIn?: boolean }) {
  const [demo, setDemo] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);

  /* Live understanding — the same engine the app runs, right on the sales page.
     Offline coords only (no geocoder): instant, and never a wrong pin. */
  const stops = useMemo<GeoStop[]>(() => {
    const t = demo.trim();
    if (t.length < 2) return [];
    try {
      const it = interpret(t);
      const names = it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations.slice(0, 6);
      return names
        .filter((n) => coordsFor(n) || isLikelyPlaceName(n, demo))
        .map((n) => coordsFor(n))
        .filter(Boolean) as GeoStop[];
    } catch { return []; }
  }, [demo]);

  /* Cycling placeholder */
  useEffect(() => {
    if (demo) return;
    const t = setInterval(() => setPhIdx((n) => (n + 1) % DEMO_IDEAS.length), 3400);
    return () => clearInterval(t);
  }, [demo]);

  /* Cursor-following glow in the hero (DOM-direct, no re-renders) */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(hover:hover)").matches) return;
    const fn = (e: MouseEvent) => {
      const el = glowRef.current; if (!el) return;
      el.style.background = `radial-gradient(560px circle at ${e.clientX}px ${e.clientY}px, rgba(110,123,255,0.09), transparent 65%)`;
    };
    window.addEventListener("mousemove", fn, { passive: true });
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  /* The conversion carry: the visitor's prompt rides through sign-up into the
     studio — AiIdeaBox reads `mapanisy-seed-prompt` on mount. */
  const ctaHref = signedIn ? "/home" : "/sign-up?redirect_url=%2Fhome";
  const seedAndGo = () => {
    try { if (demo.trim()) localStorage.setItem("mapanisy-seed-prompt", demo.trim()); } catch { /* private mode */ }
  };

  /* Mirrors src/lib/tiers.ts — the wired billing ladder. Keep in sync. */
  const plans = [
    { name: "Free", price: "$0", suffix: "forever", tagline: "Try the whole studio", featured: false, cta: "Start free",
      features: ["3 animations / month", "Full AI Director & editor", "All scene types", "1080p export, small watermark", "GPX / KML / FIT import"] },
    { name: "Creator", price: "$19", suffix: "/month", tagline: "Unlimited 4K, no watermark", featured: true, cta: "Get Creator",
      features: ["Unlimited 4K renders", "No watermark", "All 17 pro styles + looks", "GPS track flythroughs", "Public share links"] },
    { name: "Pro", price: "$39", suffix: "/month", tagline: "For serious storytellers", featured: false, cta: "Get Pro",
      features: ["Everything in Creator", "AI Director (premium model)", "Story arcs — multi-scene films", "Brand kits + FCPXML export", "Priority render queue"] },
  ];

  return (
    <div className="bg-[#04060f] text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @keyframes landRise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @keyframes phFadeL { 0% { opacity: 0; transform: translateY(6px); } 12% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; transform: translateY(-5px); } }
        @keyframes ctaBreath { 0%,100% { box-shadow: 0 10px 44px -8px rgba(110,123,255,0.55); } 50% { box-shadow: 0 10px 66px -6px rgba(110,123,255,0.85); } }
        @keyframes marqueeL { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marqueeR { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes chevFade { 0%,100% { opacity: 0.2; transform: translateY(0); } 50% { opacity: 0.75; transform: translateY(6px); } }
        .mq-l { animation: marqueeL 46s linear infinite; } .mq-r { animation: marqueeR 58s linear infinite; }
        .mq-pause:hover .mq-l, .mq-pause:hover .mq-r { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .mq-l, .mq-r { animation: none; } }
      `}</style>

      {/* ── Nav ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06]" style={{ background: "rgba(4,6,15,0.72)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2" aria-label="Mapanisy home">
            <span className="flex items-center justify-center rounded-full bg-iris shadow-[0_0_14px_rgba(110,123,255,0.65)]" style={{ width: 22, height: 22 }}>
              <MapPin size={11} strokeWidth={2.5} color="white" />
            </span>
            <span className="text-[14px] font-bold tracking-tight">Mapanisy</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/35">Studio</span>
          </Link>
          <nav className="flex items-center gap-6">
            {[["Features", "#features"], ["Styles", "#styles"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([l, h]) => (
              <a key={l} href={h} className="hidden text-[12.5px] text-white/45 transition-colors hover:text-white sm:block">{l}</a>
            ))}
            {signedIn ? (
              <Link href="/home" className="rounded-lg bg-iris px-4 py-2 text-[12.5px] font-bold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
                Open studio →
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="hidden text-[12.5px] text-white/45 transition-colors hover:text-white sm:block">Sign in</Link>
                <Link href="/sign-up" className="rounded-lg bg-iris px-4 py-2 text-[12.5px] font-bold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
                  Start free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── HERO — the product, live, before a single click ── */}
      <section className="relative overflow-hidden" style={{ minHeight: "100svh" }}>
        <LiveStoryMap stops={stops} />
        <div ref={glowRef} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center justify-center px-6 text-center" style={{ minHeight: "100svh", paddingTop: 86, paddingBottom: 120 }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-iris/30 bg-white/[0.05] px-4 py-1.5 backdrop-blur-md" style={{ animation: "landRise 0.7s ease both" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-iris opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-iris" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#aab4ff]">This map is live — try it</span>
          </div>

          <h1 className="text-[clamp(2.4rem,6vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.024em]" style={{ fontFamily: SERIF, animation: "landRise 0.8s ease 80ms both" }}>
            Type a story.
            <br />
            <span style={{ background: "linear-gradient(108deg,#9CA6FF 8%,#2FE0FF 52%,#B57BFF 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 34px rgba(110,123,255,0.45))" }}>
              Watch it become a film.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-[460px] text-[15.5px] leading-relaxed text-white/55" style={{ animation: "landRise 0.8s ease 160ms both" }}>
            The AI director researches your idea, plans the camera and builds a cinematic
            map animation — 4K, in minutes, no After Effects.
          </p>

          {/* ── THE LIVE DEMO BAR ── */}
          <div className="mt-9 w-full max-w-xl" style={{ animation: "landRise 0.9s ease 260ms both" }}>
            <div
              className={`relative rounded-2xl border bg-white/[0.06] p-2 backdrop-blur-2xl transition-all duration-300 ${focused ? "border-iris/50" : "border-white/[0.12]"}`}
              style={{ boxShadow: focused ? "0 0 0 1px rgba(110,123,255,0.3), 0 0 60px rgba(110,123,255,0.22), 0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.5)" }}
            >
              <div className="relative">
                <input
                  value={demo}
                  onChange={(e) => setDemo(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") { seedAndGo(); window.location.href = ctaHref; } }}
                  aria-label="Describe your story"
                  className="w-full bg-transparent px-4 py-3.5 text-[15px] text-white/90 outline-none placeholder:text-transparent"
                  placeholder="Describe your story…"
                />
                {!demo && (
                  <div key={phIdx} className="pointer-events-none absolute inset-x-4 top-3.5 truncate text-left text-[15px] italic text-white/30" style={{ animation: "phFadeL 3.4s ease both" }} aria-hidden>
                    “{DEMO_IDEAS[phIdx]}”
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1">
                <span className="pl-2 text-left text-[10.5px] text-white/30">
                  {stops.length
                    ? <span className="text-[#7fe9ff]">✦ {stops.length === 1 ? `Found ${stops[0].label}` : `${stops.length} stops mapped`} — already directing</span>
                    : "The map reacts while you type"}
                </span>
                <Link
                  href={ctaHref}
                  onClick={seedAndGo}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#6E7BFF 0%,#B57BFF 100%)", animation: "ctaBreath 2.6s ease-in-out infinite" }}
                >
                  <Sparkles size={13} /> {demo.trim() ? "Make this film — free" : "Start creating — free"}
                </Link>
              </div>
            </div>

            {/* Journey chips — instant proof the AI understood */}
            {stops.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" style={{ animation: "landRise 0.4s ease both" }}>
                {stops.slice(0, 5).map((s, i) => (
                  <span key={`${s.label}-${i}`} className="inline-flex items-center gap-1.5">
                    {i > 0 && <ArrowRight size={11} className="text-iris/60" />}
                    <span className="inline-flex items-center gap-1 rounded-full border border-iris/35 bg-iris/15 px-2.5 py-1 text-[11px] font-medium text-[#c3caff] backdrop-blur">
                      <MapPin size={10} /> {s.label}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-white/35" style={{ animation: "landRise 0.9s ease 360ms both" }}>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> 4K export</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> GPX import</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> 17 pro styles</span>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2" aria-hidden>
          <ChevronDown size={20} className="text-white/40" style={{ animation: "chevFade 2.2s ease-in-out infinite" }} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-24" style={{ background: "linear-gradient(to bottom, transparent, #04060f)" }} />
      </section>

      {/* ── Use-case marquee ── */}
      <section className="mq-pause relative overflow-hidden border-y border-white/[0.05] py-5" aria-label="What creators make with Mapanisy">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28" style={{ background: "linear-gradient(to right,#04060f,transparent)" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28" style={{ background: "linear-gradient(to left,#04060f,transparent)" }} />
        <div className="mq-l flex w-max gap-3">
          {[...MARQUEE_USES, ...MARQUEE_USES].map(([e, label], i) => (
            <span key={i} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-[12.5px] text-white/55">
              <span aria-hidden>{e}</span> {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── How it works — three acts ── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-iris">How it works</p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>
              From one sentence <span className="text-white/40">to a finished film.</span>
            </h2>
          </div>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            { n: "01", t: "Describe it", d: "A sentence, a script, a GPX file — anything. “The Orient Express from Paris to Istanbul, luxury vintage style.”", visual: (
              <div className="rounded-xl border border-white/[0.08] bg-[#0a0d1c] p-4 text-left">
                <div className="mb-2 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-iris" style={{ boxShadow: "0 0 8px #6E7BFF" }} /><span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/30">Your idea</span></div>
                <div className="font-mono text-[12px] leading-relaxed text-[#c3d4ff]">The Orient Express from Paris to Istanbul, luxury vintage style<span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-iris align-middle" /></div>
              </div>
            ) },
            { n: "02", t: "The AI directs", d: "Research, story beats, camera choreography, map style, timing — planned like a documentary edit, shown for your approval.", visual: (
              <div className="space-y-1.5 rounded-xl border border-white/[0.08] bg-[#0a0d1c] p-4 text-left">
                {[["Establish Paris", "wide aerial · 3.5s"], ["The journey east", "terrain follow · 5s"], ["Arrive Istanbul", "push-in · 3.5s"]].map(([b, c], i) => (
                  <div key={b} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
                    <span className="text-[11.5px] font-semibold text-white/80">{i + 1} · {b}</span>
                    <span className="text-[9.5px] text-white/35">{c}</span>
                  </div>
                ))}
              </div>
            ) },
            { n: "03", t: "Export 4K", d: "One click renders broadcast-quality MP4 — landscape for YouTube, vertical for Shorts, square for feeds. Or share a live link.", visual: (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.08]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/og-image.jpg" alt="4K export frame — alpine terrain rendered by Mapanisy" className="aspect-[1200/630] w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#04060f] shadow-xl"><Play size={16} className="ml-0.5" fill="currentColor" /></span>
                </div>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[9.5px] font-bold text-white/85">3840 × 2160 · MP4</span>
              </div>
            ) },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <TiltCard className="h-full">
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-iris/30">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[26px] font-bold text-iris/50" style={{ fontFamily: SERIF }}>{s.n}</span>
                    <h3 className="text-[17px] font-semibold">{s.t}</h3>
                  </div>
                  {s.visual}
                  <p className="text-[13px] leading-relaxed text-white/45">{s.d}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Style showcase marquee ── */}
      <section id="styles" className="py-20">
        <Reveal>
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-iris">The looks</p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>
              17 professional map styles. <span className="text-white/40">One click each.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[14px] text-white/45">
              Earth Documentary to Vintage Atlas — balanced palettes, cinematic grades, broadcast-safe.
            </p>
          </div>
        </Reveal>
        <div className="mq-pause relative mt-10 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28" style={{ background: "linear-gradient(to right,#04060f,transparent)" }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28" style={{ background: "linear-gradient(to left,#04060f,transparent)" }} />
          <div className="mq-r flex w-max gap-3 py-1">
            {[...PRO_MAP_STYLES, ...PRO_MAP_STYLES].map((s, i) => (
              <div key={`${s.id}-${i}`} className="w-[172px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all hover:-translate-y-1 hover:border-iris/40">
                <div className="relative h-[86px]" style={{ background: s.swatches[0] }}>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(130% 100% at 50% 130%, ${s.swatches[1]}66, transparent 60%)` }} />
                  <div className="absolute bottom-2 left-3 h-8 w-2.5 rounded-sm" style={{ background: s.swatches[1], boxShadow: `0 0 10px ${s.swatches[2]}` }} />
                  <div className="absolute bottom-2 left-7 h-11 w-2.5 rounded-sm" style={{ background: s.swatches[1], opacity: 0.9, boxShadow: `0 0 12px ${s.swatches[2]}` }} />
                  <div className="absolute bottom-2 right-3 h-9 w-2.5 rounded-sm" style={{ background: s.swatches[2], boxShadow: `0 0 12px ${s.swatches[2]}` }} />
                  <div className="absolute bottom-2 left-0 right-0 h-px" style={{ background: s.swatches[2], opacity: 0.5 }} />
                </div>
                <div className="px-3 py-2.5">
                  <div className="truncate text-[12px] font-semibold text-white/85">{s.name}</div>
                  <div className="truncate text-[10px] text-white/35">{s.tagline}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature grid + stats ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <TiltCard className="h-full">
                <div className="group flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-iris/30 hover:bg-white/[0.05]">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-iris/15 text-[#aab4ff] transition-transform group-hover:scale-110">{f.icon}</div>
                  <div className="text-[15px] font-semibold">{f.title}</div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">{f.body}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-12 grid grid-cols-2 gap-6 rounded-2xl border border-iris/20 bg-gradient-to-r from-iris/[0.08] to-transparent px-8 py-7 text-center sm:grid-cols-4">
            {[["4K", "3840 × 2160 export"], ["17", "professional styles"], ["< 10s", "idea → storyboard"], ["∞", "free previews"]].map(([v, l]) => (
              <div key={l}>
                <div className="text-[26px] font-bold text-white" style={{ fontFamily: SERIF }}>{v}</div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40">{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Pricing · FAQ · Final CTA ── */}
      <Pricing serifFont={SERIF} plans={plans} />
      <p className="-mt-14 pb-8 text-center text-[12px] text-white/35">
        Teams, white-label or enterprise?{" "}
        <Link href="/pricing" className="text-[#aab4ff] underline-offset-2 hover:underline">See the full pricing →</Link>
      </p>
      <FAQ serifFont={SERIF} />
      <FinalCTA serifFont={SERIF} />

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center rounded-full bg-iris" style={{ width: 18, height: 18 }}>
              <MapPin size={9} strokeWidth={2.5} color="white" />
            </span>
            <span className="text-[12.5px] font-bold">Mapanisy</span>
            <span className="text-[11px] text-white/35">— cinematic map animations from words.</span>
          </div>
          <nav className="flex flex-wrap items-center gap-5 text-[11.5px] text-white/40">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#styles" className="transition-colors hover:text-white">Styles</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
            <Link href="/sign-in" className="transition-colors hover:text-white">Sign in</Link>
          </nav>
        </div>
        <div className="mx-auto mt-5 flex max-w-6xl items-center justify-between text-[10.5px] text-white/25">
          <span>© {new Date().getFullYear()} Mapanisy · mapanisy.com</span>
          <span className="inline-flex items-center gap-1"><Globe2 size={10} /> Map data © OpenStreetMap · Imagery © Esri</span>
        </div>
      </footer>
    </div>
  );
}
