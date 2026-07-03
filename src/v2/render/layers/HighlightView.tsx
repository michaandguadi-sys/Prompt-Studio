import React, { useMemo, useState } from "react";
import { Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { delayRender, continueRender, getRemotionEnvironment } from "remotion";
import { HighlightLayer } from "../../doc/schema";
import { cleanCountryGeo } from "../../../lib/geoClean";
import { centroidOf } from "../../../lib/geo";
import { evalTiming, timingTransform } from "../timing";
import {
  LV, kfOpacityMul, fillSource, flagIsoOf, exteriorRings,
  growClipGeometry, ringsCenter, clampN, textShadow, displayFont, useTheme
} from "./renderHelpers";

export const HighlightSource: React.FC<LV<HighlightLayer> & { terrain?: boolean }> = ({ layer: l, frame, fps, totalFrames, terrain }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  const a = tr.opacity;
  const cleanGeo = useMemo(() => cleanCountryGeo(l.geojson), [l.geojson]);
  const data = useMemo(() => (
    cleanGeo?.type === "FeatureCollection" || cleanGeo?.type === "Feature"
      ? cleanGeo : { type: "Feature" as const, geometry: cleanGeo, properties: {} }
  ), [cleanGeo]);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 6);

  const isGrow = l.animation === "grow" || l.animation === "shrink";
  const growProg = (() => {
    if (!isGrow) return 1;
    const inF = Math.round(l.timing.inSec * fps);
    const span = Math.max(1, Math.round(((l as any).growSpanSec ?? 3.5) * fps));
    const p = clampN((frame - inF) / span, 0, 1);
    return l.animation === "shrink" ? 1 - p : p;
  })();
  const origin = useMemo<[number, number]>(() => {
    const go = (l as any).growOrigin;
    return go && typeof go.lon === "number" ? [go.lon, go.lat] : ringsCenter(cleanGeo);
  }, [cleanGeo, (l as any).growOrigin]);
  const fillData = useMemo(() => (
    isGrow ? { type: "Feature" as const, properties: {}, geometry: growClipGeometry(cleanGeo, origin, growProg) } : data
  ), [isGrow, cleanGeo, origin, growProg, data]);

  let borderPaint: any = { "line-opacity": a, "line-width": l.borderWidth };
  let fillExtra: any = { "fill-opacity": a * l.fillOpacity };
  let glowPaint: any = { "line-opacity": a * 0.55 };
  switch (l.animation) {
    case "static":
      borderPaint = { "line-opacity": 1, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": l.fillOpacity };
      glowPaint = { "line-opacity": 0.55 };
      break;
    case "sweep": {
      borderPaint = { "line-opacity": a, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": Math.max(0, (a - 0.6) / 0.4) * l.fillOpacity };
      glowPaint = { "line-opacity": a * 0.55 };
      break;
    }
    case "pulse":
      borderPaint = { "line-opacity": a, "line-width": a * l.borderWidth };
      fillExtra = { "fill-opacity": a * l.fillOpacity };
      glowPaint = { "line-opacity": a * (0.55 + 0.15 * pulse) };
      break;
    case "border-first": {
      const inF = Math.round(l.timing.inSec * fps);
      const bp = clampN((frame - inF) / Math.max(1, Math.round(1.0 * fps)), 0, 1);
      const fd = Math.round(((l as any).fillDelaySec ?? 1.2) * fps);
      const fp = clampN((frame - inF - fd) / Math.max(1, Math.round(0.8 * fps)), 0, 1);
      borderPaint = { "line-opacity": bp, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": fp * l.fillOpacity };
      glowPaint = { "line-opacity": bp * 0.55 };
      break;
    }
    case "grow":
    case "shrink":
      borderPaint = { "line-opacity": a, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": a * l.fillOpacity };
      glowPaint = { "line-opacity": a * 0.5 };
      break;
    default:
      borderPaint = { "line-opacity": a, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": a * l.fillOpacity };
      glowPaint = { "line-opacity": a * 0.55 };
  }

  return (
    <>
      <Source id={`${l.id}-glowS`} type="geojson" data={data}>
        <MapLayer id={`${l.id}-glow`} type="line" paint={{ "line-color": l.glowColor, "line-width": terrain ? Math.min(l.glowWidth, 5) : l.glowWidth, "line-blur": terrain ? 2 : 10, ...glowPaint, ...(terrain ? { "line-opacity": 0 } : {}) }} layout={{ "line-cap": "round", "line-join": "round" }} />
      </Source>
      <Source id={`${l.id}-fillS`} type="geojson" data={fillData}>
        <MapLayer id={`${l.id}-fill`} type="fill" paint={l.fillType === "flag" ? { "fill-opacity": 0 } : { ...fillSource(l), ...fillExtra, ...(terrain ? { "fill-antialias": false } : {}) }} />
        {((l as any).extrude ?? 0) > 0 && (
          <MapLayer
            id={`${l.id}-extrude`}
            type="fill-extrusion"
            paint={{
              "fill-extrusion-color": l.fillColor,
              "fill-extrusion-height": ((l as any).extrude ?? 0) * 4000,
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": Math.min(0.92, a * (l.fillOpacity + 0.45)),
            }}
          />
        )}
      </Source>
      {l.fillType === "flag" && <FlagRasterSource layer={l} opacity={a * Math.max(l.fillOpacity, 0.85)} />}
      <Source id={l.id} type="geojson" data={data}>
        <MapLayer
          id={`${l.id}-border`}
          type="line"
          paint={{
            "line-color": l.borderColor,
            ...borderPaint,
            "line-opacity": ((borderPaint as any)["line-opacity"] ?? 1) * ((l as any).borderOpacity ?? 1),
            ...((l as any).borderDash === "dashed" ? { "line-dasharray": [2, 1.5] } : (l as any).borderDash === "dotted" ? { "line-dasharray": [0.3, 2] } : {}),
          }}
          layout={{ "line-cap": "round", "line-join": "round" }}
        />
      </Source>
    </>
  );
};

export function useFlagSurface(iso: string, geojson: any): { url: string; coordinates: [number, number][] } | null {
  const isRendering = getRemotionEnvironment().isRendering;
  const [out, setOut] = useState<{ url: string; coordinates: [number, number][] } | null>(null);
  const ringsKey = useMemo(() => {
    const r = exteriorRings(cleanCountryGeo(geojson));
    return r.length ? `${iso}:${r.length}:${r[0]?.length}:${r[0]?.[0]?.join?.(",")}` : "";
  }, [iso, geojson]);
  React.useEffect(() => {
    if (!iso || !geojson || typeof document === "undefined") { setOut(null); return; }
    const rings = exteriorRings(cleanCountryGeo(geojson));
    if (!rings.length) { setOut(null); return; }
    let gMinLon = Infinity, gMinLat = Infinity, gMaxLon = -Infinity, gMaxLat = -Infinity;
    for (const r of rings) for (const [lon, lat] of r) {
      if (lon < gMinLon) gMinLon = lon; if (lon > gMaxLon) gMaxLon = lon;
      if (lat < gMinLat) gMinLat = lat; if (lat > gMaxLat) gMaxLat = lat;
    }
    const lonSpan = Math.max(1e-4, gMaxLon - gMinLon), latSpan = Math.max(1e-4, gMaxLat - gMinLat);
    const coordinates: [number, number][] = [[gMinLon, gMaxLat], [gMaxLon, gMaxLat], [gMaxLon, gMinLat], [gMinLon, gMinLat]];
    let handle: number | null = isRendering ? delayRender(`flag ${iso}`, { timeoutInMilliseconds: 25000 }) : null;
    let done = false; const finish = () => { if (handle != null && !done) { done = true; try { continueRender(handle); } catch {} } };
    (async () => {
      try {
        const res = await fetch(`https://flagcdn.com/w1280/${iso}.png`);
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        const W = 1024, H = Math.max(64, Math.min(2048, Math.round(W * latSpan / lonSpan)));
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d"); if (!ctx) throw new Error("no 2d ctx");
        ctx.drawImage(bmp, 0, 0, W, H);
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        for (const ring of rings) {
          ring.forEach(([lon, lat], i) => {
            const px = ((lon - gMinLon) / lonSpan) * W;
            const py = ((gMaxLat - lat) / latSpan) * H;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fill();
        setOut({ url: cv.toDataURL("image/png"), coordinates });
      } catch { setOut(null); }
      finally { finish(); }
    })();
    const t = setTimeout(finish, 16000);
    return () => { clearTimeout(t); finish(); };
  }, [iso, ringsKey, isRendering]);
  return out;
}

export const FlagRasterSource: React.FC<{ layer: HighlightLayer; opacity: number }> = ({ layer: l, opacity }) => {
  const surf = useFlagSurface(flagIsoOf(l), l.geojson);
  if (!surf) return null;
  return (
    <Source id={`${l.id}-flagimg`} type="image" url={surf.url} coordinates={surf.coordinates as any}>
      <MapLayer id={`${l.id}-flagR`} type="raster" paint={{ "raster-opacity": Math.max(0, Math.min(1, opacity)), "raster-fade-duration": 0, "raster-resampling": "linear" } as any} />
    </Source>
  );
};

export const HighlightLabel: React.FC<LV<HighlightLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const text = (l as any).labelText || l.place;
  if (!text || !l.geojson) return null;
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;
  const c = centroidOf(l.geojson);
  const p = project?.(c[0], c[1]) ?? { x: 0, y: 0 };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) ${timingTransform(tr)}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", fontFamily: displayFont(theme), fontWeight: 600, fontSize: (l as any).labelSize ?? 46, color: (l as any).labelColor ?? "#fff", letterSpacing: 4, textShadow: textShadow(0.65), whiteSpace: "nowrap", textAlign: "center" }}>
      {text}
    </div>
  );
};
