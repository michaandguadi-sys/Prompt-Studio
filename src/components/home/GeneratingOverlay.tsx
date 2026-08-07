"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Minimize2, Maximize2, AlertTriangle, Clock, Coins, MapPin, ArrowRight, Film, Globe2 } from "lucide-react";
import { interpret } from "@/lib/parse";

/**
 * THE BUILD — a full-screen, cinematic loading experience for map generation.
 *
 * The whole viewport becomes a live 3D cityscape being SCANNED and BUILT: a
 * perspective grid of buildings rises out of the ground as a scan-plane sweeps
 * across it (the "we're building your map" promise, rendered), with the AI's
 * phase, a real ETA countdown, and a live token/credit meter overlaid. Pure
 * canvas — one rAF loop — so it costs nothing while the AI works. Minimizable to
 * a floating pill so the user can keep browsing; never blocks navigation.
 */

/** Render at document.body — the overlay is mounted inside the home page's
 *  glass prompt card, whose backdrop-filter traps `position:fixed` children in
 *  a local stacking context. A portal escapes that; z-[300] sits above chrome. */
const portal = (node: React.ReactNode) =>
  typeof document === "undefined" ? null : createPortal(node, document.body);

const DIRECTOR_STATUS = [
  "Understanding your vision…",
  "Director researching the story…",
  "Mapping the narrative arc…",
  "Identifying key locations…",
  "Fact-checking the angles…",
  "Writing the editorial script…",
  "Locking the beat structure…",
];

const COMPOSER_STATUS = [
  "Composer designing the animation…",
  "Framing the establishing shot…",
  "Plotting the camera moves…",
  "Building the 3D terrain…",
  "Raising the city blocks…",
  "Placing labels & markers…",
  "Timing each beat…",
  "Colour-grading the scene…",
  "Striking the cinematic print…",
];

const STATUS = [
  "Scouting the location…",
  "Building the 3D terrain…",
  "Raising the city…",
  "Drawing the route…",
  "Placing labels & markers…",
  "Colour-grading the scene…",
  "Striking the cinematic print…",
];

const FACTS = [
  "Russia spans 11 time zones — sunrise to sunset never quite ends.",
  "The Pacific Ocean is larger than all of Earth's land combined.",
  "Africa is big enough to hold the US, China, India and most of Europe.",
  "Istanbul is the only major city sitting on two continents.",
  "Point Nemo, the ocean's loneliest spot, is ~2,688 km from any land.",
  "Mercator maps lie about size: Africa is ~14× larger than Greenland.",
  "Australia is wider than the Moon — about 4,000 km vs 3,475 km.",
  "Canada holds more lake water than every other country combined.",
  "Nepal's flag is the only national flag that isn't a rectangle.",
  "The equator runs through 13 countries — you spin at ~1,670 km/h on it.",
  "Mount Chimborazo's summit, not Everest's, is farthest from Earth's centre.",
  "Alaska is both the westernmost and easternmost US state — it crosses 180°.",
  "The Sahara desert is roughly the size of the United States.",
  "The shortest land border runs ~85 m, between Italy and the Vatican.",
];

/**
 * BuildScape — a live 3D city being built. A perspective grid recedes to a
 * horizon; buildings rise as a scan-plane sweeps up the grid, glowing along the
 * scan line; a route arc draws over the top; the camera slowly orbits. One
 * canvas, one rAF loop. Reduced-motion: renders a calm static frame.
 */
