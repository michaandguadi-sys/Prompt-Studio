"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Route as RouteIcon } from "lucide-react";

/**
 * The landing's signature moment — a REAL satellite + 3-D-terrain flythrough
 * (ESRI World Imagery + AWS terrarium DEM via our /api/dem proxy, both free /
 * key-less). Scroll drives the camera along a keyframed path up the Annapurna
 * massif while a GPS route DRAWS itself, waypoints pop tracked to the terrain,
 * a summit region lights up, then the camera pulls back to reveal the journey +
 * a selling title. Lazy-loaded (next/dynamic, ssr:false) so it never blocks the
 * hero's first paint.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Annapurna region (Himalaya) — real, dramatic terrain.
const ROUTE: [number, number][] = [
  [83.760, 28.470], [83.785, 28.498], [83.806, 28.522], [83.828, 28.546],
  [83.846, 28.570], [83.864, 28.592], [83.880, 28.612],
];
const WAYPOINTS: { at: number; lngLat: [number, number]; label: string; sub: string }[] = [
  { at: 0.16, lngLat: [83.788, 28.500], label: "Trailhead", sub: "1,400 m" },
  { at: 0.55, lngLat: [83.846, 28.570], label: "The high pass", sub: "4,200 m" },
  { at: 0.95, lngLat: [83.880, 28.612], label: "Summit ridge", sub: "5,416 m" },
];
// Camera keyframes: high establishing → descend → fly along → near summit → pull back.
const CAM = [
  { p: 0.00, lng: 83.80, lat: 28.40, zoom: 9.0, pitch: 46, bearing: 10 },
  { p: 0.30, lng: 83.81, lat: 28.52, zoom: 11.7, pitch: 70, bearing: 26 },
  { p: 0.56, lng: 83.845, lat: 28.56, zoom: 12.4, pitch: 73, bearing: 50 },
  { p: 0.80, lng: 83.872, lat: 28.60, zoom: 12.1, pitch: 64, bearing: 76 },
  { p: 1.00, lng: 83.83, lat: 28.55, zoom: 8.7, pitch: 28, bearing: 56 },
];
const HIGHLIGHT = {
  type: "Feature" as const, properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[83.858, 28.598], [83.902, 28.598], [83.908, 28.626], [83.874, 28.638], [83.850, 28.620], [83.858, 28.598]]] },
};

function camAt(p: number) {
  let a = CAM[0], b = CAM[CAM.length - 1];
  for (let i = 0; i < CAM.length - 1; i++) { if (p >= CAM[i].p && p <= CAM[i + 1].p) { a = CAM[i]; b = CAM[i + 1]; break; } }
  const t = a.p === b.p ? 0 : clamp((p - a.p) / (b.p - a.p));
  return { lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t), zoom: lerp(a.zoom, b.zoom, t), pitch: lerp(a.pitch, b.pitch, t), bearing: lerp(a.bearing, b.bearing, t) };
}
function sliceRoute(coords: [number, number][], t: number): [number, number][] {
  if (t <= 0) return [coords[0], coords[0]];
  if (t >= 1) return coords;
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < coords.length; i++) { const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]); seg.push(d); total += d; }
  let target = total * t; const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const d = seg[i - 1];
    if (target >= d) { out.push(coords[i]); target -= d; }
    else { const f = target / d; out.push([lerp(coords[i - 1][0], coords[i][0], f), lerp(coords[i - 1][1], coords[i][1], f)]); break; }
  }
  return out;
}

export const FlyThroughMap: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const mapRef = useRef<MapRef>(null);
  const [p, setP] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const style = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
      version: 8 as const,
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      sources: {
        esri: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar" },
        dem: { type: "raster-dem", tiles: [`${origin}/api/dem/{z}/{x}/{y}`], encoding: "terrarium", tileSize: 256, maxzoom: 15 },
      },
      layers: [{ id: "esri", type: "raster", source: "esri" }],
      terrain: { source: "dem", exaggeration: 1.5 },
    } as any;
  }, []);

  // Scroll progress across the pin range.
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        setP(total > 0 ? clamp(Math.min(Math.max(-r.top, 0), total) / total) : 0);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    on();
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  // Drive the camera from scroll (jumpTo = frame-synced, no animation queue).
  useEffect(() => {
    const m = mapRef.current; if (!m || !loaded) return;
    const c = camAt(p);
    m.getMap().jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing });
  }, [p, loaded]);

  const drawT = clamp((p - 0.08) / 0.72);
  const routeData = useMemo(() => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliceRoute(ROUTE, drawT) } }] }), [drawT]) as any;
  const hlOpacity = clamp((p - 0.72) / 0.2);
  const titleP = clamp((p - 0.86) / 0.14);

  return (
    <section ref={ref} id="how" className="relative" style={{ height: "460vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-[#05060e]">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: CAM[0].lng, latitude: CAM[0].lat, zoom: CAM[0].zoom, pitch: CAM[0].pitch, bearing: CAM[0].bearing }}
          mapStyle={style}
          interactive={false}
          attributionControl={false}
          maxPitch={80}
          onLoad={() => setLoaded(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <Source id="ft-route" type="geojson" data={routeData}>
            <Layer id="ft-route-glow" type="line" paint={{ "line-color": "#2fe0ff", "line-width": 11, "line-opacity": 0.35, "line-blur": 6 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="ft-route-line" type="line" paint={{ "line-color": "#2fe0ff", "line-width": 4 }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
          <Source id="ft-hl" type="geojson" data={HIGHLIGHT}>
            <Layer id="ft-hl-fill" type="fill" paint={{ "fill-color": "#6E7BFF", "fill-opacity": 0.22 * hlOpacity }} />
            <Layer id="ft-hl-line" type="line" paint={{ "line-color": "#9CA6FF", "line-width": 2, "line-opacity": hlOpacity }} />
          </Source>
          {WAYPOINTS.map((w, i) => {
            const on = drawT >= w.at;
            return (
              <Marker key={i} longitude={w.lngLat[0]} latitude={w.lngLat[1]} anchor="bottom">
                <div className="pointer-events-none -translate-y-2 text-center" style={{ opacity: on ? 1 : 0, transform: `translateY(${on ? 0 : 8}px)`, transition: "opacity .5s ease, transform .5s ease" }}>
                  <div className="rounded-lg border border-white/15 bg-black/70 px-2.5 py-1 backdrop-blur">
                    <div className="text-[12px] font-semibold leading-none text-white">{w.label}</div>
                    <div className="mt-0.5 text-[10px] text-cyan">{w.sub}</div>
                  </div>
                  <div className="mx-auto mt-1 h-2 w-2 rounded-full bg-cyan" style={{ boxShadow: "0 0 10px #2fe0ff" }} />
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* cinematic vignette */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 100% at 50% 38%, transparent 50%, rgba(5,6,14,0.6) 100%)" }} />

        {/* loading shim — until tiles+terrain are ready */}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#05060e]">
            <div className="h-6 w-6 rounded-full border-2 border-white/15 border-t-iris animate-spin" />
          </div>
        )}

        {/* lead-in caption (fades as you descend) */}
        <div className="pointer-events-none absolute inset-x-0 top-[13vh] px-6 text-center" style={{ opacity: clamp(1 - p / 0.16) }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/75 backdrop-blur"><RouteIcon size={12} className="text-iris" /> Drop a GPS track</div>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/75" style={{ textShadow: "0 1px 14px rgba(0,0,0,0.8)" }}>Scroll — watch the route build itself across the Himalaya.</p>
        </div>

        {/* zoom-out reveal — the sell */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: titleP, transform: `translateY(${(1 - titleP) * 26}px)` }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/75" style={{ textShadow: "0 1px 14px rgba(0,0,0,0.85)" }}>From one GPS file</div>
          <h2 className="mt-3 text-[clamp(2.4rem,7vw,5rem)] font-medium leading-[1.02] tracking-tight text-white" style={{ fontFamily: SERIF, textShadow: "0 2px 36px rgba(0,0,0,0.7)" }}>
            The Annapurna Circuit,<br /><span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>rendered in 4K</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-white/75" style={{ textShadow: "0 1px 14px rgba(0,0,0,0.8)" }}>Every switchback, every pass — a cinematic flythrough, automatically.</p>
        </div>

        {/* attribution + progress rail */}
        <div className="pointer-events-none absolute bottom-2 right-3 text-[9px] text-white/40">Imagery © Esri, Maxar · Terrain © AWS</div>
        <div className="absolute bottom-10 left-1/2 h-0.5 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-iris" style={{ width: `${p * 100}%` }} />
        </div>
      </div>
    </section>
  );
};
