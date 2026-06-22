"use client";

import React, { useEffect, useState } from "react";

/**
 * THE DEVELOP — the full-screen cinematic moment the user watches while the
 * director shoots their film. Not a modal: the screen becomes a cinema. A big
 * developing map frame (drawing route · assembling countries · radar sweep ·
 * Ken-Burns drift · grain + vignette) sits over a real FILMSTRIP whose cells
 * light up beat-by-beat as each shot is "struck". Rotating real-world map facts
 * and the production status keep the wait alive. Pure CSS/SVG, no deps.
 */

const STATUS = [
  "Scouting the location…",
  "Researching the facts…",
  "Framing the establishing shot…",
  "Plotting the camera move…",
  "Drawing the route…",
  "Highlighting the key regions…",
  "Placing labels & markers…",
  "Colour-grading the scene…",
  "Striking the cinematic print…",
];

const FACTS = [
  "Russia spans 11 time zones — sunrise to sunset never quite ends.",
  "The Pacific Ocean is larger than all of Earth’s land combined.",
  "Africa is big enough to hold the US, China, India and most of Europe.",
  "Istanbul is the only major city sitting on two continents.",
  "Point Nemo, the ocean’s loneliest spot, is ~2,688 km from any land.",
  "Mercator maps lie about size: Africa is ~14× larger than Greenland.",
  "Australia is wider than the Moon — about 4,000 km vs 3,475 km.",
  "Canada holds more lake water than every other country combined.",
  "Nepal’s flag is the only national flag that isn’t a rectangle.",
  "The equator runs through 13 countries — you spin at ~1,670 km/h on it.",
  "Mount Chimborazo’s summit, not Everest’s, is farthest from Earth’s centre.",
  "Alaska is both the westernmost and easternmost US state — it crosses 180°.",
  "The Vatican is the smallest country on Earth at just 0.49 km².",
  "The Sahara desert is roughly the size of the entire United States.",
  "The shortest land border runs ~85 m, between Italy and the Vatican.",
];

const CITIES = [
  { x: 60, y: 250, d: 0 }, { x: 300, y: 120, d: 0.9 }, { x: 540, y: 70, d: 1.8 }, { x: 470, y: 240, d: 1.3 },
];