const BuildScape: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const COLS = 34, DEPTH = 24;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (typeof document !== "undefined" && document.hidden) return;
      const t = reduce ? 6 : (ts - t0) / 1000;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const horizon = H * 0.40;
      const yaw = reduce ? 0.06 : Math.sin(t * 0.16) * 0.16;   // slow orbit
      const scan = reduce ? 0.7 : (t * 0.16) % 1.4;            // 0..1.4 build sweep (holds at top)

      // Draw far → near (painter's order).
      for (let d = 0; d < DEPTH; d++) {
        const p = d / (DEPTH - 1);                              // 0 far .. 1 near
        const persp = 0.12 + p * p * 1.2;
        const rowY = horizon + Math.pow(p, 1.35) * (H - horizon);
        const rowW = W * (0.26 + p * 1.6);

        // ground grid line
        ctx.strokeStyle = `rgba(110,123,255,${0.04 + persp * 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - rowW / 2, rowY); ctx.lineTo(cx + rowW / 2, rowY); ctx.stroke();

        for (let c = 0; c < COLS; c++) {
          const fx = c / (COLS - 1) - 0.5;
          const sx = cx + (fx + yaw * (1 - p) * 0.7) * rowW;
          if (sx < -60 || sx > W + 60) continue;
          const seed = c * 12.9898 + d * 78.233;
          const rnd = (n: number) => { const v = Math.sin(seed + n * 43.1) * 43758.5453; return v - Math.floor(v); };
          if (rnd(9) > 0.86) continue; // some empty plots — reads as a real city
          const wave = (Math.sin(fx * 6 + t * 0.8) + Math.cos(p * 7 - t * 0.6)) * 0.5;
          const rise = Math.max(0, Math.min(1, (scan - p) * 4 + 0.12));       // 0..1 built as scan passes
          const near = Math.max(0, 1 - Math.abs(scan - p) * 5.5);             // glow at the scan line
          const baseH = (14 + rnd(1) * 52 + wave * 16) * persp;
          const h = baseH * (0.14 + rise * 0.86);
          const bw = Math.max(1.4, (rowW / COLS) * (0.5 + rnd(2) * 0.45));
          const topY = rowY - h;
          const lit = Math.max(near, rise > 0.03 && rise < 0.97 ? 0.28 : 0);
          const alpha = Math.min(0.94, 0.14 + persp * 0.5 + lit * 0.5);
          const g = ctx.createLinearGradient(0, topY, 0, rowY);
          g.addColorStop(0, `rgba(${(120 + lit * 135) | 0},${(150 + lit * 90) | 0},255,${alpha})`);
          g.addColorStop(1, `rgba(22,32,78,${alpha * 0.34})`);
          ctx.fillStyle = g;
          ctx.fillRect(sx - bw / 2, topY, bw, h);
          if (lit > 0.22) { // hot roofline as the scan builds it
            ctx.fillStyle = `rgba(${(160 + lit * 95) | 0},255,255,${lit})`;
            ctx.fillRect(sx - bw / 2, topY - 1.3, bw, 2.2);
          }
        }
      }

      // The scan sweep band + line.
      const sp = Math.min(1, scan);
      const scanY = horizon + Math.pow(sp, 1.35) * (H - horizon);
      const band = ctx.createLinearGradient(0, scanY - 46, 0, scanY + 12);
      band.addColorStop(0, "rgba(47,224,255,0)");
      band.addColorStop(1, "rgba(47,224,255,0.15)");
      ctx.fillStyle = band; ctx.fillRect(0, scanY - 46, W, 58);
      ctx.strokeStyle = "rgba(150,255,255,0.45)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();

      // A glowing route arc drawing across the built city.
      const rp = reduce ? 1 : (t * 0.4) % 1;
      const ax = W * 0.18, ay = horizon + (H - horizon) * 0.62;
      const bx = W * 0.82, by = horizon + (H - horizon) * 0.5;
      const mx = W * 0.5, my = horizon + (H - horizon) * 0.16;
      ctx.strokeStyle = "rgba(110,123,255,0.9)"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.shadowColor = "rgba(110,123,255,0.8)"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      const steps = 40;
      for (let i = 1; i <= steps * rp; i++) {
        const u = i / steps, v = 1 - u;
        ctx.lineTo(v * v * ax + 2 * v * u * mx + u * u * bx, v * v * ay + 2 * v * u * my + u * u * by);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ maskImage: "linear-gradient(to bottom, transparent, #000 16%, #000 86%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 16%, #000 86%, transparent)" }}
    />
  );
};

/** Human "3s" / "1m 20s" from seconds. */
function fmt(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

export const GeneratingOverlay: React.FC<{
  open: boolean;
  idea?: string;
  styleName?: string;
  current?: number;
  total?: number;
  phase?: "director" | "composer";
  /** Post-generation warning to surface (e.g. truncation). */
  warning?: string | null;
  /** Estimated token count — drives the live "credits used" meter. */
  estimatedTokens?: number;
}> = ({ open, idea, styleName, current, total, phase, warning, estimatedTokens }) => {
  const [statusI, setStatusI] = useState(0);
  const [factI, setFactI] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // What the director understood about THIS story — the same instant intent
  // engine that drove the map. Shown while it builds, so the wait reads as the
  // AI working on YOUR film (places, journey, look, runtime), not a generic load.
  const understood = useMemo(() => {
    const t = (idea ?? "").trim();
    if (t.length < 2) return null;
    try {
      const it = interpret(t);
      const journey = (it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations).slice(0, 4);
      return { journey, style: it.style?.style ?? null, dur: it.durationSec > 0 ? Math.round(it.durationSec) : 0, context: it.context };
    } catch { return null; }
  }, [idea]);
  const hasUnderstanding = !!understood && (understood.journey.length > 0 || !!understood.style);

  const multi = (total ?? 0) > 1;
  const pct = multi ? Math.round(((current ?? 1) / total!) * 100) : undefined;
  const statusArr = phase === "director" ? DIRECTOR_STATUS : phase === "composer" ? COMPOSER_STATUS : STATUS;

  // A single scene runs ~19s (director + composer, GLM-class). Multi-scene
  // stories run per-scene. This is the ETA baseline; it's honest — it counts
  // down, and if the model runs long it holds at "almost there".
  const estTotalMs = (multi ? total! : 1) * 19_000;
  const timeFrac = Math.min(1, elapsedMs / estTotalMs);
  // Real multi-scene progress when we have it; else the elapsed estimate capped
  // at 96% so the bar never claims "done" before it is.
  const progress = multi && pct !== undefined ? pct / 100 : Math.min(0.96, timeFrac);
  const remainSec = Math.max(0, estTotalMs - elapsedMs) / 1000;
  // Live token/credit meter — ticks toward the estimate over the elapsed time.
  const liveTokens = estimatedTokens && estimatedTokens > 0
    ? Math.round(estimatedTokens * Math.min(1, timeFrac * 1.02))
    : 0;

  useEffect(() => {
    if (!open) { setMinimized(false); setWarningDismissed(false); setElapsedMs(0); return; }
    setStatusI(0);
    setFactI(Math.floor(Math.random() * FACTS.length));
    const t0 = performance.now();
    const s = setInterval(() => setStatusI((i) => (i + 1) % statusArr.length), 2600);
    const f = setInterval(() => setFactI((i) => (i + 1) % FACTS.length), 5600);
    const e = setInterval(() => setElapsedMs(performance.now() - t0), 120);
    return () => { clearInterval(s); clearInterval(f); clearInterval(e); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setStatusI(0); }, [phase]);

  if (!open) return null;

  const tokenLabel = liveTokens >= 1000 ? `${(liveTokens / 1000).toFixed(1)}k` : `${liveTokens}`;
  const estLabel = estimatedTokens ? (estimatedTokens >= 1000 ? `${Math.round(estimatedTokens / 1000)}k` : `${estimatedTokens}`) : "";

  // ── FLOATING PILL (minimized) ────────────────────────────────────────────
  if (minimized) {
    return portal(
      <div
        className="fixed bottom-5 right-5 z-[300] flex items-center gap-3 rounded-2xl border border-[#6E7BFF]/30 bg-[#06070d]/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        style={{ animation: "goPillRise .3s cubic-bezier(.34,1.56,.64,1)" }}
      >
        <style>{`@keyframes goPillRise{from{opacity:0;transform:translateY(16px) scale(.92)}to{opacity:1;transform:none}}@keyframes goRingSpin{to{transform:rotate(360deg)}}.goRing{animation:goRingSpin 1.6s linear infinite}@media (prefers-reduced-motion: reduce){.goRing{animation:none}}`}</style>
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <svg className="goRing absolute inset-0" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(110,123,255,0.15)" strokeWidth="2" />
            <circle cx="16" cy="16" r="13" fill="none" stroke="#6E7BFF" strokeWidth="2" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 13 * progress} ${2 * Math.PI * 13 * (1 - progress)}`} />
          </svg>
          <span className="relative h-2 w-2 rounded-full bg-[#6E7BFF]" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-white/90">
            {phase === "director" ? "Director researching…" : phase === "composer" ? "Composer building…" : "Building your map…"}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
            <span className="tabular-nums">~{fmt(remainSec)} left</span>
            {liveTokens > 0 && <span className="tabular-nums">· {tokenLabel} tok</span>}
          </div>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          title="Expand"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  // ── FULLSCREEN BUILD ─────────────────────────────────────────────────────
  return portal(
    <div className="fixed inset-0 z-[300] overflow-y-auto" style={{ animation: "goFade .35s ease", background: "#04060f" }}>
      <style>{`
        @keyframes goFade { from{opacity:0} to{opacity:1} }
        @keyframes goRise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes goBar  { 0%{transform:translateX(-100%)} 100%{transform:translateX(320%)} }
        @keyframes goSpin { to{transform:rotate(360deg)} }
        .go-status{animation:goRise .4s ease}
        @media (prefers-reduced-motion: reduce){ .go-anim{animation:none!important} }
      `}</style>

      {/* the live 3D city being built */}
      <BuildScape />
      {/* cinematic grade */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 70% at 50% 12%, rgba(110,123,255,0.12), transparent 60%), linear-gradient(to bottom, rgba(4,6,15,0.4), transparent 30%, transparent 60%, rgba(4,6,15,0.85))" }} />

      {/* minimize */}
      <button
        onClick={() => setMinimized(true)}
        className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/55 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
        title="Minimize — keeps building in the background"
      >
        <Minimize2 size={15} />
      </button>

      {/* centered content */}
      <div className="relative z-[2] flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
        {/* phase pills */}
        <div className="go-anim flex items-center gap-1.5" style={{ animation: "goRise .5s ease both" }}>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${phase === "director" ? "border-[#6E7BFF]/50 bg-[#6E7BFF]/15 text-[#9CA6FF]" : "border-white/10 bg-white/[0.03] text-white/40"}`}>
            {phase === "director"
              ? <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6E7BFF] opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6E7BFF]" /></span>
              : <span className="text-[10px] text-[#2FE0FF]">✓</span>}
            Director
          </span>
          <span className="text-white/25">→</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${phase === "composer" ? "border-[#2FE0FF]/45 bg-[#2FE0FF]/10 text-[#2FE0FF]" : "border-white/10 bg-white/[0.03] text-white/40"}`}>
            {phase === "composer" && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2FE0FF] opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2FE0FF]" /></span>}
            Composer
          </span>
          {styleName && <span className="ml-1 truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/55">{styleName}</span>}
        </div>

        {/* headline status */}
        <h2 key={statusI} className="go-status mt-6 max-w-2xl text-[clamp(1.5rem,4vw,2.6rem)] font-medium leading-tight tracking-[-0.02em] text-white" style={{ fontFamily: "Newsreader, 'Playfair Display', Georgia, serif", textShadow: "0 2px 30px rgba(4,6,16,0.7)" }}>
          {statusArr[statusI % statusArr.length]}
        </h2>
        {idea && <div className="mt-3 max-w-lg truncate text-[13px] italic text-white/45">“{idea}”</div>}

        {/* What the director understood about THIS story — the wait feels like
            the AI is working on YOUR film, not spinning a generic loader. */}
        {hasUnderstanding && (
          <div className="go-anim mt-4 flex max-w-xl flex-wrap items-center justify-center gap-1.5" style={{ animation: "goRise .5s ease .1s both" }}>
            {understood!.context && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#2FE0FF]/30 bg-[#2FE0FF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7fe9ff]">
                <Globe2 size={10} /> {understood!.context}
              </span>
            )}
            {understood!.journey.map((p, i) => (
              <span key={`${p}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <ArrowRight size={11} className="text-[#6E7BFF]/70" />}
                <span className="inline-flex items-center gap-1 rounded-full border border-[#6E7BFF]/35 bg-[#6E7BFF]/12 px-2 py-0.5 text-[11px] font-medium text-[#aab4ff]">
                  <MapPin size={10} /> {p}
                </span>
              </span>
            ))}
            {understood!.style && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#B57BFF]/30 bg-[#B57BFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#d3b3ff]">
                <Film size={10} /> {understood!.style}
              </span>
            )}
            {understood!.dur > 0 && (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/45">~{understood!.dur}s</span>
            )}
          </div>
        )}

        {/* progress bar */}
        <div className="mt-8 w-full max-w-md">
          {multi && (
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-medium text-white/45">
              <span>Shot {Math.min(current ?? 1, total!)} of {total}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
          )}
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            {multi
              ? <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (pct ?? 0))}%`, background: "linear-gradient(90deg,#6E7BFF,#2FE0FF,#B57BFF)" }} />
              : <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, progress * 100)}%`, background: "linear-gradient(90deg,#6E7BFF,#2FE0FF,#B57BFF)" }} />}
          </div>

          {/* live meters: ETA + tokens/credits */}
          <div className="mt-4 flex items-stretch justify-center gap-2.5">
            <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur">
              <Clock size={15} className="shrink-0 text-[#9CA6FF]" />
              <div className="min-w-0 text-left">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">Est. wait</div>
                <div className="tabular-nums text-[15px] font-semibold text-white">{remainSec > 0.5 ? `~${fmt(remainSec)}` : "almost there…"}</div>
              </div>
            </div>
            {liveTokens > 0 && (
              <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur">
                <Coins size={15} className="shrink-0 text-[#2FE0FF]" />
                <div className="min-w-0 text-left">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">Tokens used</div>
                  <div className="tabular-nums text-[15px] font-semibold text-white">{tokenLabel}<span className="text-[11px] font-normal text-white/35"> / ~{estLabel}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* warning */}
        {warning && !warningDismissed && (
          <div className="go-status mt-5 flex max-w-md items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-2.5 text-left text-[11.5px] leading-relaxed text-amber-200/85 backdrop-blur">
            <AlertTriangle size={13} className="mt-px shrink-0 text-amber-400" />
            <span>{warning}</span>
            <button onClick={() => setWarningDismissed(true)} className="ml-auto shrink-0 text-amber-400/60 hover:text-amber-400"><X size={12} /></button>
          </div>
        )}

        {/* tappable earth fact */}
        <button
          onClick={() => setFactI((i) => (i + 1) % FACTS.length)}
          className="group mt-7 block max-w-md rounded-xl border border-[#6E7BFF]/15 bg-[#6E7BFF]/[0.06] px-4 py-2.5 text-left backdrop-blur transition-colors hover:border-[#6E7BFF]/30 hover:bg-[#6E7BFF]/[0.1]"
          title="Tap for another fact"
        >
          <div key={`f${factI}`} className="go-status flex items-start gap-2 text-[12px] leading-relaxed text-white/70">
            <span className="mt-px shrink-0 go-anim" style={{ display: "inline-block", animation: "goSpin 9s linear infinite" }}>🌍</span>
            <span><span className="font-semibold text-[#9CA6FF]">Did you know — </span>{FACTS[factI]}</span>
          </div>
        </button>
      </div>
    </div>
  );
};
