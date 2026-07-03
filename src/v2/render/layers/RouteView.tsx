import React, { useMemo } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { RouteLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import {
  LV, kfOpacityMul, finalRouteCoords, routeTravel,
  routeStops, pointAlong, displayFont, useTheme,
  anchorXY, trimLineCoords, hexA
} from "./renderHelpers";

// ── Shared helpers ──────────────────────────────────────────────────────────

function buildRenderCoords(l: RouteLayer, frame: number, fps: number, totalFrames: number) {
  const t = routeTravel(l, frame, fps, totalFrames);
  const animation = (l as any).animation ?? l.reveal;
  const startF = Math.round((l.timing?.inSec ?? 0) * fps);
  const fadeDur = Math.round(((l as any).fadeSec ?? 0.6) * fps);
  let startP = 0;
  if (animation === "sweep") {
    const dur = Math.max(1, Math.round((l.drawFraction ?? 0.6) * totalFrames));
    const tailStart = startF + dur - fadeDur;
    startP = (l as any).fade === "off" ? 0 : Math.max(0, (frame - tailStart) / fadeDur);
  }
  const fullCoords = finalRouteCoords(l);
  let renderCoords = trimLineCoords(fullCoords, t);
  if (startP > 0) renderCoords = trimLineCoords([...renderCoords].reverse(), 1 - startP).reverse();
  return { t, fullCoords, renderCoords };
}

// ── RouteSource: MapLibre canvas pass (line + glow) ────────────────────────

export const RouteSource: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  const { t, fullCoords, renderCoords } = useMemo(
    () => buildRenderCoords(l, frame, fps, totalFrames),
    [l, frame, fps, totalFrames]
  );
  const meshData = useRouteMesh(renderCoords, l.width);

  if (tr.opacity < 0.01 || renderCoords.length < 2) return null;

  const lineData = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: renderCoords } };

  return (
    <>
      {l.glow > 0 && (
        <Source id={`${l.id}-glow`} type="geojson" data={lineData}>
          <MapLayer
            id={`${l.id}-glowL`}
            type="line"
            paint={{ "line-color": l.color, "line-width": l.width * (2 + l.glow * 1.5), "line-blur": Math.max(2, l.width * 1.5), "line-opacity": tr.opacity * Math.min(1, l.glow) }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}
      {(l as any).style === "ribbon" && meshData ? (
        <Source id={l.id} type="geojson" data={meshData}>
          <MapLayer id={`${l.id}-mesh`} type="fill" paint={{ "fill-color": l.color, "fill-opacity": tr.opacity }} />
        </Source>
      ) : (
        <Source id={l.id} type="geojson" data={lineData}>
          <MapLayer
            id={`${l.id}-line`}
            type="line"
            paint={{
              "line-color": l.color, "line-width": l.width, "line-opacity": tr.opacity,
              ...(l.dashStyle === "dashed" ? { "line-dasharray": [2, 1.5] } : l.dashStyle === "dotted" ? { "line-dasharray": [0.2, 2] } : {}),
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}
      {l.showEndpoints && t > 0.05 && (
        <Source id={`${l.id}-sm`} type="geojson" data={{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: fullCoords[0] } }}>
          <MapLayer id={`${l.id}-smL`} type="circle" paint={{ "circle-radius": l.width * 1.4, "circle-color": l.color, "circle-stroke-width": l.width * 0.4, "circle-stroke-color": "#fff", "circle-opacity": tr.opacity, "circle-stroke-opacity": tr.opacity }} />
        </Source>
      )}
      {l.showEndpoints && t > 0.95 && (
        <Source id={`${l.id}-em`} type="geojson" data={{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: fullCoords[fullCoords.length - 1] } }}>
          <MapLayer id={`${l.id}-emL`} type="circle" paint={{ "circle-radius": l.width * 1.4, "circle-color": l.color, "circle-stroke-width": l.width * 0.4, "circle-stroke-color": "#fff", "circle-opacity": tr.opacity, "circle-stroke-opacity": tr.opacity }} />
        </Source>
      )}
    </>
  );
};

// ── RouteEndpoints: DOM overlay for origin/destination labels ──────────────

export const RouteEndpoints: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project || !l.showEndpoints) return null;

  const { t, fullCoords } = useMemo(() => buildRenderCoords(l, frame, fps, totalFrames), [l, frame, fps, totalFrames]);
  const startCoord = fullCoords[0];
  const endCoord = fullCoords[fullCoords.length - 1];
  const font = displayFont(theme);

  const pinStyle = (label: string, coord: [number, number]): React.ReactNode => {
    const { x, y } = project(coord[0], coord[1]);
    return (
      <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-100%) translateY(-6px)", opacity: tr.opacity, pointerEvents: "none" }}>
        <div style={{ background: hexA(l.color, 0.92), color: "#fff", fontFamily: font, fontSize: l.width * 2.5, fontWeight: 700, padding: `${l.width * 0.6}px ${l.width * 1.2}px`, borderRadius: l.width * 0.4, whiteSpace: "nowrap", boxShadow: `0 4px 16px ${hexA(l.color, 0.5)}`, border: "1px solid rgba(255,255,255,0.2)" }}>
          {label}
        </div>
        <div style={{ width: 0, height: 0, borderLeft: `${l.width * 0.5}px solid transparent`, borderRight: `${l.width * 0.5}px solid transparent`, borderTop: `${l.width * 0.7}px solid ${l.color}`, margin: "0 auto" }} />
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {t > 0.05 && l.from.name && pinStyle(l.from.name, startCoord)}
      {t > 0.95 && l.to.name && pinStyle(l.to.name, endCoord)}
    </div>
  );
};