/** A tiny developing-map thumbnail for one filmstrip cell. */
const CellMap: React.FC<{ seed: number }> = ({ seed }) => {
  const blobs = [
    "M14 18 L30 15 L36 26 L27 36 L15 31 Z",
    "M44 24 L58 22 L62 33 L52 41 L43 33 Z",
  ];
  const route = ["M10 40 C 26 28, 40 30, 60 16", "M12 14 C 28 26, 42 22, 60 38"][seed % 2];
  return (
    <svg viewBox="0 0 72 50" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="72" height="50" fill="#0a1024" />
      {[12, 24, 36].map((y) => <line key={y} x1="0" y1={y} x2="72" y2={y} stroke="#9CA6FF" strokeOpacity="0.07" strokeWidth="0.5" />)}
      <path d={blobs[seed % 2]} fill="#6E7BFF" fillOpacity="0.22" stroke="#9CA6FF" strokeOpacity="0.6" strokeWidth="0.6" />
      <path d={route} fill="none" stroke="#2FE0FF" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
};

export const GeneratingOverlay: React.FC<{
  open: boolean;
  idea?: string;
  styleName?: string;
  current?: number;
  total?: number;
}> = ({ open, idea, styleName, current, total }) => {
  const [statusI, setStatusI] = useState(0);
  const [factI, setFactI] = useState(0);
  const [tick, setTick] = useState(0); // drives single-scene cell cycling + timecode

  const multi = (total ?? 0) > 1;
  const cellCount = multi ? Math.min(total!, 8) : 4;
  const activeCell = multi ? Math.min((current ?? 1) - 1, cellCount - 1) : tick % cellCount;

  useEffect(() => {
    if (!open) return;
    setStatusI(0);
    setFactI(Math.floor(Math.random() * FACTS.length));
    const s = setInterval(() => setStatusI((i) => (i + 1) % STATUS.length), 1500);
    const f = setInterval(() => setFactI((i) => (i + 1) % FACTS.length), 3800);
    const c = setInterval(() => setTick((i) => i + 1), 900);
    return () => { clearInterval(s); clearInterval(f); clearInterval(c); };
  }, [open]);

  if (!open) return null;
  const pct = multi ? Math.round(((current ?? 1) / total!) * 100) : undefined;
  const timecode = `00:0${Math.min(9, Math.floor(tick / 2))}:${String((tick * 7) % 24).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden bg-[#06070d] px-6" style={{ animation: "dvFade .3s ease" }}>
      <style>{`
        @keyframes dvFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dvRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes dvDraw { 0% { stroke-dashoffset: 1100 } 60% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: 0 } }
        @keyframes dvPing { 0% { r: 4; opacity: .9 } 70% { r: 34; opacity: 0 } 100% { opacity: 0 } }
        @keyframes dvDot  { 0% { offset-distance: 0% } 60% { offset-distance: 100% } 100% { offset-distance: 100% } }
        @keyframes dvScan { 0% { transform: translateX(-80px); opacity: 0 } 50% { opacity: .55 } 100% { transform: translateX(760px); opacity: 0 } }
        @keyframes dvSpin { to { transform: rotate(360deg) } }
        @keyframes dvPiece { 0% { opacity: 0; transform: translateY(10px) scale(.9) } 55% { opacity: .95; transform: translateY(0) scale(1) } 100% { opacity: .9 } }
        @keyframes dvKen { 0% { transform: scale(1.08) translate(1%, -1%) } 100% { transform: scale(1.16) translate(-1.5%, 1.5%) } }
        @keyframes dvRecBlink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @keyframes dvShimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(220%) } }
        .dv-status { animation: dvRise .45s ease }
      `}</style>

      {/* Aurora + letterbox */}
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(120% 70% at 50% -10%, rgba(110,123,255,0.2), transparent 60%), radial-gradient(90% 60% at 50% 120%, rgba(47,224,255,0.12), transparent 55%)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[7vh] bg-black/70" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[7vh] bg-black/70" aria-hidden />

      {/* Eyebrow */}
      <div className="relative z-10 mb-4 flex items-center gap-2.5" style={{ animation: "dvRise .4s ease" }}>
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#6E7BFF]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.4em] gradient-text">{multi ? "Developing your film" : "Developing your shot"}</span>
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#2FE0FF]" />
      </div>

      {/* The developing cinema frame */}
      <div className="relative z-10 w-[min(92vw,720px)]" style={{ animation: "dvRise .5s ease" }}>
        <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black" style={{ aspectRatio: "16/9", boxShadow: "0 40px 120px -30px rgba(0,0,0,0.9), 0 0 70px -24px rgba(110,123,255,0.55)" }}>
          <div className="absolute inset-0" style={{ animation: "dvKen 9s ease-in-out infinite alternate" }}>
            <svg viewBox="0 0 600 338" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="dvRoute" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6E7BFF" /><stop offset="55%" stopColor="#B57BFF" /><stop offset="100%" stopColor="#2FE0FF" /></linearGradient>
                <radialGradient id="dvSky" cx="50%" cy="0%" r="90%"><stop offset="0%" stopColor="#1c2547" /><stop offset="70%" stopColor="#070b18" /></radialGradient>
                <radialGradient id="dvVig" cx="50%" cy="50%" r="70%"><stop offset="55%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.6" /></radialGradient>
              </defs>
              <rect x="0" y="0" width="600" height="338" fill="url(#dvSky)" />
              {[48, 96, 144, 192, 240, 288].map((y) => <line key={"h" + y} x1="0" y1={y} x2="600" y2={y} stroke="#9CA6FF" strokeOpacity="0.05" strokeWidth="0.6" />)}
              {[60, 150, 240, 330, 420, 510].map((x) => <line key={"v" + x} x1={x} y1="0" x2={x} y2="338" stroke="#9CA6FF" strokeOpacity="0.05" strokeWidth="0.6" />)}
              {[
                { d: "M70 130 L130 118 L156 168 L124 214 L78 196 Z", delay: 0 },
                { d: "M250 84 L320 96 L340 150 L294 188 L246 150 Z", delay: 0.5 },
                { d: "M430 168 L510 156 L536 212 L474 248 L432 210 Z", delay: 1 },
                { d: "M170 238 L240 224 L268 272 L214 302 L164 270 Z", delay: 1.5 },
              ].map((p, i) => (
                <path key={i} d={p.d} fill="#6E7BFF" fillOpacity="0.16" stroke="#9CA6FF" strokeWidth="0.9" strokeOpacity="0.5"
                  style={{ transformBox: "fill-box", transformOrigin: "center", animation: `dvPiece 3s ease-out ${p.delay}s infinite` } as React.CSSProperties} />
              ))}
              <g style={{ transformOrigin: "300px 170px", animation: "dvSpin 16s linear infinite", opacity: 0.1 }}>
                <circle cx="300" cy="170" r="130" fill="none" stroke="#9CA6FF" strokeWidth="0.7" strokeDasharray="3 6" />
                <line x1="300" y1="40" x2="300" y2="56" stroke="#9CA6FF" strokeWidth="1" />
              </g>
              <path d="M60 250 C 180 200, 220 110, 300 120 S 470 100, 540 70" fill="none" stroke="url(#dvRoute)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray="1100" style={{ animation: "dvDraw 3.2s ease-in-out infinite", filter: "drop-shadow(0 0 6px rgba(110,123,255,0.6))" }} />
              <circle r="4" fill="#2FE0FF" style={{ offsetPath: "path('M60 250 C 180 200, 220 110, 300 120 S 470 100, 540 70')", animation: "dvDot 3.2s ease-in-out infinite", filter: "drop-shadow(0 0 6px #2FE0FF)" } as React.CSSProperties} />
              {CITIES.map((c, i) => (
                <g key={i}><circle cx={c.x} cy={c.y} fill="none" stroke="#9CA6FF" strokeWidth="1.4" style={{ animation: `dvPing 2.6s ease-out ${c.d}s infinite` }} /><circle cx={c.x} cy={c.y} r="2.6" fill="#fff" /></g>
              ))}
              <rect x="-80" y="0" width="80" height="338" fill="#9CA6FF" opacity="0.12" style={{ animation: "dvScan 3s ease-in-out infinite" }} />
              <rect x="0" y="0" width="600" height="338" fill="url(#dvVig)" />
            </svg>
            <div className="absolute inset-0" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")", mixBlendMode: "overlay", opacity: 0.06 }} />
          </div>
          {/* HUD */}
          <div className="absolute left-4 top-3 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-red-500" style={{ animation: "dvRecBlink 1.1s ease-in-out infinite" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">Rec</span>
            <span className="ml-1 font-mono text-[10px] tabular-nums text-white/55">{timecode}</span>
          </div>
          <div className="absolute right-4 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] font-semibold tracking-wide text-white/70 backdrop-blur-sm">4K · 24FPS</div>
          <div className="absolute left-4 bottom-3 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide text-white/70 backdrop-blur-sm">ESTABLISHING</div>
          {/* corner ticks */}
          {[["left-2 top-2","border-l border-t"],["right-2 top-2","border-r border-t"],["left-2 bottom-2","border-l border-b"],["right-2 bottom-2","border-r border-b"]].map(([pos,b],i)=>(
            <span key={i} className={`pointer-events-none absolute ${pos} h-4 w-4 ${b} border-white/25`} />
          ))}
        </div>

        {/* The FILMSTRIP — beats being struck one by one */}
        <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#0a0c16] px-3 py-2.5">
          {/* sprockets */}
          <div className="mb-1.5 flex justify-between px-0.5">{Array.from({ length: 16 }).map((_, i) => <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/10" />)}</div>
          <div className="flex gap-2">
            {Array.from({ length: cellCount }).map((_, i) => {
              const done = i < activeCell, active = i === activeCell;
              return (
                <div key={i} className={`relative flex-1 overflow-hidden rounded-md border transition-all duration-300 ${active ? "border-[#6E7BFF] ring-1 ring-[#6E7BFF]/50" : done ? "border-[#2FE0FF]/40" : "border-white/8"}`} style={{ aspectRatio: "16/9", opacity: done ? 1 : active ? 1 : 0.4 }}>
                  <CellMap seed={i} />
                  {!done && !active && <div className="absolute inset-0 bg-black/55" />}
                  {active && <div className="absolute inset-0" style={{ background: "linear-gradient(100deg, transparent, rgba(110,123,255,0.35), transparent)", animation: "dvShimmer 1.4s ease-in-out infinite" }} />}
                  {done && <div className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2FE0FF] text-[8px] font-bold text-[#06121a]">✓</div>}
                  <div className="absolute bottom-0.5 left-1 text-[8px] font-bold tracking-wide text-white/70">{String(i + 1).padStart(2, "0")}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between px-0.5">{Array.from({ length: 16 }).map((_, i) => <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/10" />)}</div>
        </div>
      </div>

      {/* Status + idea */}
      <div className="relative z-10 mt-5 w-[min(92vw,720px)] text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6E7BFF] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#6E7BFF]" /></span>
          <span key={statusI} className="dv-status text-[15px] font-semibold text-white">{STATUS[statusI]}</span>
          {styleName && <span className="ml-1 truncate rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">{styleName}</span>}
        </div>
        {idea && <div className="mt-1.5 line-clamp-1 text-[12px] italic text-white/40">“{idea}”</div>}

        {/* Progress */}
        <div className="mx-auto mt-3 max-w-md">
          {multi ? (
            <>
              <div className="mb-1 flex items-center justify-between text-[10px] text-white/40"><span>Striking shot {Math.min(current ?? 1, total!)} of {total}</span><span className="tabular-nums">{pct}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#6E7BFF,#2FE0FF,#B57BFF)" }} /></div>
            </>
          ) : (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 rounded-full" style={{ background: "linear-gradient(90deg,#6E7BFF,#2FE0FF)", animation: "dvScan 1.6s ease-in-out infinite" }} /></div>
          )}
        </div>

        {/* Rotating real-world map fact */}
        <div key={`f${factI}`} className="dv-status mx-auto mt-4 flex max-w-lg items-start gap-2 rounded-xl border border-[#6E7BFF]/15 bg-[#6E7BFF]/[0.06] px-3 py-2 text-left text-[11.5px] leading-relaxed text-white/65 backdrop-blur-md">
          <span className="mt-px shrink-0">🌍</span>
          <span><span className="font-semibold text-[#9CA6FF]">Did you know — </span>{FACTS[factI]}</span>
        </div>
      </div>
    </div>
  );
};
