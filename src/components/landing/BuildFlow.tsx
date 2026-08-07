"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles, Check, X, Wand2, MapPin, Film, Globe2 } from "lucide-react";
import { interpret } from "@/lib/parse";

/**
 * BuildFlow — the immersive "click → start building" experience that replaces a
 * plain navigation from the landing page into the studio.
 *
 * Three acts:
 *   1. IGNITE   — a cinematic reveal: a world of glowing map outlines draws
 *                 itself and pushes in, with rotating status ("Reading your
 *                 story…"). Feels like the machine came alive around the idea.
 *   2. BUILD    — 3 quick, tappable questions (mood · length · look). No form,
 *                 no typing, no login — it feels like directing, and it's free.
 *   3. READY    — the gate. The animation is "ready"; to render & watch it the
 *                 visitor signs up (and picks a plan). We market the first
 *                 animation as free right here.
 *
 * The assembled brief (original idea + answers) is stored as the studio seed so
 * whatever the visitor lands in already knows their whole story + chosen look.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

type Opt = { e: string; l: string; v: string };
type Question = { id: "vibe" | "length" | "look"; q: string; hint: string; opts: Opt[] };

const QUESTIONS: Question[] = [
  {
    id: "vibe", q: "What's the mood?", hint: "sets the camera energy & pacing",
    opts: [
      { e: "🎬", l: "Cinematic", v: "cinematic" },
      { e: "📖", l: "Documentary", v: "documentary" },
      { e: "✨", l: "Playful", v: "playful" },
      { e: "⚡", l: "Epic", v: "epic" },
    ],
  },
  {
    id: "length", q: "How long?", hint: "we'll pace the beats to fit",
    opts: [
      { e: "⚡", l: "15s short", v: "a punchy 15 second" },
      { e: "🎞", l: "30 seconds", v: "a 30 second" },
      { e: "🎥", l: "60 seconds", v: "a full 60 second" },
    ],
  },
  {
    id: "look", q: "Pick the look", hint: "the whole map restyles around it",
    opts: [
      { e: "🛰", l: "Satellite", v: "satellite" },
      { e: "🗺", l: "Simple map", v: "clean simple map" },
      { e: "🏔", l: "3D terrain", v: "3D terrain" },
      { e: "🌑", l: "Dark editorial", v: "dark editorial" },
    ],
  },
];

const STATUS = [
  "Reading your story…",
  "Scouting the geography…",
  "Framing the opening shot…",
  "Warming up the director…",
];

/** The cinematic outline world that draws itself and pushes in during IGNITE. */
const OutlineWorld: React.FC<{ push: number }> = ({ push }) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
    <svg viewBox="0 0 800 450" className="h-full w-full" preserveAspectRatio="xMidYMid slice"
      style={{ transform: `scale(${push})`, transition: "transform 2.4s cubic-bezier(.2,.6,.2,1)", filter: "drop-shadow(0 0 22px rgba(110,123,255,0.35))" }}>
      <defs>
        <linearGradient id="bfStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9CA6FF" /><stop offset="55%" stopColor="#2FE0FF" /><stop offset="100%" stopColor="#B57BFF" />
        </linearGradient>
        <radialGradient id="bfGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="rgba(110,123,255,0.18)" /><stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#bfGlow)" />
      {/* graticule */}
      {[70, 140, 210, 280, 350, 420].map((y) => (
        <path key={`la${y}`} d={`M0 ${y} Q 400 ${y - 22}, 800 ${y}`} fill="none" stroke="#6E7BFF" strokeOpacity="0.12" strokeWidth="1" />
      ))}
      {[100, 220, 340, 460, 580, 700].map((x) => (
        <path key={`lo${x}`} d={`M${x} 0 Q ${x + 14} 225, ${x} 450`} fill="none" stroke="#6E7BFF" strokeOpacity="0.12" strokeWidth="1" />
      ))}
      {/* continents — draw-on strokes */}
      {[
        "M70 150 Q140 90 230 110 Q300 128 285 205 Q265 275 175 268 Q95 260 70 150 Z",
        "M330 250 Q400 200 480 224 Q548 246 528 320 Q505 385 405 368 Q335 350 330 250 Z",
        "M540 90 Q620 55 700 92 Q752 120 726 182 Q690 245 600 220 Q525 195 540 90 Z",
      ].map((d, i) => (
        <path key={i} d={d} fill="rgba(110,123,255,0.05)" stroke="url(#bfStroke)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: `bfDraw 1.6s ease ${0.15 + i * 0.28}s forwards` }} />
      ))}
      {/* a glowing route arc igniting between two nodes */}
      <path d="M150 210 C 300 90, 460 300, 660 150" fill="none" stroke="#2FE0FF" strokeWidth="2.6" strokeLinecap="round"
        pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "bfDraw 1.4s ease 0.8s forwards", filter: "drop-shadow(0 0 7px #2FE0FF)" }} />
      {[[150, 210], [660, 150], [405, 300]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="4" fill="#fff" />
          <circle cx={cx} cy={cy} fill="none" stroke="#9CA6FF" strokeWidth="1.5" style={{ animation: `bfPing 2.4s ease-out ${i * 0.5}s infinite` }} />
        </g>
      ))}
    </svg>
  </div>
);

