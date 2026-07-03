import React, { useMemo } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { AbsoluteFill } from "remotion";
import { HeatmapLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { useTheme, LV, kfOpacityMul, textShadow, clampN } from "./renderHelpers";

export const HeatmapSource: React.FC<LV<HeatmapLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;
  const data = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (l.data ?? []).map((p: any) => ({
      type: "Feature" as const,
      properties: { weight: p.value ?? 1 },
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    })),
  }), [l.data]);
  return (
    <Source id={l.id} type="geojson" data={data}>
      <MapLayer
        id={`${l.id}-heat`}
        type="heatmap"
        paint={{
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": l.intensity ?? 1,
          "heatmap-radius": l.radius ?? 40,
          "heatmap-opacity": tr.opacity,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.12, l.colorLow ?? "#1a237e", 0.55, l.colorLow ?? "#1a237e", 1, l.colorHigh ?? "#ff3d00"],
        } as any}
      />
    </Source>
  );
};

export const HeatmapLegend: React.FC<LV<HeatmapLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.showLegend || !(l.data ?? []).length) return null;
  const grad = `linear-gradient(to right, ${l.colorLow ?? "#1a237e"}, ${l.colorHigh ?? "#ff3d00"})`;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%", pointerEvents: "none" }}>
      <div style={{ opacity: tr.opacity, transform: timingTransform(tr), background: "rgba(6,8,15,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: "1vh", padding: "1.2vh 1.6vh", minWidth: "16vh" }}>
        {l.metric && <div style={{ fontSize: "1.3vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.8vh", opacity: 0.9 }}>{l.metric}{l.unit ? ` (${l.unit})` : ""}</div>}
        <div style={{ height: "0.9vh", borderRadius: "0.45vh", background: grad, marginBottom: "0.5vh" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vh", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}><span>low</span><span>high</span></div>
      </div>
    </AbsoluteFill>
  );
};
