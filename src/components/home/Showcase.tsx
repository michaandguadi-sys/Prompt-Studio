"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Loader2, Play } from "lucide-react";
import { SHOWCASE_STORIES, type ShowcaseStory, type ShowcaseMotion } from "./showcaseStories";

/**
 * Showcase — a reel of FINISHED, polished map films. Each tile plays a small,
 * on-style animated preview of the real story (a route drawing itself, a country
 * blooming, a city orbit), and one click opens the full film in the editor,
 * ready to play or remix. Real deterministic plans → real projects, so the
 * preview and the film are the same look.
 */
export const Showcase: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (s: ShowcaseStory) => {
    if (busy) return;
    setBusy(s.id);
    try {
      const res = await fetch("/api/v2/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: s.plan }),
      });
      const data = await res.json();
      if (data?.project) { load(data.project); router.push("/studio2"); return; }
    } catch { /* fall through */ }
    setBusy(null);
    router.push("/studio2");
  };

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {SHOWCASE_STORIES.map((s) => (
        <button
          key={s.id}
          onClick={() => open(s)}
          disabled={!!busy}
          className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-left transition-all hover:-translate-y-1 hover:border-white/[0.18] disabled:opacity-60"
          title={`Open “${s.label}” in the editor`}
        >
          <div className="relative h-32 w-full overflow-hidden" style={{ background: `radial-gradient(120% 90% at 50% 8%, ${s.accent}22, transparent 60%), ${s.bg}` }}>
            <ShowcaseThumb motion={s.motion} accent={s.accent} />
            {/* Play affordance on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(4,6,16,0.35)" }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#0a0e1a] shadow-lg">
                {busy === s.id ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="translate-x-[1px]" />}
              </span>
            </div>
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/70 backdrop-blur">{s.genre}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-[15px] leading-none">{s.emoji}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white/90">{s.label}</div>
              <div className="truncate text-[10.5px] text-white/35">{(s.plan.durationSec as number) ?? 9}s · click to open &amp; play</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

/* ── Animated preview motifs — pure CSS/SVG, one per story motion ──────────── */
const ShowcaseThumb: React.FC<{ motion: ShowcaseMotion; accent: string }> = ({ motion, accent }) => {
  const uid = React.useId().replace(/[:]/g, "");
  if (motion === "route") {
    return (
      <svg viewBox="0 0 240 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <style>{`
          @keyframes ${uid}draw { to { stroke-dashoffset: 0; } }
          @keyframes ${uid}fly { 0%{offset-distance:0%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{offset-distance:100%;opacity:0} }
        `}</style>
        {[34, 62, 90].map((y) => <line key={y} x1="0" y1={y} x2="240" y2={y} stroke="#ffffff" strokeOpacity="0.05" />)}
        <path d="M28 96 Q 120 8, 212 72" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray="260" strokeDashoffset="260" style={{ animation: `${uid}draw 2.6s ease-in-out infinite alternate`, filter: `drop-shadow(0 0 6px ${accent})` }} />
        <circle r="4" fill="#fff" style={{ offsetPath: "path('M28 96 Q 120 8, 212 72')", animation: `${uid}fly 2.6s ease-in-out infinite` } as React.CSSProperties} />
        {[[28, 96], [212, 72]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4.5" fill={accent} stroke="#fff" strokeWidth="1.5" />
        ))}
      </svg>
    );
  }
  if (motion === "highlight") {
    return (
      <svg viewBox="0 0 240 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <style>{`@keyframes ${uid}pulse { 0%,100%{opacity:.45;transform:scale(.98)} 50%{opacity:.8;transform:scale(1.02)} }
          @keyframes ${uid}stroke { to { stroke-dashoffset:0 } }`}</style>
        <g style={{ transformOrigin: "center", animation: `${uid}pulse 3s ease-in-out infinite` }}>
          <path d="M70 44 L120 34 L166 50 L176 84 L138 100 L92 94 L64 74 Z" fill={accent} fillOpacity="0.4"
            stroke={accent} strokeWidth="2.5" strokeDasharray="360" strokeDashoffset="360"
            style={{ animation: `${uid}stroke 2.4s ease forwards infinite`, filter: `drop-shadow(0 0 10px ${accent})` }} />
        </g>
        <circle cx="120" cy="66" r="4" fill="#fff" />
        <rect x="112" y="40" width="16" height="3" rx="1.5" fill="#fff" opacity="0.85" />
      </svg>
    );
  }
  if (motion === "orbit") {
    return (
      <svg viewBox="0 0 240 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <style>{`@keyframes ${uid}spin { to { transform: rotate(360deg) } }`}</style>
        <g style={{ transformOrigin: "120px 72px", animation: `${uid}spin 9s linear infinite` }}>
          <ellipse cx="120" cy="72" rx="78" ry="26" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="198" cy="72" r="3.5" fill={accent} />
        </g>
        {[[104, 20], [120, 12], [136, 24], [150, 32], [90, 30]].map(([x, h], i) => (
          <rect key={i} x={x} y={72 - h} width="11" height={h} rx="1.5" fill={accent} fillOpacity={0.5 + i * 0.08} style={{ filter: `drop-shadow(0 0 5px ${accent}88)` }} />
        ))}
        <circle cx="128" cy="48" r="4.5" fill="#fff" stroke={accent} strokeWidth="1.5" />
      </svg>
    );
  }
  // travelmap — countries bloom in sequence
  return (
    <svg viewBox="0 0 240 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <style>{`@keyframes ${uid}bloom { 0%{opacity:0;transform:scale(.6)} 60%{opacity:1;transform:scale(1)} 100%{opacity:1;transform:scale(1)} }`}</style>
      {[
        { d: "M30 40 l26 -6 l14 20 l-18 18 l-24 -6 Z", c: "#e0533a", delay: 0 },
        { d: "M84 30 l24 4 l6 24 l-20 10 l-14 -18 Z", c: "#4bbf6b", delay: 0.5 },
        { d: "M140 44 l28 -4 l10 22 l-22 16 l-20 -14 Z", c: "#4ab8ff", delay: 1 },
        { d: "M190 62 l26 2 l6 22 l-22 10 l-14 -16 Z", c: "#f4a340", delay: 1.5 },
      ].map((b, i) => (
        <path key={i} d={b.d} fill={b.c} fillOpacity="0.55" stroke="#fff" strokeWidth="1.5"
          style={{ transformOrigin: "center", animation: `${uid}bloom 3.6s ease-in-out ${b.delay}s infinite`, filter: `drop-shadow(0 0 6px ${b.c}aa)` }} />
      ))}
    </svg>
  );
};