// ── RouteIconView: DOM overlay for the animated vehicle head ───────────────

const ICONS: Record<string, string> = {
  car: "🚗", plane: "✈️", boat: "⛵", walk: "🚶", bike: "🚲", train: "🚂",
  truck: "🚛", rocket: "🚀", heli: "🚁", run: "🏃", ship: "🛳️", pin: "📍",
};

export const RouteIconView: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project || l.icon === "none") return null;

  const { t, renderCoords } = useMemo(() => buildRenderCoords(l, frame, fps, totalFrames), [l, frame, fps, totalFrames]);
  if (t < 0.01 || t > 0.99 || renderCoords.length < 2) return null;

  const head = renderCoords[renderCoords.length - 1] as [number, number];
  const { x, y } = project(head[0], head[1]);
  const icon = (l as any).iconEmoji || ICONS[l.icon] || "📍";
  const sz = Math.max(24, l.width * 3.5);

  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", opacity: tr.opacity, pointerEvents: "none", fontSize: sz, lineHeight: 1, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}>
      {icon}
    </div>
  );
};

// ── RouteView: combined (canvas + DOM) for backward compat ─────────────────

export const RouteView: React.FC<LV<RouteLayer> & { terrain?: boolean }> = ({ layer: l, frame, fps, totalFrames, terrain, project }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);

  const { t, fullCoords, renderCoords } = useMemo(
    () => buildRenderCoords(l, frame, fps, totalFrames),
    [l, frame, fps, totalFrames]
  );
  const meshData = useRouteMesh(renderCoords, l.width);
  const Stops = useMemo(() => routeStops(l), [l]);
  const activeStops = Stops.filter((s) => s.at <= t);

  if (tr.opacity < 0.01) return null;
  if (renderCoords.length < 2) return null;

  const lineData = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: renderCoords } };
  const head = renderCoords[renderCoords.length - 1] as [number, number];
  const showHead = (l as any).head ?? (l.icon !== "none");
  const showLabels = (l as any).labels;

  return (
    <>
      {l.glow > 0 && (
        <Source id={`${l.id}-glow`} type="geojson" data={lineData}>
          <MapLayer
            id={`${l.id}-glowL`}
            type="line"
            paint={{ "line-color": l.color, "line-width": l.width * (2 + l.glow * 1.5), "line-blur": Math.max(2, l.width * 1.5), "line-opacity": tr.opacity * Math.min(1, l.glow), ...((terrain as any) ? { "line-opacity": 0 } : {}) }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}
      {(l as any).style === "ribbon" && meshData ? (
        <Source id={l.id} type="geojson" data={meshData}>
          <MapLayer id={`${l.id}-mesh`} type="fill" paint={{ "fill-color": l.color, "fill-opacity": tr.opacity }} />
        </Source>
      ) : (
        <Source id={l.id} type="geojson" data={lineData}>
          <MapLayer
            id={`${l.id}-line`}
            type="line"
            paint={{
              "line-color": l.color, "line-width": l.width, "line-opacity": tr.opacity,
              ...(l.dashStyle === "dashed" ? { "line-dasharray": [2, 1.5] } : l.dashStyle === "dotted" ? { "line-dasharray": [0.2, 2] } : {}),
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}

      {l.showEndpoints && t > 0.05 && (
        <Source id={`${l.id}-sm`} type="geojson" data={{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: fullCoords[0] } }}>
          <MapLayer id={`${l.id}-smL`} type="circle" paint={{ "circle-radius": l.width * 1.4, "circle-color": l.color, "circle-stroke-width": l.width * 0.4, "circle-stroke-color": "#fff", "circle-opacity": tr.opacity, "circle-stroke-opacity": tr.opacity }} />
        </Source>
      )}
      {l.showEndpoints && t > 0.95 && (
        <Source id={`${l.id}-em`} type="geojson" data={{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: fullCoords[fullCoords.length - 1] } }}>
          <MapLayer id={`${l.id}-emL`} type="circle" paint={{ "circle-radius": l.width * 1.4, "circle-color": l.color, "circle-stroke-width": l.width * 0.4, "circle-stroke-color": "#fff", "circle-opacity": tr.opacity, "circle-stroke-opacity": tr.opacity }} />
        </Source>
      )}

      {project && showHead && t > 0.01 && t < 0.99 && (() => {
        const { x, y } = project(head[0], head[1]);
        return (
          <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${x}px, ${y}px) translate(-50%,-50%)`, opacity: tr.opacity }}>
            <div style={{ width: l.width * 3.5, height: l.width * 3.5, borderRadius: "50%", background: l.color, border: `${Math.max(2, l.width * 0.6)}px solid #fff`, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} />
          </div>
        );
      })()}

      {project && showLabels && activeStops.length > 0 && activeStops.map((st, i) => {
        const pt = pointAlong(fullCoords, st.at);
        const pp = project(pt[0], pt[1]);
        const vi = (l as any).via?.[i];
        if (!vi || !vi.name) return null;
        return (
          <div key={i} style={{ position: "absolute", left: pp.x, top: pp.y, transform: "translate(-50%,-100%) translateY(-12px)", opacity: tr.opacity }}>
            <PointLabel text={vi.name} size={(l as any).labelSize ?? 28} color={(l as any).labelColor ?? "#fff"} bg={hexA(l.color, 0.9)} />
          </div>
        );
      })}
    </>
  );
};

export function useRouteMesh(coords: number[][], widthPx: number) {
  return useMemo(() => {
    if (coords.length < 2) return null;
    const polys: number[][][] = [];
    const R = widthPx * 0.005;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy); if (len < 1e-6) continue;
      const nx = (-dy / len) * R, ny = (dx / len) * R;
      polys.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]);
    }
    return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: polys } };
  }, [coords, widthPx]);
}

