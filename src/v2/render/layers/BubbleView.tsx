import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { BubbleLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { useTheme, LV, kfOpacityMul, clampN, displayFont } from "./renderHelpers";

export const BubbleView: React.FC<LV<BubbleLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;
  const entries = (l.data ?? []).filter((e: any) => e.lon !== 0 || e.lat !== 0);
  if (!entries.length) return null;

  // 1-second grow animation per bubble (was: half of totalFrames — absurdly long on a 20s comp)
  const growDur = Math.round(fps * 1.0);
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  const fmt = (v: number) => v >= 1e12 ? `${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
  const font = displayFont(theme, null);
  const maxSz = l.maxSizePx ?? 140;

  // Legend appears after the LAST bubble has started its grow animation
  const lastEntryFrame = entries.reduce((max: number, e: any) => {
    const ef = Math.round((l.timing.inSec + (e.entryDelay ?? 0)) * fps);
    return ef > max ? ef : max;
  }, 0);
  const legendP = clampN((frame - lastEntryFrame) / Math.max(1, growDur), 0, 1);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {entries.map((e: any, i: number) => {
        // Per-bubble entry timing — entryDelay enables staggered reveal (set by bubbles builder)
        const entryFrame = Math.round((l.timing.inSec + (e.entryDelay ?? 0)) * fps);
        const bubbleGrowP = clampN((frame - entryFrame) / Math.max(1, growDur), 0, 1);
        const growScale = ease(bubbleGrowP);

        const { x, y } = project(e.lon, e.lat);
        const r = (e.sizePx ?? 40) / 2 * growScale;
        if (r < 1) return null;
        const pulse = l.animate === "pulse" && bubbleGrowP >= 1 ? 1 + 0.03 * Math.sin((frame + i * 18) / 8) : 1;
        const rFinal = r * pulse;
        const fontSize = Math.max(10, Math.min(rFinal * 0.38, 22));
        const opacity = tr.opacity * (l.animate === "fade" ? bubbleGrowP : 1);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", width: rFinal * 2, height: rFinal * 2, borderRadius: "50%", background: e.color ?? l.color, opacity: opacity * 0.72, border: `${Math.max(1.5, rFinal * 0.04)}px solid rgba(255,255,255,0.4)`, boxShadow: `0 0 ${rFinal * 0.6}px ${rFinal * 0.15}px ${e.color ?? l.color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", backdropFilter: "none" }}>
            {l.showLabels && bubbleGrowP > 0.4 && rFinal > 18 && (
              <div style={{ opacity: Math.min(1, (bubbleGrowP - 0.4) / 0.3), textAlign: "center", fontFamily: font, userSelect: "none" }}>
                <div style={{ fontSize, fontWeight: 800, color: "#fff", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{fmt(e.value)}{l.unit ? ` ${l.unit}` : ""}</div>
                {e.label && rFinal > 30 && <div style={{ fontSize: fontSize * 0.6, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{e.label}</div>}
              </div>
            )}
          </div>
        );
      })}
      {l.showLegend && entries.length > 1 && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%" }}>
          <div style={{ opacity: tr.opacity * Math.min(1, legendP * 2), background: "rgba(6,8,15,0.8)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "1vh", padding: "1vh 1.4vh" }}>
            {l.metric && <div style={{ fontSize: "1.2vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85, marginBottom: "0.5vh", fontFamily: font }}>{l.metric}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: "0.8vh" }}>
              <div style={{ width: maxSz * 0.15, height: maxSz * 0.15, borderRadius: "50%", background: l.color, opacity: 0.7 }} />
              <div style={{ width: maxSz * 0.28, height: maxSz * 0.28, borderRadius: "50%", background: l.color, opacity: 0.85 }} />
              <div style={{ fontSize: "1vh", color: "rgba(255,255,255,0.55)", fontFamily: font }}>∝ area</div>
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
