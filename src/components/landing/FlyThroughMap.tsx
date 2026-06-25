"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronDown } from "lucide-react";

/**
 * Landing opener — a REAL satellite + 3-D-terrain flythrough that FOLLOWS a route
 * up the Annapurna massif (ESRI imagery + AWS DEM, both free/key-less). Graded
 * cinematic: desaturated + painted color + lens-blur edges. Constant zoom band
 * (12.x) → the imagery never switches resolution. Scroll sets a target; a damped
 * loop eases a route-following camera toward it. Facts glow past, then the title.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

// A smooth winding ascent — the camera follows this line.
const ROUTE: [number, number][] = [
  [83.962, 28.424], [83.936, 28.450], [83.914, 28.478], [83.894, 28.506],
  [83.874, 28.532], [83.854, 28.557], [83.834, 28.578], [83.816, 28.596],
];
// Capability facts (no AI-as-sell). lngLat is derived along the route at render.
const FACTS: { at: number; text: string; hatch?: boolean }[] = [
  { at: 0.15, text: "Describe a moment — it builds the whole scene" },
  { at: 0.32, text: "Draw animated routes between any places" },
  { at: 0.48, text: "Highlight a country, a region, an area", hatch: true },
  { at: 0.63, text: "A cinematic camera — fly, orbit, push in" },
  { at: 0.77, text: "Export broadcast-ready 4K, in minutes" },
];
const HIGHLIGHT = {
  type: "Feature" as const, properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[83.796, 28.582], [83.834, 28.582], [83.842, 28.610], [83.806, 28.620], [83.784, 28.602], [83.796, 28.582]]] },
};
const MOTES = [
  { l: 18, t: 30, d: 9, delay: 0 }, { l: 72, t: 24, d: 11, delay: 2 }, { l: 40, t: 52, d: 8, delay: 1 },
  { l: 86, t: 58, d: 12, delay: 3 }, { l: 28, t: 68, d: 10, delay: 4 }, { l: 60, t: 36, d: 9.5, delay: 1.5 },
  { l: 52, t: 16, d: 13, delay: 2.5 }, { l: 10, t: 50, d: 10.5, delay: 0.8 }, { l: 80, t: 40, d: 9, delay: 3.5 },
];

function headingOf(a: [number, number], b: [number, number]) {
  return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
}
function pointAlong(coords: [number, number][], t: number): [number, number] {
  if (t <= 0) return coords[0];
  if (t >= 1) return coords[coords.length - 1];
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < coords.length; i++) { const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]); seg.push(d); total += d; }
  let target = total * t;
  for (let i = 1; i < coords.length; i++) {
    const d = seg[i - 1];
    if (target <= d) { const f = d ? target / d : 0; return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f]; }
    target -= d;
  }
  return coords[coords.length - 1];
}
function flyCam(p: number) {
  const reveal = clamp((p - 0.86) / 0.14);
  const f = ease(clamp(p / 0.9));
  const dive = ease(clamp(p / 0.78)); // progressively closer + lower → more immersed
  const a = pointAlong(ROUTE, f);
  const b = pointAlong(ROUTE, Math.min(1, f + 0.12)); // longer look-ahead → smoother banking
  return {
    lng: a[0], lat: a[1],
    zoom: lerp(lerp(12.1, 12.46, dive), 12.3, reveal),  // closer over the dive, stays in z12 → no resolution switch
    pitch: lerp(lerp(66, 79, dive), 54, reveal),
    bearing: headingOf(a, b),
  };
}

const HatchBadge: React.FC = () => (
  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden style={{ filter: "drop-shadow(0 0 14px rgba(110,123,255,0.75))" }}>
    <defs>
      <pattern id="ft-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke="#7c8cff" strokeWidth="1.3" strokeOpacity="0.5" />
      </pattern>
    </defs>
    <polygon points="10,16 158,5 196,38 186,72 42,78 4,42" fill="url(#ft-hatch)" stroke="#9CA6FF" strokeWidth="2" strokeDasharray="9 7" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
      <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.1s" repeatCount="indefinite" />
    </polygon>
  </svg>
);

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
      // Strongly desaturated + darkened → reads as a graded, cinematic base.
      layers: [{
        id: "esri", type: "raster", source: "esri",
        paint: { "raster-saturation": -0.8, "raster-contrast": 0.24, "raster-brightness-max": 0.74, "raster-hue-rotate": 200, "raster-fade-duration": 300 },
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

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 4000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!loaded) return;
    let raf = 0; let last = -1;
    const tick = () => {
      curRef.current += (targetRef.current - curRef.current) * 0.065;
      if (Math.abs(targetRef.current - curRef.current) < 0.0004) curRef.current = targetRef.current;
      const cur = curRef.current;
      if (Math.abs(cur - last) > 0.0002) {
        last = cur;
        const c = flyCam(cur);
        const m = mapRef.current?.getMap();
        if (m) { try { m.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing } as any); } catch { /* ignore */ } }
        setP(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const drawT = clamp(p / 0.82);
  const sliced = useMemo(() => {
    const out: [number, number][] = [ROUTE[0]];
    const pts = 48;
    for (let i = 1; i <= pts; i++) { const t = (i / pts) * drawT; if (t > 0) out.push(pointAlong(ROUTE, t)); }
    return out.length > 1 ? out : [ROUTE[0], ROUTE[0]];
  }, [drawT]);
  const routeData = useMemo(() => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliced } }] }), [sliced]) as any;
  const hlOpacity = clamp((p - 0.68) / 0.18);
  const titleP = clamp((p - 0.82) / 0.12);
  const barVh = lerp(0, 6, clamp(p / 0.05));
  const dissolve = clamp((p - 0.97) / 0.03);

  return (
    <section ref={ref} id="how" className="relative" style={{ height: "480vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-[#05060e]">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: ROUTE[0][0], latitude: ROUTE[0][1], zoom: 12.2, pitch: 72, bearing: headingOf(ROUTE[0], ROUTE[1]) }}
          mapStyle={style}
          interactive={false}
          attributionControl={false}
          maxPitch={82}
          onLoad={(e) => {
            // Wait for the FIRST view's tiles before revealing → no missing/black tile at the start.
            const map = e.target as unknown as { setMaxTileCacheSize?: (n: number) => void; areTilesLoaded?: () => boolean };
            try { map.setMaxTileCacheSize?.(768); } catch { /* ignore */ }
            let tries = 0;
            const check = () => { tries += 1; if ((map.areTilesLoaded?.() ?? true) || tries > 32) setLoaded(true); else setTimeout(check, 150); };
            check();
          }}
          onError={() => { /* tile hiccups must never break the hero */ }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <Source id="ft-route" type="geojson" data={routeData}>
            <Layer id="ft-route-glow" type="line" paint={{ "line-color": "#2fe0ff", "line-width": 24, "line-opacity": 0.32, "line-blur": 14 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="ft-route-line" type="line" paint={{ "line-color": "#9af4ff", "line-width": 6.5 }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
          <Source id="ft-hl" type="geojson" data={HIGHLIGHT}>
            <Layer id="ft-hl-fill" type="fill" paint={{ "fill-color": "#6E7BFF", "fill-opacity": 0.22 * hlOpacity }} />
            <Layer id="ft-hl-line" type="line" paint={{ "line-color": "#9CA6FF", "line-width": 2, "line-opacity": hlOpacity }} />
          </Source>
          {FACTS.map((w, i) => {
            // Trapezoid window → full opacity for a readable plateau, soft edges.
            const o = clamp((0.12 - Math.abs(p - w.at)) / 0.045);
            const pos = pointAlong(ROUTE, clamp(ease(w.at / 0.9) + 0.05, 0, 1));
            return (
              <Marker key={i} longitude={pos[0]} latitude={pos[1]} anchor="center">
                <div className="pointer-events-none" style={{ opacity: o, transform: `translateY(${(1 - o) * 18}px)` }}>
                  <span className="relative inline-block max-w-[46vw] px-7 py-3">
                    {w.hatch && <HatchBadge />}
                    <span className="relative block text-center text-[clamp(18px,2.8vw,32px)] font-bold leading-[1.12] tracking-tight text-white" style={{ textShadow: "0 0 26px rgba(47,224,255,0.95), 0 2px 20px rgba(0,0,0,0.98)" }}>{w.text}</span>
                  </span>
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* ── Painted color + cinematic grade ── */}
        {/* recolor terrain (luminance kept → bright snow stays as painted snowcaps) */}
        <div className="pointer-events-none absolute inset-0 mix-blend-color" style={{ background: "linear-gradient(165deg, #1b4a6b 0%, #243a86 55%, #3a2a6e 100%)", opacity: 0.55 }} />
        {/* reduce visibility — moody dark wash */}
        <div className="pointer-events-none absolute inset-0 bg-[#05060e]" style={{ opacity: 0.22 }} />
        {/* sky + horizon + grounding, full-inset (no seam) */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(26,40,92,0.6) 0%, rgba(18,26,64,0.12) 28%, transparent 52%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 52% at 50% 4%, rgba(47,224,255,0.16), transparent 58%)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, #05060e 0%, rgba(5,6,14,0.55) 30%, transparent 56%)" }} />
        {/* deep vignette */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 100% at 50% 42%, transparent 28%, rgba(5,6,14,0.95) 100%)" }} />
        {/* lens-blur edges → shallow depth-of-field */}
        <div className="pointer-events-none absolute inset-0" style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", maskImage: "radial-gradient(72% 66% at 50% 46%, transparent 52%, #000 100%)", WebkitMaskImage: "radial-gradient(72% 66% at 50% 46%, transparent 52%, #000 100%)" }} />
        {/* grain */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06] mix-blend-overlay" aria-hidden>
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

        {/* scroll cue — cascading chevrons (clear, interesting), no circle/text */}
        <div className="pointer-events-none absolute left-1/2 top-[53%] z-10 flex -translate-x-1/2 flex-col items-center" style={{ opacity: clamp(1 - p / 0.05) }}>
          {[0, 1, 2].map((i) => (
            <ChevronDown key={i} size={34} className="text-cyan" style={{ marginTop: i ? -18 : 0, filter: "drop-shadow(0 0 12px #2fe0ff)", animation: `cascade 1.5s ease-in-out ${i * 0.18}s infinite` }} />
          ))}
        </div>

        {/* title reveal */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: titleP, transform: `translateY(${(1 - titleP) * 26}px) scale(${lerp(0.96, 1, titleP)})` }}>
          <div className="absolute h-[64vmin] w-[64vmin] rounded-full" style={{ background: "radial-gradient(circle, rgba(5,6,14,0.78), transparent 70%)" }} />
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