export const PointLabel: React.FC<{ text: string; size?: number; color?: string; bg?: string }> = ({ text, size = 32, color = "#fff", bg = "rgba(0,0,0,0.7)" }) => {
  const theme = useTheme();
  return (
    <div style={{ display: "inline-block", padding: `${size * 0.2}px ${size * 0.5}px`, background: bg, borderRadius: size * 0.15, color, fontSize: size, fontFamily: displayFont(theme), fontWeight: 700, whiteSpace: "nowrap", border: `1px solid rgba(255,255,255,0.15)`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      {text}
      <div style={{ position: "absolute", bottom: -size * 0.2, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: `${size * 0.25}px solid transparent`, borderRight: `${size * 0.25}px solid transparent`, borderTop: `${size * 0.25}px solid ${bg.replace(/,[\d.]+\)$/, ",1)")}` }} />
    </div>
  );
};

export const DistanceLabel: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  if (!(l as any).showDistance) return null;
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;
  const t = routeTravel(l, frame, fps, totalFrames);
  const coords = finalRouteCoords(l);
  const total = useMemo(() => {
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      const latMid = (((coords[i][1] + coords[i - 1][1]) / 2) * Math.PI) / 180;
      d += Math.hypot((coords[i][0] - coords[i - 1][0]) * Math.cos(latMid), coords[i][1] - coords[i - 1][1]) * 111.32;
    }
    return d;
  }, [coords]);
  const cur = total * t;
  const mi = cur * 0.621371;
  const unit = (l as any).distanceUnit || "km";
  const val = unit === "km" ? cur : unit === "mi" ? mi : unit === "nm" ? cur * 0.539957 : cur;
  const fmt = val < 10 ? val.toFixed(1) : Math.round(val).toLocaleString();
  const a = anchorXY((l as any).distanceAnchor || { kind: "screen", pos: "bottom" }, project);
  return (
    <div style={{ position: "absolute", left: a.screen ? "50%" : a.x, top: a.screen ? (a.pos === "top" ? "5%" : a.pos === "center" ? "50%" : "90%") : a.y, transform: `translate(-50%,-50%) ${timingTransform(tr)}`, opacity: tr.opacity, pointerEvents: "none" }}>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: hexA(l.color, 0.85), padding: "8px 24px", borderRadius: 32, boxShadow: `0 8px 32px ${hexA(l.color, 0.5)}`, border: "1.5px solid rgba(255,255,255,0.2)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div style={{ fontFamily: displayFont(theme), fontSize: 42, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{fmt}</div>
        <div style={{ fontFamily: displayFont(theme), fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 2 }}>{unit}</div>
      </div>
    </div>
  );
};
