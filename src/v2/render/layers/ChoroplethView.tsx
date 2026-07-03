import React, { useMemo } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { AbsoluteFill } from "remotion";
import { ChoroplethLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul, textShadow } from "./renderHelpers";

export const ChoroplethSource: React.FC<LV<ChoroplethLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.data?.length) return null;

  const data = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (l.data ?? []).map((entry: any) => ({
      type: "Feature" as const,
      properties: { color: entry.color ?? l.colorHigh, opacity: tr.opacity },
      geometry: entry.geojson ?? { type: "Point" as const, coordinates: [entry.lon ?? 0, entry.lat ?? 0] },
    })),
  }), [l.data, tr.opacity, l.colorHigh]);

  return (
    <Source id={l.id} type="geojson" data={data}>
      <MapLayer
        id={`${l.id}-fill`}
        type="fill"
        paint={{ "fill-color": ["get", "color"], "fill-opacity": tr.opacity * 0.75 }}
      />
      <MapLayer
        id={`${l.id}-stroke`}
        type="line"
        paint={{ "line-color": "#fff", "line-width": 0.5, "line-opacity": tr.opacity * 0.3 }}
      />
    </Source>
  );
};

export const ChoroplethLegend: React.FC<LV<ChoroplethLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.showLegend || !l.data?.length) return null;

  const values = (l.data ?? []).map((e: any) => e.value).filter(Number.isFinite) as number[];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const grad = `linear-gradient(to right, ${l.colorLow}, ${l.colorHigh})`;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%", pointerEvents: "none" }}>
      <div style={{ opacity: tr.opacity, transform: timingTransform(tr), background: "rgba(6,8,15,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: "1vh", padding: "1.2vh 1.6vh", minWidth: "18vh" }}>
        {l.metric && <div style={{ fontSize: "1.3vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.8vh", opacity: 0.9 }}>{l.metric}{l.unit ? ` (${l.unit})` : ""}</div>}
        <div style={{ height: "0.9vh", borderRadius: "0.45vh", background: grad, marginBottom: "0.5vh" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vh", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
          <span>{Number.isFinite(minV) ? minV.toLocaleString() : "low"}</span>
          <span>{Number.isFinite(maxV) ? maxV.toLocaleString() : "high"}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
