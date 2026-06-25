"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowRight, Wand2, Route, Film, Share2, Check, ChevronDown,
  Globe2, Zap, MountainSnow, MousePointer2, ShieldCheck,
} from "lucide-react";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";

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

/** Fire `true` once the element scrolls into view. */
function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.3) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return seen;
}

function useCountUp(target: number, run: boolean, dur = 1400) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, dur]);
  return n;
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

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; y?: number; className?: string }> = ({ children, delay = 0, y = 30, className = "" }) => {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.16);
  return (
    <div ref={ref} className={className} style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : `translateY(${y}px)`, transition: `opacity .85s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .85s cubic-bezier(.22,1,.36,1) ${delay}ms` }}>
      {children}
    </div>
  );
};

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
    <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.5em] text-white/70" style={{ paddingLeft: "0.5em" }}>Mapanisy</div>
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
            <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 6px 20px -6px rgba(110,123,255,0.8)" }}><span className="text-[14px] font-black">M</span></span>
            <span className="text-[17px] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Mapanisy</span>
          </div>
          <nav className="hidden items-center gap-7 text-[13px] text-white/55 md:flex">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="text-[13px] text-white/60 transition-colors hover:text-white">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 8px 24px -8px rgba(110,123,255,0.7)" }}>Start free</Link>
          </div>
        </div>
      </header>

      {/* ── Hero — high above the glowing world ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] rounded-full opacity-60" style={{ background: "radial-gradient(circle, rgba(110,123,255,0.18), transparent 62%)", transform: `translate(-50%,-58%) translateY(${y * 0.15}px)` }} />
          <div className="absolute inset-0" style={{ transform: `translateY(${y * 0.25}px)`, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "radial-gradient(80% 60% at 50% 40%, #000 20%, transparent 75%)", WebkitMaskImage: "radial-gradient(80% 60% at 50% 40%, #000 20%, transparent 75%)" }} />
          {[["12%", "22%", "2.6s"], ["82%", "30%", "3.1s"], ["20%", "70%", "2.2s"], ["74%", "66%", "3.6s"], ["50%", "16%", "2.9s"]].map(([l, t, d], i) => (
            <span key={i} className="absolute h-1 w-1 rounded-full bg-cyan" style={{ left: l, top: t, boxShadow: "0 0 8px #2fe0ff", animation: `breathe ${d} ease-in-out ${i * 0.3}s infinite` }} />
          ))}
        </div>

        <div className="relative" style={{ transform: `translateY(${y * -0.08}px)`, opacity: Math.max(0, 1 - y / 600) }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur" style={{ animation: "fade-up .8s .2s both" }}>
            <Sparkles size={12} className="text-iris" /> The AI story-map studio
          </div>
          <h1 className="mx-auto max-w-4xl text-[clamp(2.6rem,7vw,5.2rem)] font-medium leading-[1.02] tracking-[-0.02em]" style={{ fontFamily: SERIF, animation: "fade-up .9s .3s both" }}>
            From a sentence to a<br /><span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>cinematic 4K map</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/55" style={{ animation: "fade-up .9s .45s both" }}>
            Describe a story or drop a GPS track. A director researches it, composes the shot, and renders a broadcast-ready animation — you fine-tune by asking.
          </p>

          <div className="mx-auto mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-left backdrop-blur-xl" style={{ animation: "fade-up .9s .6s both", boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)" }}>
            <Wand2 size={16} className="shrink-0 text-iris" />
            <span className="flex-1 truncate text-[15px] text-white/85">{typed}<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-iris" /></span>
            <Link href="/sign-up" className="hidden shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20 sm:inline-flex">Try it <ArrowRight size={12} /></Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-white/45" style={{ animation: "fade-up .9s .75s both" }}>
            <span className="inline-flex items-center gap-1.5"><Film size={13} className="text-iris" /> True 4K · 24fps</span>
            <span className="inline-flex items-center gap-1.5"><Zap size={13} className="text-iris" /> Unlimited renders</span>
            <span className="inline-flex items-center gap-1.5"><MousePointer2 size={13} className="text-iris" /> No design skills</span>
          </div>
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-white/35" style={{ opacity: Math.max(0, 1 - y / 300) }}>
          <span className="text-[10px] uppercase tracking-[0.3em]">Descend</span>
          <ChevronDown size={18} className="animate-bounce" />
        </div>
      </section>

      {/* ── Credibility line (honest — a style, not a false endorsement) ── */}
      <section className="border-y border-white/5 bg-white/[0.01] py-8">
        <p className="mx-auto max-w-3xl px-6 text-center text-[13px] leading-relaxed text-white/40">
          The cartographic-storytelling style behind modern explainer videos — the moving maps, the cinematic push-ins, the graded looks — now from a single sentence.
        </p>
      </section>

      {/* ── Fly-through: scroll zooms you into the map ── */}
      <section id="how" ref={flyRef} className="relative" style={{ height: "320vh" }}>
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(110,123,255,0.12), transparent 70%)" }} />
          <svg viewBox="0 0 400 400" className="absolute h-[78vmin] w-[78vmin]" style={{ transform: `scale(${scale})`, opacity: Math.max(0, 1 - flyP * 0.55), transition: "opacity .2s linear", filter: "drop-shadow(0 0 40px rgba(110,123,255,0.35))" }} aria-hidden>
            <circle cx="200" cy="200" r="150" fill="none" stroke="#2c344a" strokeWidth="1" />
            {[40, 80, 120].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#212b43" strokeWidth="1" />)}
            <line x1="50" y1="200" x2="350" y2="200" stroke="#212b43" strokeWidth="1" />
            <line x1="200" y1="50" x2="200" y2="350" stroke="#212b43" strokeWidth="1" />
            <path d="M120 150 Q150 110 200 130 T280 160 Q300 200 260 230 T180 250 Q130 230 120 190 Z" fill="rgba(110,123,255,0.10)" stroke="#6E7BFF" strokeWidth="1.5" />
            <path d="M90 240 Q140 280 200 300" fill="none" stroke="#2fe0ff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="200" cy="300" r="5" fill="#2fe0ff" />
            <circle cx="90" cy="240" r="4" fill="#6E7BFF" />
          </svg>
          <div className="relative z-10 px-6 text-center">
            {FLY.map((f, i) => (
              <div key={i} className="absolute left-1/2 top-1/2 w-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2" style={{ opacity: captionIdx === i ? 1 : 0, transform: `translate(-50%,-50%) translateY(${captionIdx === i ? 0 : captionIdx > i ? -24 : 24}px)`, transition: "opacity .5s ease, transform .5s ease", pointerEvents: "none" }}>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/60 backdrop-blur">Step {i + 1}</div>
                <h2 className="text-[clamp(2rem,5vw,3.6rem)] font-medium leading-tight tracking-tight" style={{ fontFamily: SERIF }}>{f.k}</h2>
                <p className="mx-auto mt-3 max-w-md text-[15px] text-white/55">{f.s}</p>
              </div>
            ))}
          </div>
          <div className="absolute bottom-10 left-1/2 h-0.5 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-iris" style={{ width: `${flyP * 100}%` }} />
          </div>
        </div>
      </section>

      {/* ── Features — tilt cards ── */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal><h2 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Everything a motion designer does</h2></Reveal>
        <Reveal delay={80}><p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-white/50">From one prompt to a finished, on-brand film — with full control whenever you want it.</p></Reveal>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 100}><TiltCard {...f} /></Reveal>
          ))}
        </div>
      </section>

      {/* ── Stats band (count-up) ── */}
      <StatsBand />

      {/* ── Styles marquee ── */}
      <section className="relative overflow-hidden border-y border-white/8 py-6">
        <div className="flex w-max gap-3" style={{ animation: "marqueeX 34s linear infinite" }}>
          {[...LOOKS, ...LOOKS].map((s, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[13px] text-white/55">{s}</span>
          ))}
        </div>
      </section>

      {/* ── Use-cases ── */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal><h2 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Made for storytellers</h2></Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {USES.map((u, i) => (
            <Reveal key={u.t} delay={i * 100}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7">
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl text-iris ring-1 ring-iris/25" style={{ background: "rgba(110,123,255,0.1)" }}><u.icon size={20} /></div>
                <h3 className="mb-2 text-[16px] font-medium">{u.t}</h3>
                <p className="text-[14px] leading-relaxed text-white/50">{u.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal><h2 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Unlimited 4K renders. Seriously.</h2></Reveal>
        <Reveal delay={80}><p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-white/50">Renders run on your machine, so paid plans never meter them. Start free.</p></Reveal>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PRICING.map((p, i) => (
            <Reveal key={p.name} delay={i * 110}>
              <div className={`relative flex h-full flex-col rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1.5 ${p.featured ? "border-iris/50 bg-iris/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`} style={p.featured ? { boxShadow: "0 24px 70px -28px rgba(110,123,255,0.6)" } : undefined}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-iris px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Most popular</div>}
                <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/50">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1"><span className="text-4xl font-light" style={{ fontFamily: SERIF }}>{p.price}</span>{p.suffix && <span className="text-sm text-white/40">{p.suffix}</span>}</div>
                <p className="mt-2 text-[13px] text-white/50">{p.tagline}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((ft) => <li key={ft} className="flex items-start gap-2 text-[13px] text-white/65"><Check size={15} className="mt-0.5 shrink-0 text-iris" /> {ft}</li>)}
                </ul>
                <Link href="/sign-up" className={`mt-7 inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${p.featured ? "text-white hover:-translate-y-0.5" : "border border-white/15 text-white/80 hover:border-white/30 hover:text-white"}`} style={p.featured ? { background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 10px 30px -10px rgba(110,123,255,0.7)" } : undefined}>{p.cta} <ArrowRight size={15} /></Link>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}><p className="mt-6 text-center text-[12px] text-white/35">Need team seats, white-label or an API? <Link href="/pricing" className="text-iris hover:underline">See Studio &amp; Enterprise →</Link></p></Reveal>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative mx-auto max-w-3xl px-6 py-24">
        <Reveal><h2 className="text-center text-[clamp(1.8rem,4vw,2.8rem)] font-medium tracking-tight" style={{ fontFamily: SERIF }}>Questions</h2></Reveal>
        <div className="mt-10"><FaqList /></div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden px-6 py-32 text-center">
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(110,123,255,0.14), transparent 70%)" }} />
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-tight tracking-tight" style={{ fontFamily: SERIF }}>Build your first map<br />in the next five minutes</h2>
          <Link href="/sign-up" className="mt-9 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 14px 40px -12px rgba(110,123,255,0.7)" }}>Start free <ArrowRight size={16} /></Link>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-white/45">
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-iris" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-iris" /> Renders stay on your machine</span>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/8 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[12px] text-white/40 sm:flex-row">
          <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)" }}><span className="text-[10px] font-black">M</span></span><span className="font-medium text-white/65" style={{ fontFamily: SERIF }}>Mapanisy</span><span>· The AI story-map studio</span></div>
          <div className="flex items-center gap-5"><Link href="/pricing" className="hover:text-white/70">Pricing</Link><Link href="/sign-in" className="hover:text-white/70">Sign in</Link><Link href="/sign-up" className="hover:text-white/70">Start free</Link></div>
        </div>
      </footer>
    </div>
  );
};

