import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { ChartLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul, displayFont, textShadow, tfStyle, useTheme, clampN } from "./renderHelpers";
import { safeInterpolate } from "../../../lib/interp";

export const ChartView: React.FC<LV<ChartLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;
  const CE: Record<string, (t: number) => number> = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  };
  const inF = Math.round(l.timing.inSec * fps);
  const span = Math.max(1, Math.round(((l as any).countSec ?? 1.5) * fps));
  const rawProg = safeInterpolate(frame, [inF, inF + span], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const prog = (CE[(l as any).countEasing] ?? CE.easeOut)(rawProg);
  const dec = Math.max(0, Math.min(4, (l as any).decimals ?? 0));
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
      <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, fontFamily: displayFont(theme), textAlign: "center" }}>
        {l.variant === "counter" && (
          <div style={{ fontSize: 360, fontWeight: 200, color: l.accent, letterSpacing: -6, textShadow: `${textShadow(0.5)}, 0 0 80px ${l.accent}66` }}>
            {l.prefix}{fmt(l.value * prog)}{l.suffix}
          </div>
        )}
        {l.variant === "bar" && (
          <div style={{ display: "flex", gap: 36, alignItems: "flex-end", height: 600 }}>
            {l.series.map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ color: "#fff", fontSize: 30, fontVariantNumeric: "tabular-nums", textShadow: textShadow(0.5) }}>{fmt(s.value * prog)}</div>
                <div style={{ width: 120, height: Math.max(4, (s.value / Math.max(...l.series.map((x) => x.value), 1)) * 480 * prog), background: `linear-gradient(180deg, ${l.accent}99, ${l.accent})`, boxShadow: `0 0 40px ${l.accent}55` }} />
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 26, letterSpacing: 3, textShadow: textShadow(0.5) }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {l.variant === "line" && (() => {
          if (l.series.length < 2) return null;
          const W = 1500, H = 560;
          const max = Math.max(...l.series.map((p) => p.value), 1);
          const visN = Math.max(2, Math.floor(l.series.length * prog));
          const pts = l.series.slice(0, visN).map((p, i) => ({ x: (i / (l.series.length - 1)) * W, y: H - (p.value / max) * H }));
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <svg width={W} height={H} style={{ overflow: "visible" }}>
              <path d={path} fill="none" stroke={l.accent} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 24px ${l.accent}cc)` }} />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={10} fill={l.accent} />
                  <text x={p.x} y={H + 46} fill="#fff" fontSize={26} textAnchor="middle" opacity={0.85} style={{ paintOrder: "stroke" }} stroke="rgba(0,0,0,0.55)" strokeWidth={3}>{l.series[i].label}</text>
                </g>
              ))}
            </svg>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
