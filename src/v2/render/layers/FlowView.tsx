import React, { useMemo } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { AbsoluteFill } from "remotion";
import { FlowLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul } from "./renderHelpers";

function arcCoords(fromLon: number, fromLat: number, toLon: number, toLat: number, curve: number, steps = 32): [number, number][] {
  const pts: [number, number][] = [];
  const mx = (fromLon + toLon) / 2;
  const my = (fromLat + toLat) / 2;
  const dx = toLon - fromLon, dy = toLat - fromLat;
  const len = Math.hypot(dx, dy);
  const cx = mx - dy * curve * 0.5;
  const cy = my + dx * curve * 0.5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * fromLon + 2 * u * t * cx + t * t * toLon, u * u * fromLat + 2 * u * t * cy + t * t * toLat]);
  }
  return pts;
}

export const FlowSource: React.FC<LV<FlowLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.data?.length) return null;

  const t = l.animate === "draw" ? Math.min(1, (frame - (l.timing?.inSec ?? 0) * fps) / Math.max(1, totalFrames * 0.6)) : 1;

  const data = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (l.data ?? []).map((flow: any) => {
      const coords = arcCoords(flow.fromLon, flow.fromLat, flow.toLon, flow.toLat, l.curve);
      const trimLen = Math.max(2, Math.round(coords.length * t));
      return {
        type: "Feature" as const,
        properties: { width: flow.widthPx ?? 2, color: flow.color ?? l.color },
        geometry: { type: "LineString" as const, coordinates: coords.slice(0, trimLen) },
      };
    }),
  }), [l.data, l.curve, t, l.color]);

  return (
    <Source id={l.id} type="geojson" data={data}>
      <MapLayer
        id={`${l.id}-flow`}
        type="line"
        paint={{
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": tr.opacity * 0.82,
        }}
        layout={{ "line-cap": "round", "line-join": "round" }}
      />
    </Source>
  );
};

export const FlowLegend: React.FC<LV<FlowLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.showLegend || !l.data?.length) return null;

  const values = (l.data ?? []).map((e: any) => e.value).filter(Number.isFinite) as number[];
  const maxV = Math.max(...values);
  const minV = Math.min(...values);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%", pointerEvents: "none" }}>
      <div style={{ opacity: tr.opacity, transform: timingTransform(tr), background: "rgba(6,8,15,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: "1vh", padding: "1.2vh 1.6vh", minWidth: "16vh" }}>
        {l.metric && <div style={{ fontSize: "1.3vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.8vh", opacity: 0.9 }}>{l.metric}{l.unit ? ` (${l.unit})` : ""}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5vh" }}>
          {[maxV, minV].map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.8vh" }}>
              <div style={{ width: `${(i === 0 ? l.maxWidthPx : Math.max(2, l.maxWidthPx * 0.25)) * 0.3}vh`, height: `${(i === 0 ? l.maxWidthPx : Math.max(2, l.maxWidthPx * 0.25)) * 0.3}vh`, borderRadius: "50%", background: l.color }} />
              <span style={{ fontSize: "1.1vh", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{Number.isFinite(v) ? v.toLocaleString() : ""}{l.unit ? ` ${l.unit}` : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