export const BuildFlow: React.FC<{
  idea: string;
  signedIn?: boolean;
  /** The look the visitor already tapped on the hero — pre-selects it here so
   *  their choice carries into the brief (and the generated film's style). */
  initialLook?: string;
  onClose: () => void;
}> = ({ idea, signedIn, initialLook, onClose }) => {
  const [phase, setPhase] = useState<"ignite" | "build" | "ready">("ignite");
  const [push, setPush] = useState(1.28);
  const [statusI, setStatusI] = useState(0);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Opt>>(() => {
    const opt = initialLook ? QUESTIONS.find((q) => q.id === "look")?.opts.find((o) => o.v === initialLook) : undefined;
    const init: Record<string, Opt> = {};
    if (opt) init.look = opt;
    return init;
  });
  const startedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // What we understood from their sentence — shown during ignite so the reveal
  // reads as the director reacting to THEIR story, not a generic loading screen.
  const understood = useMemo(() => {
    const t = (idea ?? "").trim();
    if (t.length < 2) return null;
    try {
      const it = interpret(t);
      const journey = (it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations).slice(0, 4);
      return { journey, style: it.style?.style ?? null, context: it.context };
    } catch { return null; }
  }, [idea]);
  const hasUnderstanding = !!understood && (understood.journey.length > 0 || !!understood.style);

  // IGNITE choreography → hand off to the questions.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Move focus into the dialog so keyboard + screen-reader users are placed
    // inside the overlay (and Esc/Tab act on it), and restore focus on close.
    const returnTo = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => { setPush(1); dialogRef.current?.focus(); });
    const s = setInterval(() => setStatusI((i) => (i + 1) % STATUS.length), 620);
    const go = setTimeout(() => { clearInterval(s); setPhase("build"); }, 2500);
    return () => { clearInterval(s); clearTimeout(go); returnTo?.focus?.(); };
  }, []);

  // Esc closes the whole flow.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const pick = (q: Question, o: Opt) => {
    const next = { ...answers, [q.id]: o };
    setAnswers(next);
    setTimeout(() => {
      if (step < QUESTIONS.length - 1) setStep(step + 1);
      else setPhase("ready");
    }, 260);
  };

  // Assemble the studio seed from the idea + the visitor's choices.
  const brief = useMemo(() => {
    const base = idea.trim() || "A cinematic map story";
    const len = answers.length?.v ? `${answers.length.v} ` : "";
    const vibe = answers.vibe?.v ? `${answers.vibe.v} ` : "";
    const look = answers.look?.v ? `, ${answers.look.v} style` : "";
    return `${base} — ${len}${vibe}map animation${look}`.replace(/\s+/g, " ").trim();
  }, [idea, answers]);

  const handoff = () => {
    try { localStorage.setItem("mapanisy-seed-prompt", brief); } catch { /* private mode */ }
    // Signed-in creators go straight into the studio with their brief; new
    // visitors sign up (and choose a plan) before the first render — that's the
    // gate. Their whole brief waits for them on the other side.
    window.location.href = signedIn ? "/home" : "/sign-up?redirect_url=%2Fhome";
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Build your map animation"
      tabIndex={-1}
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden outline-none"
      style={{ background: "#04060f", animation: "bfFade .35s ease" }}
    >
      <style>{`
        @keyframes bfFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bfDraw { to { stroke-dashoffset: 0 } }
        @keyframes bfPing { 0% { r: 4; opacity: .9 } 70% { r: 26; opacity: 0 } 100% { opacity: 0 } }
        @keyframes bfRise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes bfGlowPulse { 0%,100% { box-shadow: 0 0 0 1px rgba(110,123,255,.3), 0 0 60px rgba(110,123,255,.25) } 50% { box-shadow: 0 0 0 1px rgba(110,123,255,.5), 0 0 110px rgba(110,123,255,.45) } }
        @media (prefers-reduced-motion: reduce) { [data-bf] { animation: none !important } }
      `}</style>

      {/* the living outline world sits behind every phase */}
      <OutlineWorld push={push} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 60% at 50% 45%, transparent 30%, rgba(4,6,15,0.72) 100%)" }} />

      {/* close */}
      <button onClick={onClose} aria-label="Close" className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/50 backdrop-blur transition-colors hover:bg-white/10 hover:text-white" title="Close (Esc)">
        <X size={16} />
      </button>

      {/* ── ACT 1 · IGNITE ── */}
      {phase === "ignite" && (
        <div className="relative z-[2] flex flex-col items-center text-center" data-bf style={{ animation: "bfRise .5s ease both" }}>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-iris/40 bg-white/[0.05] px-4 py-1.5 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-iris opacity-70 motion-reduce:animate-none" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-iris" /></span>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#aab4ff]">Building your animation</span>
          </div>
          <div className="max-w-md px-6 text-[15px] italic text-white/45" style={{ fontFamily: SERIF }}>“{idea.trim() || "A cinematic map story"}”</div>
          {hasUnderstanding && (
            <div className="mt-4 flex max-w-lg flex-wrap items-center justify-center gap-1.5" data-bf style={{ animation: "bfRise .5s ease .12s both" }}>
              {understood!.context && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#2FE0FF]/30 bg-[#2FE0FF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7fe9ff]">
                  <Globe2 size={10} /> {understood!.context}
                </span>
              )}
              {understood!.journey.map((p, i) => (
                <span key={`${p}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRight size={11} className="text-iris/70" />}
                  <span className="inline-flex items-center gap-1 rounded-full border border-iris/35 bg-iris/12 px-2 py-0.5 text-[11px] font-medium text-[#aab4ff]">
                    <MapPin size={10} /> {p}
                  </span>
                </span>
              ))}
              {understood!.style && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#B57BFF]/30 bg-[#B57BFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#d3b3ff]">
                  <Film size={10} /> {understood!.style}
                </span>
              )}
            </div>
          )}
          <div key={statusI} className="mt-6 text-[13px] font-semibold text-white/75" data-bf style={{ animation: "bfRise .4s ease both" }}>{STATUS[statusI]}</div>
        </div>
      )}

      {/* ── ACT 2 · BUILD (the quick, free, no-login questions) ── */}
      {phase === "build" && (
        <div className="relative z-[2] w-[min(94vw,560px)] px-6 text-center" key={step} data-bf style={{ animation: "bfRise .45s cubic-bezier(.3,1.1,.4,1) both" }}>
          {/* progress dots */}
          <div className="mb-6 flex items-center justify-center gap-1.5">
            {QUESTIONS.map((_, i) => (
              <span key={i} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === step ? 22 : 7, background: i <= step ? "#6E7BFF" : "rgba(255,255,255,0.16)" }} />
            ))}
          </div>
          <h2 className="text-[clamp(1.5rem,3.6vw,2.2rem)] font-medium tracking-tight text-white" style={{ fontFamily: SERIF }}>{QUESTIONS[step].q}</h2>
          <p className="mt-1.5 text-[12px] text-white/40">{QUESTIONS[step].hint}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            {QUESTIONS[step].opts.map((o) => {
              const on = answers[QUESTIONS[step].id]?.v === o.v;
              return (
                <button key={o.v} onClick={() => pick(QUESTIONS[step], o)}
                  className={`group inline-flex items-center gap-2 rounded-2xl border px-5 py-3.5 text-[14px] font-semibold backdrop-blur transition-all hover:-translate-y-0.5 ${on ? "border-iris/70 bg-iris/20 text-white" : "border-white/12 bg-white/[0.05] text-white/70 hover:border-iris/50 hover:text-white"}`}>
                  <span className="text-[18px] transition-transform group-hover:scale-110" aria-hidden>{o.e}</span> {o.l}
                </button>
              );
            })}
          </div>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="mt-6 text-[11.5px] text-white/35 transition-colors hover:text-white/70">← back</button>
          )}
        </div>
      )}

      {/* ── ACT 3 · READY (the gate) ── */}
      {phase === "ready" && (
        <div className="relative z-[2] w-[min(94vw,540px)] px-6 text-center" data-bf style={{ animation: "bfRise .5s cubic-bezier(.3,1.1,.4,1) both" }}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl" data-bf style={{ background: "linear-gradient(135deg,#6E7BFF,#B57BFF)", animation: "bfGlowPulse 3s ease-in-out infinite" }}>
            <Wand2 size={24} className="text-white" />
          </div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            <Check size={12} /> Your first animation is free
          </div>
          <h2 className="text-[clamp(1.7rem,4vw,2.6rem)] font-medium leading-tight tracking-tight text-white" style={{ fontFamily: SERIF }}>
            Your map story is ready<br /><span className="text-white/45">to come to life.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-[13.5px] leading-relaxed text-white/55">
            {signedIn
              ? "Jump into the studio — the director will render your brief and open it for you to refine."
              : "Create your free account to render it in 4K and watch it. No credit card — pick your plan after you see it move."}
          </p>

          {/* the assembled brief, shown back so it feels theirs */}
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-[12.5px] italic text-[#c3d4ff]" style={{ fontFamily: SERIF }}>
            “{brief}”
          </div>

          <button onClick={handoff}
            className="mt-7 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5 active:scale-95"
            style={{ background: "linear-gradient(135deg,#6E7BFF,#B57BFF)", boxShadow: "0 14px 44px -10px rgba(110,123,255,0.75)" }}>
            <Sparkles size={16} /> {signedIn ? "Open in the studio" : "Sign up free & watch it"} <ArrowRight size={16} />
          </button>
          <div className="mt-4">
            <button onClick={() => { setStep(0); setPhase("build"); }} className="text-[11.5px] text-white/35 transition-colors hover:text-white/70">← tweak my choices</button>
          </div>
        </div>
      )}
    </div>
  );
};
