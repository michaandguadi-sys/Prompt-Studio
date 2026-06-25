"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Sparkles, ChevronDown } from "lucide-react";

/**
 * The landing's opening sequence — a REAL satellite + 3-D-terrain flythrough
 * (ESRI World Imagery + AWS terrarium DEM via /api/dem, both free / key-less),
 * graded dark + desaturated so the snowcapped massif pops in an epic, futuristic
 * frame. Scroll sets a TARGET; a damped rAF loop eases the camera toward it
 * every frame → glass-smooth motion + stable raster levels (no tile pop). As you
 * fly, the route draws itself and PRODUCT-FEATURE callouts pop tracked to the
 * terrain, then the camera eases back to reveal the payoff.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

const ROUTE: [number, number][] = [
  [83.930, 28.452], [83.908, 28.486], [83.888, 28.514], [83.868, 28.540],
  [83.850, 28.565], [83.834, 28.585], [83.820, 28.598],
];
// Tracked callouts = what the BUILDER does (not trek waypoints).
const FEATURES: { at: number; lngLat: [number, number]; label: string; sub: string }[] = [
  { at: 0.20, lngLat: [83.905, 28.490], label: "AI-directed", sub: "researches & composes the shot" },
  { at: 0.46, lngLat: [83.862, 28.545], label: "Cinematic camera", sub: "fly · orbit · push — no keyframes" },
  { at: 0.70, lngLat: [83.838, 28.578], label: "Looks that grade themselves", sub: "noir · topographic · satellite" },
  { at: 0.92, lngLat: [83.821, 28.596], label: "Highlight any region", sub: "+ routes · markers · live data" },
];
// Tight zoom band + subtle roll for a banked feel rounding the massif.
const CAM = [
  { p: 0.00, lng: 83.95, lat: 28.42, zoom: 11.3, pitch: 60, bearing: -28, roll: 0 },
  { p: 0.32, lng: 83.91, lat: 28.49, zoom: 11.9, pitch: 74, bearing: -8, roll: -3 },
  { p: 0.58, lng: 83.87, lat: 28.54, zoom: 12.2, pitch: 78, bearing: 16, roll: 4 },
  { p: 0.80, lng: 83.842, lat: 28.578, zoom: 12.0, pitch: 70, bearing: 40, roll: 2 },
  { p: 1.00, lng: 83.86, lat: 28.52, zoom: 10.7, pitch: 46, bearing: 22, roll: 0 },
];
const HIGHLIGHT = {
  type: "Feature" as const, properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[83.800, 28.585], [83.842, 28.585], [83.848, 28.612], [83.812, 28.622], [83.788, 28.604], [83.800, 28.585]]] },
};
const MOTES = [
  { l: 18, t: 30, d: 9, delay: 0 }, { l: 72, t: 24, d: 11, delay: 2 },
  { l: 40, t: 52, d: 8, delay: 1 }, { l: 86, t: 58, d: 12, delay: 3 },
  { l: 28, t: 68, d: 10, delay: 4 }, { l: 60, t: 36, d: 9.5, delay: 1.5 },
  { l: 52, t: 16, d: 13, delay: 2.5 }, { l: 10, t: 50, d: 10.5, delay: 0.8 },
];

function camAt(p: number) {
  let a = CAM[0], b = CAM[CAM.length - 1];
  for (let i = 0; i < CAM.length - 1; i++) { if (p >= CAM[i].p && p <= CAM[i + 1].p) { a = CAM[i]; b = CAM[i + 1]; break; } }
  const t = a.p === b.p ? 0 : ease(clamp((p - a.p) / (b.p - a.p)));
  return { lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t), zoom: lerp(a.zoom, b.zoom, t), pitch: lerp(a.pitch, b.pitch, t), bearing: lerp(a.bearing, b.bearing, t), roll: lerp(a.roll, b.roll, t) };
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
  const targetRef = useRef(0);
  const curRef = useRef(0);
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
      layers: [{
        id: "esri", type: "raster", source: "esri",
        paint: { "raster-saturation": -0.5, "raster-contrast": 0.2, "raster-brightness-max": 0.82, "raster-fade-duration": 600 },
      }],
      terrain: { source: "dem", exaggeration: 1.5 },
    } as any;
  }, []);

  useEffect(() => {
    const on = () => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      targetRef.current = total > 0 ? clamp(Math.min(Math.max(-r.top, 0), total) / total) : 0;
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    on();
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  // Safety net: never let the loader hang. If onLoad is slow (or a tile source
  // stalls), start the experience anyway after a moment — tiles fill in live.
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 4000); return () => clearTimeout(t); }, []);

  // Damped camera loop — glass-smooth regardless of scroll cadence.
  useEffect(() => {
    if (!loaded) return;
    let raf = 0; let last = -1;
    const tick = () => {
      curRef.current += (targetRef.current - curRef.current) * 0.085;
      if (Math.abs(targetRef.current - curRef.current) < 0.0004) curRef.current = targetRef.current;
      const cur = curRef.current;
      if (Math.abs(cur - last) > 0.0002) {
        last = cur;
        const c = camAt(cur);
        const m = mapRef.current?.getMap();
        if (m) {
          const o = { center: [c.lng, c.lat] as [number, number], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing };
          // `roll` only exists on newer MapLibre — attempt it, fall back cleanly.
          try { m.jumpTo({ ...o, roll: c.roll } as any); } catch { try { m.jumpTo(o as any); } catch { /* ignore */ } }
        }
        setP(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const drawT = clamp((p - 0.08) / 0.72);
  const sliced = useMemo(() => sliceRoute(ROUTE, drawT), [drawT]);
  const routeData = useMemo(() => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliced } }] }), [sliced]) as any;
  const head = sliced[sliced.length - 1];
  const hlOpacity = clamp((p - 0.72) / 0.2);
  const titleP = clamp((p - 0.86) / 0.14);
  const barVh = lerp(0, 6, clamp(p / 0.05));

  return (
    <section ref={ref} id="how" className="relative" style={{ height: "440vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-[#05060e]">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: CAM[0].lng, latitude: CAM[0].lat, zoom: CAM[0].zoom, pitch: CAM[0].pitch, bearing: CAM[0].bearing }}
          mapStyle={style}
          interactive={false}
          attributionControl={false}
          maxPitch={82}
          onLoad={() => setLoaded(true)}
          onError={() => { /* tile/source hiccups must never break the hero */ }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <Source id="ft-route" type="geojson" data={routeData}>
            <Layer id="ft-route-glow" type="line" paint={{ "line-color": "#2fe0ff", "line-width": 12, "line-opacity": 0.4, "line-blur": 8 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="ft-route-line" type="line" paint={{ "line-color": "#7df0ff", "line-width": 3.5 }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
          <Source id="ft-hl" type="geojson" data={HIGHLIGHT}>
            <Layer id="ft-hl-fill" type="fill" paint={{ "fill-color": "#6E7BFF", "fill-opacity": 0.24 * hlOpacity }} />
            <Layer id="ft-hl-line" type="line" paint={{ "line-color": "#9CA6FF", "line-width": 2, "line-opacity": hlOpacity }} />
          </Source>
          {head && drawT > 0.02 && drawT < 0.998 && (
            <Marker longitude={head[0]} latitude={head[1]} anchor="center">
              <div className="h-3 w-3 rounded-full bg-white" style={{ boxShadow: "0 0 18px 5px #2fe0ff", animation: "breathe 1.1s ease-in-out infinite" }} />
            </Marker>
          )}
          {FEATURES.map((w, i) => {
            const on = drawT >= w.at;
            return (
              <Marker key={i} longitude={w.lngLat[0]} latitude={w.lngLat[1]} anchor="bottom">
                <div className="pointer-events-none flex flex-col items-center" style={{ opacity: on ? 1 : 0, transform: `translateY(${on ? 0 : 10}px)`, transition: "opacity .55s ease, transform .55s ease" }}>
                  <div className="flex items-center gap-1.5 rounded-lg border border-iris/40 bg-black/70 px-2.5 py-1.5 backdrop-blur">
                    <Sparkles size={11} className="shrink-0 text-iris" />
                    <div className="text-left">
                      <div className="whitespace-nowrap text-[12px] font-semibold leading-none text-white">{w.label}</div>
                      <div className="mt-0.5 whitespace-nowrap text-[10px] text-white/55">{w.sub}</div>
                    </div>
                  </div>
                  <div className="mt-1 w-px" style={{ height: 48, background: "linear-gradient(to bottom,#6E7BFF,rgba(110,123,255,0))" }} />
                  <div className="-mt-0.5 h-2 w-2 rounded-full bg-iris" style={{ boxShadow: "0 0 12px #6E7BFF" }} />
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* ── Cinematic grade & atmosphere — full-inset gradients, no mid-screen seam ── */}
        {/* warm sun bloom (soft radial, fades naturally) */}
        <div className="pointer-events-none absolute" style={{ top: "-14%", right: "4%", width: "46vmax", height: "46vmax", background: "radial-gradient(circle, rgba(255,238,206,0.18), rgba(110,123,255,0.06) 38%, transparent 70%)" }} />
        {/* sky tint — concentrated up top, gone by mid (no hard edge) */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(30,44,96,0.55) 0%, rgba(20,30,70,0.10) 26%, transparent 50%)" }} />
        {/* cyan horizon glow */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 52% at 50% 5%, rgba(47,224,255,0.14), transparent 58%)" }} />
        {/* grounding — depth + legibility, fades up to mid */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, #05060e 0%, rgba(5,6,14,0.5) 30%, transparent 54%)" }} />
        {/* deep vignette */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 100% at 50% 40%, transparent 32%, rgba(5,6,14,0.92) 100%)" }} />
        {/* film grain */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay" aria-hidden>
          <filter id="ft-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#ft-grain)" />
        </svg>
        {/* drifting atmospheric motes */}
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {MOTES.map((m, i) => (
            <span key={i} className="absolute h-[3px] w-[3px] rounded-full bg-white/70" style={{ left: `${m.l}%`, top: `${m.t}%`, boxShadow: "0 0 6px rgba(255,255,255,0.7)", animation: `drift ${m.d}s linear ${m.delay}s infinite` }} />
          ))}
        </div>
        {/* letterbox bars */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-black" style={{ height: `${barVh}vh` }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-black" style={{ height: `${barVh}vh` }} />

        {/* loading shim */}
        {!loaded && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05060e]">
            <div className="h-6 w-6 rounded-full border-2 border-white/15 border-t-iris animate-spin" />
          </div>
        )}

        {/* intro hook */}
        <div className="pointer-events-none absolute inset-x-0 top-[15vh] z-10 px-6 text-center" style={{ opacity: clamp(1 - p / 0.14) }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur"><Sparkles size={12} className="text-iris" /> The AI story-map studio</div>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/85" style={{ textShadow: "0 1px 16px rgba(0,0,0,0.9)" }}>Drop a track or describe a story — watch a cinematic map build itself.</p>
        </div>

        {/* bold scroll cue */}
        <div className="pointer-events-none absolute bottom-[9vh] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5" style={{ opacity: clamp(1 - p / 0.05) }}>
          <div className="relative h-9 w-[22px] rounded-full border-2 border-white/75" style={{ boxShadow: "0 0 18px rgba(47,224,255,0.55)" }}>
            <span className="absolute left-1/2 top-2 h-1.5 w-1 rounded-full bg-cyan" style={{ animation: "scrollDot 1.5s ease-in-out infinite" }} />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/85" style={{ textShadow: "0 1px 12px rgba(0,0,0,0.9)" }}>Scroll to fly</span>
          <div className="-space-y-2 text-cyan" style={{ animation: "breathe 1.8s ease-in-out infinite" }}>
            <ChevronDown size={18} className="block" /><ChevronDown size={18} className="-mt-2 block" />
          </div>
        </div>

        {/* zoom-out reveal */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: titleP, transform: `translateY(${(1 - titleP) * 26}px) scale(${lerp(0.96, 1, titleP)})` }}>
          <div className="absolute h-[60vmin] w-[60vmin] rounded-full" style={{ background: "radial-gradient(circle, rgba(5,6,14,0.72), transparent 70%)" }} />
          <div className="relative text-[11px] font-semibold uppercase tracking-[0.4em] text-white/80" style={{ textShadow: "0 1px 16px rgba(0,0,0,0.9)" }}>From a sentence or a track</div>
          <h2 className="relative mt-3 text-[clamp(2.4rem,7vw,5rem)] font-medium leading-[1.02] tracking-tight text-white" style={{ fontFamily: SERIF, textShadow: "0 2px 40px rgba(0,0,0,0.85)" }}>
            Your map,<br /><span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>rendered in 4K</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[15px] text-white/80" style={{ textShadow: "0 1px 16px rgba(0,0,0,0.85)" }}>Cinematic camera, graded look, broadcast-ready — automatically.</p>
        </div>

        {/* attribution + progress rail */}
        <div className="pointer-events-none absolute bottom-2 right-3 z-10 text-[9px] text-white/40">Imagery © Esri, Maxar · Terrain © AWS</div>
        <div className="absolute bottom-[5.5vh] left-1/2 z-20 h-0.5 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-iris" style={{ width: `${p * 100}%` }} />
        </div>
      </div>
    </section>
  );
};
