"use client";

import React from "react";

/**
 * Editorial hero backdrop — a field of city dots with glowing great-circle
 * arcs drawing across it and a faint graticule. Ships in two moods:
 *   • light (default) — bright paper, pastel arcs, iris dots; matches the
 *     bright-editorial design system used across the app.
 *   • dark — the original "Earth at night" band (kept for marketing pages).
 * Pure SVG/CSS, no deps.
 */
const ARCS = [
  { d: "M120 340 Q 380 90 720 220", c: "url(#hg1)", dur: 7 },
  { d: "M210 410 Q 560 200 910 300", c: "url(#hg2)", dur: 8.5 },
  { d: "M60 230 Q 380 400 760 360", c: "url(#hg1)", dur: 9.5 },
  { d: "M540 70 Q 720 210 930 140", c: "url(#hg3)", dur: 7.8 },
];
// city-light coordinates (x,y, warm?) — clustered like real lit landmasses
const LIGHTS: [number, number, number][] = [
  [120, 340, 1], [150, 320, 0], [180, 360, 1], [210, 410, 0], [95, 300, 0], [240, 380, 1],
  [380, 200, 0], [420, 230, 1], [360, 250, 0], [450, 190, 0], [400, 280, 1],
  [700, 220, 0], [720, 250, 1], [760, 210, 0], [680, 190, 1], [740, 280, 0], [910, 300, 1], [880, 260, 0], [930, 150, 0], [840, 180, 1],
  [560, 200, 0], [540, 240, 1], [600, 170, 0], [520, 300, 0],
];

export const MapHeroBg: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
    <style>{`
      @keyframes hgDraw { 0%{stroke-dashoffset:1200} 55%{stroke-dashoffset:0} 100%{stroke-dashoffset:0} }
      @keyframes hgTwinkle { 0%,100%{opacity:.35} 50%{opacity:1} }
      @keyframes hgPing { 0%{r:1.5;opacity:.7} 70%{r:13;opacity:0} 100%{opacity:0} }
    `}</style>
    <svg viewBox="0 0 960 460" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id="hgGlow" cx="50%" cy="8%" r="70%">
          {dark ? (
            <>
              <stop offset="0%" stopColor="#2a3570" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#0c1024" stopOpacity="0" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#6E7BFF" stopOpacity="0.14" />
              <stop offset="55%" stopColor="#f4f4f9" stopOpacity="0" />
            </>
          )}
        </radialGradient>
        <linearGradient id="hg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6E7BFF" stopOpacity="0" /><stop offset="45%" stopColor="#6E7BFF" /><stop offset="100%" stopColor="#2FE0FF" stopOpacity="0.5" /></linearGradient>
        <linearGradient id="hg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#2FE0FF" stopOpacity="0" /><stop offset="50%" stopColor="#2FE0FF" /><stop offset="100%" stopColor="#B57BFF" stopOpacity="0.5" /></linearGradient>
        <linearGradient id="hg3" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#B57BFF" stopOpacity="0" /><stop offset="50%" stopColor="#FF8AD0" /><stop offset="100%" stopColor="#6E7BFF" stopOpacity="0.5" /></linearGradient>
        <radialGradient id="hgFade" cx="50%" cy="52%" r="60%">
          {dark ? (
            <>
              <stop offset="0%" stopColor="#0a0e1c" stopOpacity="0.75" />
              <stop offset="60%" stopColor="#0a0e1c" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#0a0e1c" stopOpacity="0" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#f4f4f9" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#f4f4f9" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f4f4f9" stopOpacity="0" />
            </>
          )}
        </radialGradient>
      </defs>
      {/* base + top glow */}
      <rect x="0" y="0" width="960" height="460" fill={dark ? "#080b16" : "#f4f4f9"} />
      <rect x="0" y="0" width="960" height="460" fill="url(#hgGlow)" />
      {/* graticule */}
      {Array.from({ length: 13 }).map((_, i) => <line key={"v" + i} x1={i * 80} y1="0" x2={i * 80} y2="460" stroke="#6E7BFF" strokeOpacity={dark ? 0.06 : 0.1} strokeWidth="1" />)}
      {Array.from({ length: 6 }).map((_, i) => <line key={"h" + i} x1="0" y1={i * 80} x2="960" y2={i * 80} stroke="#6E7BFF" strokeOpacity={dark ? 0.06 : 0.1} strokeWidth="1" />)}
      {/* city dots */}
      {LIGHTS.map(([x, y, warm], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill={dark ? (warm ? "#ffd9a0" : "#9fd8ff") : (warm ? "#e6a23c" : "#6E7BFF")} fillOpacity={dark ? 1 : 0.55} style={{ animation: `hgTwinkle ${2.5 + (i % 5) * 0.6}s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      {/* hub pings */}
      {[[120, 340], [720, 220], [910, 300], [540, 200]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} fill="none" stroke={dark ? "#2FE0FF" : "#6E7BFF"} strokeOpacity={dark ? 1 : 0.5} strokeWidth="1.4" style={{ animation: `hgPing ${3.5 + i * 0.6}s ease-out ${i * 0.7}s infinite` }} />
      ))}
      {/* glowing connection arcs */}
      {ARCS.map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.c} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1200" strokeOpacity={dark ? 1 : 0.55}
          style={{ animation: `hgDraw ${a.dur}s ease-in-out ${i * 0.6}s infinite`, filter: dark ? "drop-shadow(0 0 7px rgba(110,123,255,0.5))" : "drop-shadow(0 0 6px rgba(110,123,255,0.25))" }} />
      ))}
      {/* soft centre fade keeps the composer crisp */}
      <rect x="0" y="0" width="960" height="460" fill="url(#hgFade)" />
    </svg>
  </div>
);