/* ───────────────────────── sub-components ───────────────────────── */

const TiltCard: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; t: string; b: string }> = ({ icon: Icon, t, b }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(800px) rotateX(${py * -6}deg) rotateY(${px * 6}deg) translateY(-4px)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 hover:border-iris/40 hover:bg-white/[0.05]" style={{ transition: "transform .15s ease-out, border-color .3s, background-color .3s" }}>
      <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl text-iris ring-1 ring-iris/25" style={{ background: "rgba(110,123,255,0.1)" }}><Icon size={20} /></div>
      <h3 className="mb-2 text-[16px] font-medium">{t}</h3>
      <p className="text-[14px] leading-relaxed text-white/50">{b}</p>
    </div>
  );
};

const StatsBand: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const run = useInView(ref, 0.4);
  const looks = useCountUp(12, run);
  const mins = useCountUp(5, run);
  const STATS: { n: string; label: string }[] = [
    { n: `${looks}+`, label: "cinematic looks" },
    { n: "4K", label: "· 24fps broadcast" },
    { n: "∞", label: "renders on paid" },
    { n: `${mins} min`, label: "to your first map" },
  ];
  return (
    <section ref={ref} className="relative border-y border-white/8 px-6 py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="text-[clamp(2.2rem,5vw,3.4rem)] font-medium tracking-tight" style={{ fontFamily: SERIF, background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{s.n}</div>
            <div className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/45">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const FaqList: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {FAQS.map(([q, a], i) => (
        <Reveal key={i} delay={i * 50}>
          <button onClick={() => setOpen(open === i ? null : i)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 text-left transition-colors hover:border-white/20">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[15px] font-medium text-white/90">{q}</span>
              <ChevronDown size={18} className={`shrink-0 text-iris transition-transform duration-300 ${open === i ? "rotate-180" : ""}`} />
            </div>
            <div className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.4,0,.2,1)]" style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}>
              <div className="overflow-hidden"><p className="pt-3 text-[14px] leading-relaxed text-white/55">{a}</p></div>
            </div>
          </button>
        </Reveal>
      ))}
    </div>
  );
};

