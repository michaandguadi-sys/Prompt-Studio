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
  BarChart3, Mic2, Film, Check, ChevronDown, Mountain,
} from "lucide-react";
import { LiveStoryMap, flavorForPrompt, type PreviewFlavor } from "@/components/home/LiveStoryMap";
import { interpret } from "@/lib/parse";
import { coordsFor, isLikelyPlaceName, type GeoStop } from "@/components/home/worldCoords";
import { PRO_MAP_STYLES, proMapStyleById } from "@/lib/presets/proMapStyles";
import { map3dStyleById } from "@/lib/presets/map3dStyles";
import { FAQ } from "./FAQ";
import { Pricing } from "./Pricing";
import { FinalCTA } from "./FinalCTA";
import { Reveal } from "./Reveal";
import { BuildFlow } from "./BuildFlow";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/** Hero style tap → the BuildFlow "look" value it pre-selects, so the visitor's
 *  tapped look flows through the funnel into the generated film's style. */
const STYLEID_TO_LOOK: Record<string, string> = {
  "satellite-night": "satellite",
  cartograph: "3D terrain",
  "dark-editorial": "dark editorial",
  "sunrise-terrain": "3D terrain",
  "apple-light": "clean simple map",
};

/* ── Hero demo placeholder reel ─────────────────────────────────────────────── */
const DEMO_IDEAS = [
  "Fly from New York to Iceland with smooth camera moves",
  "My backpacking trip through Japan — Tokyo, Kyoto, Osaka",
  "The fall of the Berlin Wall, November 1989",
  "A road trip from Chicago to Los Angeles, vintage atlas style",
  "Sailing from Barcelona to Athens at golden hour",
  "Highlight every country I've visited: France, Italy, Japan, Brazil",
];

/** Tappable idea chips — each demonstrates ONE real behavior. The preview is
 *  driven by the chip's EXPLICIT `flavor` + `stops`, never by re-parsing the
 *  prompt text: the intent parser mangles trailing style phrases ("…with smooth
 *  camera moves") and would silently drop the route. `stops` are place names
 *  resolved through worldCoords; `prompt` is only what seeds the real studio. */
type IdeaChip = { emoji: string; label: string; prompt: string; flavor: PreviewFlavor; stops: string[]; styleId?: string };
const IDEA_CHIPS: IdeaChip[] = [
  { emoji: "🚁", label: "Route", flavor: "route", stops: ["New York", "Reykjavik"], prompt: "Fly from New York to Reykjavik, smooth cinematic camera" },
  { emoji: "⛵", label: "Sea journey", flavor: "sea", stops: ["Barcelona", "Athens"], prompt: "Sailing from Barcelona to Athens, serene dawn light" },
  { emoji: "🌍", label: "Highlights", flavor: "highlight", stops: ["France", "Italy", "Japan", "Brazil"], prompt: "Highlight the countries I've visited: France, Italy, Japan, Brazil" },
  { emoji: "🔥", label: "Heat map", flavor: "heat", stops: ["Japan", "Chile", "Turkey"], prompt: "Earthquake hotspots across Japan, Chile and Turkey" },
  { emoji: "🏔", label: "3D close-up", flavor: "route", stops: [], prompt: "A cinematic 3D flythrough over the Matterhorn, golden dawn", styleId: "sunrise-terrain" },
];

/** The style taps — REAL PRO styles from the editor's own registry, rendered
 *  through the SAME pipeline (applyBasemapIdentity + terrain + grid), so the
 *  landing shows the EXACT look a creator gets in the studio. The swatches come
 *  straight from each pro style. */
