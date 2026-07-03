import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { AtmosphereLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { LV, kfOpacityMul } from "./renderHelpers";

/**
 * Atmosphere — cinematic weather over the frame. Snow, rain, embers, dust, fog.
 *
 * RENDER-SAFE BY CONSTRUCTION: every particle's position is a pure function of
 * (index, frame). No state, no randomness at render time — the same frame
 * always produces the same pixels, in the preview, the export and the headless
 * renderer alike. Particles wrap around the frame edges so the field is endless.
 */

/** Deterministic hash → [0,1). Same (i, salt) always gives the same number. */
const h = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const wrap01 = (v: number) => v - Math.floor(v);

const EFFECT_COLOR: Record<AtmosphereLayer["effect"], string> = {
  snow: "#ffffff",
  rain: "#9fc3e8",
  embers: "#ff9d45",
  dust: "#d8c9a8",
  fog: "#dfe7f0",
};

export const AtmosphereView: React.FC<LV<AtmosphereLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l) * l.opacity;
  if (tr.opacity < 0.01) return null;

  const t = (frame / fps) * l.speed;
  const color = l.color || EFFECT_COLOR[l.effect];
  const master = tr.opacity;

  // ── Fog: a few huge blurred blobs drifting slowly — no particle field ──
  if (l.effect === "fog") {
    const n = 5 + Math.round(l.density * 6);
    return (
      <AbsoluteFill style={{ pointerEvents: "none", zIndex: 6, opacity: master }}>
        {Array.from({ length: n }, (_, i) => {
          const w = (0.35 + h(i, 1) * 0.5) * vw;
          const ht = (0.14 + h(i, 2) * 0.18) * vh;
          const y = h(i, 3) * (vh - ht);
          const x = wrap01(h(i, 4) + t * 0.012 * (0.5 + h(i, 5)) * (l.wind >= 0 ? 1 : -1)) * (vw + w) - w;
          return (
            <div
              key={i}
              style={{
                position: "absolute", left: x, top: y, width: w, height: ht,
                background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
                opacity: 0.05 + h(i, 6) * 0.09 * (0.4 + l.density),
                filter: `blur(${Math.max(24, vh * 0.03)}px)`,
              }}
            />
          );
        })}
      </AbsoluteFill>
    );
  }

  // ── Particle fields: snow / rain / embers / dust ──
  const count = Math.round((30 + l.density * 150) * (vw > 2000 ? 1.4 : 1));
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < count; i++) {
    const depth = 0.35 + h(i, 9) * 0.65; // far→near: smaller, slower, fainter
    let x: number, y: number, o: number, node: React.ReactNode = null;

    if (l.effect === "rain") {
      const fall = (0.55 + h(i, 2) * 0.45) * depth;
      y = wrap01(h(i, 1) + t * fall) * 1.1 - 0.05;
      x = wrap01(h(i, 3) + t * l.wind * 0.12 * depth);
      o = (0.14 + h(i, 4) * 0.22) * depth;
      const len = (0.02 + 0.02 * depth) * vh;
      const slant = l.wind * len * 0.55;
      node = (
        <line
          key={i}
          x1={x * vw} y1={y * vh} x2={x * vw - slant} y2={y * vh - len}
          stroke={color} strokeWidth={Math.max(1, vh * 0.0011 * depth)} opacity={o} strokeLinecap="round"
        />
      );
    } else if (l.effect === "embers") {
      const rise = (0.05 + h(i, 2) * 0.07) * depth;
      y = 1 - wrap01(h(i, 1) + t * rise); // rising
      x = wrap01(h(i, 3) + t * l.wind * 0.03 * depth + 0.015 * Math.sin(t * 1.8 + i * 2.4) * depth);
      const flicker = 0.55 + 0.45 * Math.sin(t * 9 + i * 7.3);
      o = (0.25 + h(i, 4) * 0.55) * depth * flicker;
      const r = (0.0016 + h(i, 5) * 0.0035) * vh * depth;
      node = <circle key={i} cx={x * vw} cy={y * vh} r={r} fill={color} opacity={o} style={{ filter: `drop-shadow(0 0 ${r * 2.5}px ${color})` }} />;
    } else if (l.effect === "dust") {
      const drift = (0.015 + h(i, 2) * 0.03) * depth;
      x = wrap01(h(i, 1) + t * drift * (l.wind >= 0 ? 1 : -1) * (0.6 + Math.abs(l.wind)));
      y = wrap01(h(i, 3) + t * 0.006 * depth + 0.01 * Math.sin(t * 0.9 + i * 3.1));
      o = (0.06 + h(i, 4) * 0.16) * depth;
      const r = (0.0011 + h(i, 5) * 0.0022) * vh * depth;
      node = <circle key={i} cx={x * vw} cy={y * vh} r={r} fill={color} opacity={o} />;
    } else {
      // snow — gentle fall with per-flake sway
      const fall = (0.045 + h(i, 2) * 0.075) * depth;
      y = wrap01(h(i, 1) + t * fall) * 1.08 - 0.04;
      x = wrap01(h(i, 3) + t * l.wind * 0.035 * depth + 0.012 * Math.sin(t * 1.4 + i * 5.7) * depth);
      o = (0.3 + h(i, 4) * 0.55) * depth;
      const r = (0.0014 + h(i, 5) * 0.0032) * vh * depth;
      node = <circle key={i} cx={x * vw} cy={y * vh} r={r} fill={color} opacity={o} />;
    }
    parts.push(node);
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 6, opacity: master }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>{parts}</svg>
    </AbsoluteFill>
  );
};
