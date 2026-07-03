import React, { useMemo } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { TrackLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import {
  LV, kfOpacityMul, trackTravel, trackWindow, trackLines,
  textShadow, displayFont, useTheme
} from "./renderHelpers";

// ── TrackSource: MapLibre canvas pass (the route line) ─────────────────────

export const TrackSource: React.FC<LV<TrackLayer> & { terrain?: boolean }> = ({ layer: l, frame, fps, totalFrames, terrain }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;

  const t = trackTravel(l, frame, fps, totalFrames);
  const [i0, i1Raw] = trackWindow(l);
  const i1 = l.variant === "overview-draw" ? i0 + Math.round(t * (i1Raw - i0)) : i1Raw;
  const lines = useMemo(() => trackLines(l, i0, i1), [l, i0, i1]);

  if (!lines.length) return null;
  const isHybrid = l.variant === "hybrid-dive";
  const drawTail = isHybrid && t > 0.15;
  const lineOp = isHybrid ? (drawTail ? tr.opacity * 0.4 : 0) : tr.opacity;
  const data = {
    type: "FeatureCollection" as const,
    features: lines.map((line) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } })),
  };

  return (
    <Source id={l.id} type="geojson" data={data}>
      <MapLayer
        id={`${l.id}-line`}
        type="line"
        paint={{ "line-color": l.routeColor, "line-width": l.routeWidth, "line-opacity": terrain ? lineOp * 0.5 : lineOp }}
        layout={{ "line-cap": "round", "line-join": "round" }}
      />
    </Source>
  );
};

// ── TrackOverlay: DOM overlay (head dot + telemetry labels) ────────────────

export const TrackOverlay: React.FC<LV<TrackLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;

  const t = trackTravel(l, frame, fps, totalFrames);
  const [i0, i1Raw] = trackWindow(l);
  const N = l.points.length;
  const i1 = l.variant === "overview-draw" ? i0 + Math.round(t * (i1Raw - i0)) : i1Raw;
  const headIdx = l.variant === "overview-draw" ? i1 : Math.round(i0 + t * (i1 - i0));
  const headPt = l.points[Math.max(0, Math.min(N - 1, headIdx))];
  const hp = project(headPt.lon, headPt.lat);

  return (
    <>
      {l.variant !== "overview-draw" && l.showDot && (
        <div style={{ position: "absolute", left: hp.x, top: hp.y, transform: "translate(-50%,-50%)", opacity: tr.opacity }}>
          <div style={{ width: l.routeWidth * 2, height: l.routeWidth * 2, borderRadius: "50%", background: l.dotColor, border: "2px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.5)" }} />
        </div>
      )}
      {(l as any).showTelemetry && <GPSLabel layer={l} pt={headPt} hp={hp} op={tr.opacity} />}
    </>
  );
};

/** Combined canvas + DOM (backward compat). */
export const TrackView: React.FC<LV<TrackLayer> & { terrain?: boolean }> = (props) => (
  <>
    <TrackSource {...props} />
    <TrackOverlay {...props} />
  </>
);

export const GPSLabel: React.FC<{ layer: TrackLayer; pt: any; hp: { x: number; y: number }; op: number }> = ({ pt, hp, op }) => {
  const theme = useTheme();
  return (
    <div style={{ position: "absolute", left: hp.x + 30, top: hp.y - 30, opacity: op, pointerEvents: "none", fontFamily: displayFont(theme), textShadow: textShadow(0.8), color: "#fff" }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>{pt.ele ? `${Math.round(pt.ele)}m` : ""}</div>
      <div style={{ fontSize: 16, opacity: 0.8, marginTop: 4 }}>{pt.lon.toFixed(4)}, {pt.lat.toFixed(4)}</div>
      {pt.time && <div style={{ fontSize: 14, opacity: 0.6, marginTop: 2 }}>{new Date(pt.time).toLocaleTimeString()}</div>}
    </div>
  );
};