/* ───────────────────────── data ───────────────────────── */

const FEATURES = [
  { icon: Globe2, t: "Tell it once", b: "Describe your idea and the director asks the 3–4 questions that matter, then builds the best version." },
  { icon: Route, t: "Drop a GPS track", b: "GPX, TCX, KML — a run, hike, flight or drive becomes an animated flythrough." },
  { icon: Film, t: "Cinematic camera", b: "Fly in, orbit, push, pull back — tuned with sliders. No keyframes, ever." },
  { icon: MountainSnow, t: "Looks that grade themselves", b: "Documentary noir, topographic, satellite — every style locks a cohesive palette and grade." },
  { icon: MousePointer2, t: "Edit by asking", b: "Click anything in the preview to drag and scale it, or just type what to change." },
  { icon: Share2, t: "Share & export 4K", b: "Send a read-only viewer link, or render a broadcast-ready 4K clip in any aspect." },
];

const USES = [
  { icon: Film, t: "YouTubers", b: "Drop a script and get broadcast-grade map shots between your cuts — in minutes, not a freelancer's week." },
  { icon: Globe2, t: "Journalists", b: "Fact-checked on-air explainers — conflict maps, expansions, supply routes — graded and citation-ready." },
  { icon: Route, t: "Travel creators", b: "Turn a GPX track into a cinematic flythrough of your trek, ride or flight." },
];

