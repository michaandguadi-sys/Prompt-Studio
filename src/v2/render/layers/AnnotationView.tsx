import React from "react";
import { useVideoConfig } from "remotion";
import { AnnotationLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul, displayFont, useTheme, clampN, tfStyle } from "./renderHelpers";

export const AnnotationView: React.FC<LV<AnnotationLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;
  const p = project(l.anchor.lon, l.anchor.lat);
  const font = displayFont(theme, l.fontFamily);
  const sz = l.sizePx;
  const d = (l.distance / 100) * vh;
  const autoSide = (() => {
    const inLeft = p.x < vw * 0.45, inTop = p.y < vh * 0.45;
    if (inLeft && inTop) return "right";
    if (!inLeft && inTop) return "left";
    if (inLeft && !inTop) return "top";
    return "top";
  })();
  const side = l.side === "auto" ? autoSide : l.side;
  let bx = p.x, by = p.y;
  if (side === "top") by = p.y - d;
  else if (side === "bottom") by = p.y + d;
  else if (side === "left") bx = p.x - d * (vw / vh);
  else if (side === "right") bx = p.x + d * (vw / vh);
  const drawP = l.draw ? clampN(tr.opacity * 1.25, 0, 1) : 1;
  const lx = p.x + (bx - p.x) * drawP, ly = p.y + (by - p.y) * drawP;
  const pulse = 1.3 + 0.6 * Math.sin(frame / 6);
  const dotR = Math.max(4, sz * 0.13);
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <line x1={p.x} y1={p.y} x2={lx} y2={ly} stroke={l.accent} strokeWidth={Math.max(1.5, sz * 0.05)} strokeOpacity={tr.opacity} strokeLinecap="round" />
        <circle cx={p.x} cy={p.y} r={dotR * pulse} fill="none" stroke={l.accent} strokeWidth={2} opacity={tr.opacity * 0.4} />
        <circle cx={p.x} cy={p.y} r={dotR} fill={l.accent} opacity={tr.opacity} />
      </svg>
      <div style={{ position: "absolute", left: bx, top: by, transform: `translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`, opacity: tr.opacity, textAlign: l.boxStyle === "bracket" ? "left" : "center", whiteSpace: "nowrap", fontFamily: font }}>
        {l.boxStyle === "card" ? (
          <div style={{ display: "inline-block", padding: `${sz * 0.28}px ${sz * 0.5}px`, borderRadius: sz * 0.18, background: "rgba(6,8,15,0.86)", border: `${Math.max(2, sz * 0.045)}px solid ${l.accent}` }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, letterSpacing: 1 }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.12 }}>{l.sub}</div>}
          </div>
        ) : l.boxStyle === "bracket" ? (
          <div style={{ display: "inline-block", padding: `${sz * 0.18}px ${sz * 0.5}px`, borderLeft: `${Math.max(3, sz * 0.08)}px solid ${l.accent}` }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent }}>{l.sub}</div>}
          </div>
        ) : l.boxStyle === "underline" ? (
          <div style={{ display: "inline-block" }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            <div style={{ height: Math.max(3, sz * 0.06), background: l.accent, marginTop: sz * 0.1 }} />
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.1 }}>{l.sub}</div>}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.sub}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
