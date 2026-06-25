"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Sparkles, ChevronDown } from "lucide-react";

/**
 * The landing's opening sequence — a REAL satellite + 3-D-terrain flythrough
 * (ESRI World Imagery + AWS terrarium DEM via /api/dem, both free / key-less).
 *
 * NO IMAGE FLICKER: the camera stays inside a SINGLE integer zoom band (12.x),
 * so the raster source never switches resolution while you scroll — the satellite
 * image never pops/changes. The 3-D comes from terrain + a high banked pitch and
 * continuous position/bearing movement, eased by a damped rAF loop. The route
 * draws itself, product callouts fly by, then the title reveals while the camera
 * pushes in and the scene dissolves seamlessly into the page below.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

// A winding ascent up the Annapurna massif — the camera follows + it builds.
const ROUTE: [number, number][] = [
  [83.958, 28.428], [83.932, 28.450], [83.912, 28.478], [83.892, 28.506],
  [83.872, 28.532], [83.852, 28.557], [83.832, 28.578], [83.814, 28.596],
];
// Facts that GLOW past — bold tracked text, windowed on camera progress so each
// fades in as you approach, peaks alongside, and is gone once you've flown past.
const FACTS: { at: number; lngLat: [number, number]; text: string }[] = [
  { at: 0.13, lngLat: [83.918, 28.470], text: "Describe a moment — it builds the whole scene" },
  { at: 0.28, lngLat: [83.895, 28.504], text: "Draw animated routes between any places" },
  { at: 0.42, lngLat: [83.872, 28.534], text: "Highlight a country, a region, an area" },
  { at: 0.56, lngLat: [83.850, 28.558], text: "A cinematic camera — fly, orbit, push in" },
  { at: 0.68, lngLat: [83.836, 28.574], text: "Looks that grade themselves" },
  { at: 0.78, lngLat: [83.822, 28.588], text: "Export broadcast-ready 4K, in minutes" },
];
// ALL zoom values stay in [12, 13) → one raster level the whole way → no switch.
const CAM = [
  { p: 0.00, lng: 83.952, lat: 28.420, zoom: 12.0, pitch: 62, bearing: -30, roll: 0 },
  { p: 0.26, lng: 83.916, lat: 28.472, zoom: 12.1, pitch: 76, bearing: -12, roll: -3 },
  { p: 0.50, lng: 83.876, lat: 28.526, zoom: 12.2, pitch: 79, bearing: 12, roll: 4 },
  { p: 0.72, lng: 83.842, lat: 28.570, zoom: 12.2, pitch: 76, bearing: 36, roll: 2 },
  { p: 0.88, lng: 83.816, lat: 28.592, zoom: 12.15, pitch: 66, bearing: 28, roll: 0 },
  { p: 1.00, lng: 83.809, lat: 28.598, zoom: 12.6, pitch: 60, bearing: 22, roll: 0 }, // gentle push-in
];
const HIGHLIGHT = {
  type: "Feature" as const, properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[83.792, 28.582], [83.832, 28.582], [83.840, 28.610], [83.804, 28.620], [83.780, 28.602], [83.792, 28.582]]] },
};
const MOTES = [
  { l: 18, t: 30, d: 9, delay: 0 }, { l: 72, t: 24, d: 11, delay: 2 },
  { l: 40, t: 52, d: 8, delay: 1 }, { l: 86, t: 58, d: 12, delay: 3 },
  { l: 28, t: 68, d: 10, delay: 4 }, { l: 60, t: 36, d: 9.5, delay: 1.5 },
  { l: 52, t: 16, d: 13, delay: 2.5 }, { l: 10, t: 50, d: 10.5, delay: 0.8 },
  { l: 80, t: 40, d: 9, delay: 3.5 }, { l: 34, t: 22, d: 12, delay: 1.2 },
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
        paint: { "raster-saturation": -0.5, "raster-contrast": 0.2, "raster-brightness-max": 0.82, "raster-fade-duration": 300 },
      }],
      terrain: { source: "dem", exaggeration: 1.1 },
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

  // Safety net so the loader never hangs even if onLoad is slow.
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
          try { m.jumpTo({ ...o, roll: c.roll } as any); } catch { try { m.jumpTo(o as any); } catch { /* ignore */ } }
        }
        setP(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const drawT = clamp((p - 0.05) / 0.7);
  const sliced = useMemo(() => sliceRoute(ROUTE, drawT), [drawT]);
  const routeData = useMemo(() => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliced } }] }), [sliced]) as any;
  const hlOpacity = clamp((p - 0.68) / 0.18);
  const titleP = clamp((p - 0.80) / 0.12);     // reveals, then holds to 1.0
  const barVh = lerp(0, 6, clamp(p / 0.05));
  const dissolve = clamp((p - 0.97) / 0.03);     // short, seamless dissolve into the page below

  return (
    <section ref={ref} id="how" className="relative" style={{ height: "480vh" }}>
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
            <Layer id="ft-route-glow" type="line" paint={{ "line-color": "#2fe0ff", "line-width": 24, "line-opacity": 0.32, "line-blur": 14 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="ft-route-line" type="line" paint={{ "line-color": "#9af4ff", "line-width": 6.5 }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
          <Source id="ft-hl" type="geojson" data={HIGHLIGHT}>
            <Layer id="ft-hl-fill" type="fill" paint={{ "fill-color": "#6E7BFF", "fill-opacity": 0.24 * hlOpacity }} />
            <Layer id="ft-hl-line" type="line" paint={{ "line-color": "#9CA6FF", "line-width": 2, "line-opacity": hlOpacity }} />
          </Source>
          {FACTS.map((w, i) => {
            // Windowed on camera progress → glows in, peaks, then is gone once passed.
            const o = ease(clamp(1 - Math.abs(p - w.at) / 0.09));
            return (
              <Marker key={i} longitude={w.lngLat[0]} latitude={w.lngLat[1]} anchor="center">
                <div
                  className="pointer-events-none max-w-[44vw] text-center text-[clamp(17px,2.6vw,30px)] font-bold leading-[1.12] tracking-tight text-white"
                  style={{ opacity: o, transform: `translateY(${(1 - o) * 20}px)`, textShadow: "0 0 24px rgba(47,224,255,0.95), 0 2px 18px rgba(0,0,0,0.95)" }}
                >
                  {w.text}
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* ── Cinematic grade & atmosphere — full-inset, no mid-screen seam ── */}
        <div className="pointer-events-none absolute" style={{ top: "-14%", right: "4%", width: "46vmax", height: "46vmax", background: "radial-gradient(circle, rgba(255,238,206,0.18), rgba(110,123,255,0.06) 38%, transparent 70%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(30,44,96,0.55) 0%, rgba(20,30,70,0.10) 26%, transparent 50%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 52% at 50% 5%, rgba(47,224,255,0.14), transparent 58%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, #05060e 0%, rgba(5,6,14,0.5) 30%, transparent 54%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 100% at 50% 40%, transparent 32%, rgba(5,6,14,0.92) 100%)" }} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay" aria-hidden>
          <filter id="ft-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#ft-grain)" />
        </svg>
        {/* drifting motes */}
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {MOTES.map((m, i) => (
            <span key={i} className="absolute h-[3px] w-[3px] rounded-full bg-white/70" style={{ left: `${m.l}%`, top: `${m.t}%`, boxShadow: "0 0 6px rgba(255,255,255,0.7)", animation: `drift ${m.d}s linear ${m.delay}s infinite` }} />
          ))}
        </div>
        {/* letterbox bars */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-black" style={{ height: `${barVh}vh` }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-black" style={{ height: `${barVh}vh` }} />

        {/* seamless dissolve into the page below */}
        <div className="pointer-events-none absolute inset-0 z-30 bg-[#05060e]" style={{ opacity: dissolve }} />

        {!loaded && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05060e]">
            <div className="h-6 w-6 rounded-full border-2 border-white/15 border-t-iris animate-spin" />
          </div>
        )}

        {/* intro hook */}
        <div className="pointer-events-none absolute inset-x-0 top-[15vh] z-10 px-6 text-center" style={{ opacity: clamp(1 - p / 0.14) }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur"><Sparkles size={12} className="text-iris" /> The AI story-map studio</div>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/85" style={{ textShadow: "0 1px 16px rgba(0,0,0,0.9)" }}>Drop a track or describe a story — watch a cinematic map build itself.</p>
        </div>

        {/* creative scroll cue — big centered glowing ring, icon only */}
        <div className="pointer-events-none absolute bottom-[10vh] left-1/2 z-10 -translate-x-1/2" style={{ opacity: clamp(1 - p / 0.05) }}>
          <div className="relative grid h-16 w-16 place-items-center">
            <span className="absolute inset-0 rounded-full border border-cyan/50 animate-ping" />
            <span className="absolute inset-1.5 rounded-full border-2 border-white/30" style={{ boxShadow: "0 0 26px rgba(47,224,255,0.55), inset 0 0 14px rgba(47,224,255,0.25)" }} />
            <ChevronDown size={26} className="relative text-cyan animate-bounce" style={{ filter: "drop-shadow(0 0 10px #2fe0ff)" }} />
          </div>
        </div>

        {/* title reveal (holds through the push-in) */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: titleP, transform: `translateY(${(1 - titleP) * 26}px) scale(${lerp(0.96, 1, titleP)})` }}>
          <div className="absolute h-[64vmin] w-[64vmin] rounded-full" style={{ background: "radial-gradient(circle, rgba(5,6,14,0.76), transparent 70%)" }} />
          <h2 className="relative text-[clamp(2.4rem,7vw,5rem)] font-medium leading-[1.04] tracking-tight text-white" style={{ fontFamily: SERIF, textShadow: "0 2px 40px rgba(0,0,0,0.85)" }}>
            Tell your story<br />with a <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>MAP</span>
          </h2>
          <p className="relative mx-auto mt-5 text-[13px] font-medium uppercase tracking-[0.3em] text-white/75" style={{ textShadow: "0 1px 14px rgba(0,0,0,0.9)" }}>Tell · choose · export — in minutes</p>
        </div>

        <div className="pointer-events-none absolute bottom-2 right-3 z-10 text-[9px] text-white/40">Imagery © Esri, Maxar · Terrain © AWS</div>
        <div className="absolute bottom-[5.5vh] left-1/2 z-20 h-0.5 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-iris" style={{ width: `${p * 100}%` }} />
        </div>
      </div>
    </section>
  );
};