const LOOKS = ["Documentary noir", "Topographic", "Satellite", "Blueprint", "Minimal mono", "Golden hour", "Neon noir", "Papercraft", "Aurora", "War room", "Sakura", "Holographic"];

const FAQS: [string, string][] = [
  ["Do I need design skills?", "No. Describe your idea in a sentence; the director researches it, composes the shot and grades the look. You fine-tune with sliders or just by asking."],
  ["How do renders work?", "A tiny agent runs on your machine (macOS, Windows or Linux) and renders true 4K locally — so paid plans get unlimited renders and your files never leave your computer."],
  ["Is it really unlimited?", "Yes, on every paid plan. Renders run on your hardware, so we don't meter them."],
  ["What can I import?", "A sentence, or a GPS track (GPX, TCX, KML, GeoJSON) — a run, hike, flight or drive becomes an animated flythrough."],
  ["Can I share or export?", "Send a read-only viewer link to anyone, or export a broadcast-ready 4K clip in landscape, vertical or square."],
];

const PRICING = [
  { name: "Free", price: "$0", suffix: "", tagline: "For trying it out.", featured: false, cta: "Start free", features: ["3 animations / month", "1080p export", "Watermark", "All scene types"] },
  { name: "Creator", price: "$19", suffix: "/mo", tagline: "For solo creators.", featured: true, cta: "Start free", features: ["Unlimited 4K renders", "No watermark", "All styles + GPS tracks", "Public share links"] },
  { name: "Pro", price: "$39", suffix: "/mo", tagline: "For power users.", featured: false, cta: "Go Pro", features: ["Everything in Creator", "AI Director + story arcs", "Brand kits + NLE export", "Priority support"] },
];
