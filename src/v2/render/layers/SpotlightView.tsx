import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { SpotlightLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { useTheme, LV, kfOpacityMul, hexA } from "./renderHelpers";

export const SpotlightView: React.FC<LV<SpotlightLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;
  const p = project(l.anchor.lon, l.anchor.lat);
  const pulse = l.pulse ? 1 + 0.05 * Math.sin(frame / 7) : 1;
  const rPx = (l.radiusPct / 100) * vh * pulse;
  const inner = Math.max(0, 1 - l.feather) * rPx;
  const dim = l.dim * tr.opacity;
  const grad = `radial-gradient(circle ${rPx.toFixed(0)}px at ${p.x.toFixed(0)}px ${p.y.toFixed(0)}px, ${hexA(l.color, 0)} ${inner.toFixed(0)}px, ${hexA(l.color, dim)} ${rPx.toFixed(0)}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: grad }} />
      {l.ring && (
        <div style={{ position: "absolute", left: p.x, top: p.y, width: rPx * 2, height: rPx * 2, transform: "translate(-50%,-50%)", borderRadius: "50%", border: `${Math.max(2, rPx * 0.012)}px solid ${l.ringColor}`, opacity: tr.opacity * 0.7, boxShadow: `0 0 ${rPx * 0.18}px ${l.ringColor}` }} />
      )}
    </AbsoluteFill>
  );
};