const STYLE_TAPS: { styleId: string; label: string; hint: string }[] = [
  { styleId: "satellite-night", label: "Satellite", hint: "The earth-at-night hero" },
  { styleId: "cartograph", label: "Cartograph", hint: "Paper survey · 3D terrain · grid" },
  { styleId: "dark-editorial", label: "Dark editorial", hint: "Red borders · grey streets" },
  { styleId: "sunrise-terrain", label: "3D terrain", hint: "Real elevation, first light" },
  { styleId: "apple-light", label: "Minimal", hint: "Clean pale editorial canvas" },
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
  // Tap a style card → the whole world re-renders in a REAL PRO style through
  // the editor's own pipeline (land/water/border recolour, 3D terrain, survey
  // grid), and every overlay element re-themes with it. Works logged-out.
  const [styleId, setStyleId] = useState<string>("satellite-night");
  const proStyle = useMemo(() => proMapStyleById(styleId) ?? map3dStyleById(styleId) ?? null, [styleId]);
  // Light-basemap styles need a darker prompt-bar so the glass reads.
  const styleIsLight = useMemo(() => {
    const hex = String((proStyle?.look as any)?.bgColor || (proStyle?.swatches as string[] | undefined)?.[0] || "");
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150;
  }, [proStyle]);

  /* AUTO-TOUR — the landing demos itself. While the visitor hasn't touched
     anything, the idea chips activate one after another (route draws, sea
     voyage sails, countries fill, heat blooms), so the page is alive from
     second one. Any interaction hands the wheel over permanently. */
  // Which idea chip is driving the preview (null = the visitor is typing freely).
  const [activeChip, setActiveChip] = useState<IdeaChip | null>(null);
  // The immersive build-flow overlay (click CTA → cinematic reveal → questions → gate).
  const [buildFlow, setBuildFlow] = useState(false);

  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    const tour = IDEA_CHIPS.filter((c) => !c.styleId); // flavor demos only — style swaps stay user-driven
    let i = 0;
    const play = (c: IdeaChip) => { setDemo(c.prompt); setActiveChip(c); };
    const first = setTimeout(() => play(tour[0]), 3200);
    const loop = setInterval(() => { i = (i + 1) % tour.length; play(tour[i]); }, 9000);
    return () => { clearTimeout(first); clearInterval(loop); };
  }, [touched]);

  /* Live understanding. When a chip is active its EXPLICIT stops+flavor drive
     the map (deterministic, always correct). When the visitor types their own
     idea we fall back to the intent engine — offline coords only, instant, and
     it never drops a pin on a style word. */
  const { stops, flavor } = useMemo<{ stops: GeoStop[]; flavor: PreviewFlavor }>(() => {
    if (activeChip && demo === activeChip.prompt) {
      const stops = activeChip.stops.map((n) => coordsFor(n)).filter(Boolean) as GeoStop[];
      return { stops, flavor: activeChip.flavor };
    }
    const t = demo.trim();
    if (t.length < 2) return { stops: [], flavor: "route" };
    try {
      const it = interpret(t);
      const names = it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations.slice(0, 6);
      const stops = names
        .filter((n) => coordsFor(n) || isLikelyPlaceName(n, demo))
        .map((n) => coordsFor(n))
        .filter(Boolean) as GeoStop[];
      return { stops, flavor: flavorForPrompt(demo, it.action) };
    } catch { return { stops: [], flavor: "route" }; }
  }, [demo, activeChip]);

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

  /* The conversion carry: the visitor's idea rides into the studio via the
     BuildFlow overlay, which writes `mapanisy-seed-prompt` at its hand-off. */

  /* Mirrors src/lib/tiers.ts — the wired billing ladder. Keep in sync. */
  const plans = [
    { name: "Free", price: "$0", suffix: "forever", tagline: "Try the whole studio", featured: false, cta: "Start free",
      features: ["3 animations / month", "Full AI Director & editor", "All scene types", "720p export, small watermark", "GPX / KML / FIT import"] },
    { name: "Creator", price: "$7.99", suffix: "/mo", note: "or $40/year — save 58%", tagline: "Unlimited 4K, no watermark", featured: true, cta: "Get Creator",
      features: ["Unlimited 4K renders", "No watermark", `All ${PRO_MAP_STYLES.length} pro styles + looks`, "GPS track flythroughs", "Public share links"] },
    { name: "Pro", price: "$250", suffix: "once", note: "Lifetime — pay once", tagline: "Everything + first access to new features", featured: false, cta: "Get lifetime access",
      features: ["Everything in Creator", "First access to upcoming features", "AI Director — premium model", "Story arcs — multi-scene films", "Brand kits + FCPXML export", "Priority render queue"] },
  ];

  return (
    <div className="bg-[#04060f] text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @keyframes landRise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @keyframes phFadeL { 0% { opacity: 0; transform: translateY(6px); } 12% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; transform: translateY(-5px); } }
        @keyframes ctaBreath { 0%,100% { box-shadow: 0 10px 44px -8px rgba(110,123,255,0.55); } 50% { box-shadow: 0 10px 66px -6px rgba(110,123,255,0.85); } }
        @keyframes marqueeL { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes chevFade { 0%,100% { opacity: 0.2; transform: translateY(0); } 50% { opacity: 0.75; transform: translateY(6px); } }
        .mq-l { animation: marqueeL 46s linear infinite; }
        .mq-pause:hover .mq-l { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .mq-l { animation: none; } }
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
            {[["Features", "#features"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([l, h]) => (
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
        <LiveStoryMap stops={stops} flavor={flavor} proStyle={proStyle} />
        <div ref={glowRef} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center justify-center px-6 text-center" style={{ minHeight: "100svh", paddingTop: 86, paddingBottom: 120 }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-iris/30 bg-white/[0.05] px-4 py-1.5 backdrop-blur-md" style={{ animation: "landRise 0.7s ease both" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-iris opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-iris" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#aab4ff]">This map is live — try it</span>
          </div>

          <h1 className="text-[clamp(2.4rem,6vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.024em]" style={{ fontFamily: SERIF, animation: "landRise 0.8s ease 80ms both", textShadow: "0 2px 26px rgba(4,6,16,0.65), 0 1px 4px rgba(4,6,16,0.55)" }}>
            Type a story.
            <br />
            <span style={{ background: "linear-gradient(108deg,#9CA6FF 8%,#2FE0FF 52%,#B57BFF 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 34px rgba(110,123,255,0.45))" }}>
              Watch it become a film.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-[460px] text-[15.5px] leading-relaxed text-white/55" style={{ animation: "landRise 0.8s ease 160ms both", textShadow: "0 1px 14px rgba(4,6,16,0.7)" }}>
            The AI director researches your idea, plans the camera and builds a cinematic
            map animation — 4K, in minutes, no After Effects.
          </p>

          {/* ── THE LIVE DEMO BAR ── */}
          <div className="mt-9 w-full max-w-xl" style={{ animation: "landRise 0.9s ease 260ms both" }}>
            <div
              className={`relative rounded-2xl border p-2 backdrop-blur-2xl transition-all duration-300 ${focused ? "border-iris/50" : "border-white/[0.12]"} ${styleIsLight ? "bg-[#0a0d1a]/78" : "bg-white/[0.06]"}`}
              style={{ boxShadow: focused ? "0 0 0 1px rgba(110,123,255,0.3), 0 0 60px rgba(110,123,255,0.22), 0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.5)" }}
            >
              <div className="relative">
                <input
                  value={demo}
                  onChange={(e) => { setTouched(true); setActiveChip(null); setDemo(e.target.value); }}
                  onFocus={() => { setFocused(true); setTouched(true); }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setBuildFlow(true); }}
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
                <button
                  onClick={() => setBuildFlow(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#6E7BFF 0%,#B57BFF 100%)", animation: "ctaBreath 2.6s ease-in-out infinite" }}
                >
                  <Sparkles size={13} /> {demo.trim() ? "Make this film — free" : "Start creating — free"}
                </button>
              </div>
            </div>

            {/* Journey chips — instant proof the AI understood */}
            {stops.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" style={{ animation: "landRise 0.4s ease both" }}>
                {stops.slice(0, 5).map((s, i) => (
                  <span key={`${s.label}-${i}`} className="inline-flex items-center gap-1.5">
                    {i > 0 && flavor === "route" && <ArrowRight size={11} className="text-iris/60" />}
                    <span className="inline-flex items-center gap-1 rounded-full border border-iris/35 bg-iris/15 px-2.5 py-1 text-[11px] font-medium text-[#c3caff] backdrop-blur">
                      <MapPin size={10} /> {s.label}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Idea chips — tap to preview a route, a sea voyage, real country
                highlights, a heat map, or a 3D terrain dive */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" style={{ animation: "landRise 0.9s ease 320ms both" }}>
              {IDEA_CHIPS.map((c) => {
                const active = demo === c.prompt;
                return (
                  <button
                    key={c.label}
                    onClick={() => {
                      setTouched(true);
                      setDemo(active ? "" : c.prompt);
                      setActiveChip(active ? null : c);
                      if (c.styleId) setStyleId(active ? "satellite-night" : c.styleId);
                      else setStyleId("satellite-night");
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-all hover:-translate-y-0.5 ${active ? "border-iris/60 bg-iris/20 text-white" : "border-white/[0.1] bg-white/[0.04] text-white/50 hover:border-iris/40 hover:text-white/85"}`}
                    title={c.prompt}
                  >
                    <span aria-hidden>{c.emoji}</span> {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-white/35" style={{ animation: "landRise 0.9s ease 360ms both" }}>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> 4K export</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> GPX import</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-iris" /> {PRO_MAP_STYLES.length} pro styles</span>
          </div>

          {/* Tap-a-style strip — swaps the REAL basemap live; every element on
              the map (routes, pins, highlights, labels) re-themes with it */}
          <div className="mt-5 flex flex-col items-center gap-2" style={{ animation: "landRise 0.9s ease 440ms both" }}>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.28em] text-white/28">Tap a style — the whole map changes · {PRO_MAP_STYLES.length}+ looks in the studio</span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {STYLE_TAPS.map((s) => {
                const active = styleId === s.styleId;
                const sw = (proMapStyleById(s.styleId)?.swatches as string[] | undefined) ?? ["#16241c", "#3d5a3a", "#0e1a2b"];
                return (
                  <button
                    key={s.styleId}
                    onClick={() => { setTouched(true); setStyleId(active ? "satellite-night" : s.styleId); }}
                    title={`${s.label} — ${s.hint}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-all hover:-translate-y-0.5 ${active ? "border-white/70 bg-white/15 text-white" : "border-white/[0.12] bg-white/[0.04] text-white/55 hover:border-white/40 hover:text-white/90"}`}
                    aria-label={`Switch the map to the ${s.label} style`}
                  >
                    <span className="flex overflow-hidden rounded-full ring-1 ring-white/25" aria-hidden>
                      {sw.slice(0, 3).map((c, i) => <span key={i} className="h-3.5 w-2" style={{ background: c }} />)}
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </div>
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
                {/* A single exported frame — NOT a video player, so no play button
                    that goes nowhere. The badge states what it is. */}
                <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,6,15,0.5), transparent 45%)" }} />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[9.5px] font-semibold text-white/80"><Film size={10} /> Rendered output</span>
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
            {[["4K", "3840 × 2160 export"], [String(PRO_MAP_STYLES.length), "professional styles"], ["< 10s", "idea → storyboard"], ["∞", "free previews"]].map(([v, l]) => (
              <div key={l}>
                <div className="text-[26px] font-bold text-white" style={{ fontFamily: SERIF }}>{v}</div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40">{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Pricing · FAQ · Final CTA ── */}
      <Pricing serifFont={SERIF} plans={plans} signedIn={signedIn} />
      <p className="-mt-14 pb-8 text-center text-[12px] text-white/35">
        Teams, white-label or enterprise?{" "}
        <Link href="/pricing" className="text-[#aab4ff] underline-offset-2 hover:underline">See the full pricing →</Link>
      </p>
      <FAQ serifFont={SERIF} />
      <FinalCTA serifFont={SERIF} signedIn={signedIn} />

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

      {/* The immersive build experience — cinematic reveal → quick questions →
          the free-first-animation sign-up gate. */}
      {buildFlow && <BuildFlow idea={demo} signedIn={signedIn} initialLook={STYLEID_TO_LOOK[styleId]} onClose={() => setBuildFlow(false)} />}
    </div>
  );
}
