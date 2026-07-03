import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { RadiusLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { LV, kfOpacityMul, hexA } from "./renderHelpers";

/**
 * Range rings — TRUE geodesic circles ("within 500 km") projected per frame.
 *
 * Each ring is N destination points computed on the sphere (so the circle is
 * accurate at any latitude) and pushed through the live map projection (so it
 * stays glued to the ground under any zoom, pitch and bearing). Modes:
 *   grow   — rings expand once, inner ring completing first (staggered)
 *   ripple — endless sonar pulses born every intervalSec, fading as they grow
 *   static — always at full size
 */

const R_EARTH = 6371; // km
const toR = (d: number) => (d * Math.PI) / 180;
const toD = (r: number) => (r * 180) / Math.PI;

/** Spherical destination point: from (lon,lat) travel `distKm` at `bearingDeg`. */
function destPoint(lon: number, lat: number, bearingDeg: number, distKm: number): [number, number] {
  const δ = distKm / R_EARTH, θ = toR(bearingDeg);
  const φ1 = toR(lat), λ1 = toR(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toD(λ2), toD(φ2)];
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const N_PTS = 72; // points per ring — smooth at 4K, still cheap per frame

function ringPath(
  lon: number, lat: number, rKm: number,
  project: NonNullable<LV<RadiusLayer>["project"]>,
): { d: string; top: { x: number; y: number } } | null {
  let d = "";
  let top: { x: number; y: number } | null = null;
  for (let i = 0; i <= N_PTS; i++) {
    const bearing = (i / N_PTS) * 360;
    const [plon, plat] = destPoint(lon, lat, bearing, rKm);
    const p = project(plon, plat);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    d += (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    if (i === 0) top = p; // bearing 0 = due north — where the label sits
  }
  return { d: d + "Z", top: top! };
}

export const RadiusView: React.FC<LV<RadiusLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;

  const tSec = frame / fps;
  const startSec = Math.max(0, l.timing.inSec - (l.timing.fadeInSec ?? 0.35));
  const labelKm = (r: number) => l.labelUnit === "mi" ? `${Math.round(r * 0.621371)} mi` : `${r >= 10 ? Math.round(r) : r.toFixed(1)} km`;
  const strokeW = Math.max(1, l.width * (vh / 1080));
  const fontPx = Math.max(10, vh * 0.016);
  const dash = l.dashed ? `${strokeW * 3} ${strokeW * 2.2}` : undefined;

  // Build the ring set for this frame: radiusKm + animation progress per ring.
  type Ring = { rKm: number; alpha: number; label: boolean; targetKm?: number };
  const rings: Ring[] = [];
  if (l.mode === "ripple") {
    // Endless sonar: a pulse is born every intervalSec, grows for growSec, fades.
    const first = Math.floor((tSec - startSec) / l.intervalSec);
    for (let k = Math.max(0, first - Math.ceil(l.growSec / l.intervalSec) - 1); k <= first; k++) {
      const born = startSec + k * l.intervalSec;
      const p = (tSec - born) / l.growSec;
      if (p <= 0 || p >= 1) continue;
      rings.push({ rKm: easeOutCubic(p) * l.radiusKm, alpha: 1 - p, label: false });
    }
    // Plus a faint resident outer ring so the extent always reads.
    rings.push({ rKm: l.radiusKm, alpha: 0.35, label: l.showLabels });
  } else {
    const n = Math.max(1, Math.round(l.rings));
    for (let i = 1; i <= n; i++) {
      const target = (l.radiusKm * i) / n;
      let p = 1;
      if (l.mode === "grow") {
        // Staggered: inner ring completes first, outer last, all within growSec.
        const span = l.growSec / (n + 1);
        p = easeOutCubic(clamp01((tSec - startSec - (i - 1) * span) / (span * 2)));
      }
      if (p <= 0.001) continue;
      rings.push({ rKm: target * p, alpha: i === n ? 1 : 0.55, label: l.showLabels && p > 0.95, targetKm: target });
    }
  }
  if (!rings.length) return null;

  const paths = rings
    .map((r) => ({ ring: r, path: ringPath(l.center.lon, l.center.lat, r.rKm, project) }))
    .filter((x) => x.path) as Array<{ ring: Ring; path: NonNullable<ReturnType<typeof ringPath>> }>;
  if (!paths.length) return null;

  const c = project(l.center.lon, l.center.lat);
  const outer = paths[paths.length - 1];
  const pulse = 1 + 0.18 * Math.sin(frame / 5);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: tr.opacity }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* Fill tint inside the outer ring */}
        {l.fillOpacity > 0 && l.mode !== "ripple" && (
          <path d={outer.path.d} fill={hexA(l.color, l.fillOpacity)} stroke="none" />
        )}
        {paths.map(({ ring, path }, i) => (
          <path
            key={i}
            d={path.d}
            fill="none"
            stroke={l.color}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            opacity={ring.alpha}
            style={{ filter: `drop-shadow(0 0 ${strokeW * 2}px ${hexA(l.color, 0.55)})` }}
          />
        ))}
        {/* Distance labels at the due-north point of each completed ring */}
        {paths.map(({ ring, path }, i) =>
          ring.label && (
            <text
              key={`t${i}`}
              x={path.top.x}
              y={path.top.y - fontPx * 0.6}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={fontPx}
              fontFamily="Inter, sans-serif"
              fontWeight={600}
              opacity={0.92}
              style={{ paintOrder: "stroke", stroke: "rgba(5,8,16,0.75)", strokeWidth: fontPx * 0.28 }}
            >
              {labelKm(ring.targetKm ?? ring.rKm)}
            </text>
          ),
        )}
        {/* Centre dot with a soft pulse */}
        {l.centerDot && Number.isFinite(c.x) && (
          <>
            <circle cx={c.x} cy={c.y} r={strokeW * 2.6 * pulse} fill={hexA(l.color, 0.35)} />
            <circle cx={c.x} cy={c.y} r={strokeW * 1.4} fill="#ffffff" stroke={l.color} strokeWidth={strokeW * 0.6} />
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
};
