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
 * loop eases a route-following camera toward it. REVERSED story: opens on the
 * title, flies back along the route revealing each caption, swaps the map style
 * near the end, then pulls back wide into the page below.
 */

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRAD = "linear-gradient(105deg,#9CA6FF,#2fe0ff)";
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Per-caption entrance/exit — each fits the meaning of its line. `o` is the
 *  0→1→0 visibility envelope; `after` is true once the camera is past it. */
function factStyle(motion: string, o: number, after: boolean): React.CSSProperties {
  const away = 1 - o; // 0 at full view, 1 at the edges
  switch (motion) {
    case "route":     // slides along its path + wipes open like a drawn line
      return { opacity: o, transform: `translateX(${(after ? 1 : -1) * away * 70}px)`, clipPath: `inset(0 ${after ? 0 : away * 100}% 0 ${after ? away * 100 : 0}%)` };
    case "highlight": // a left→right highlighter sweep + a small lift
      return { opacity: o, transform: `translateY(${away * 12}px) scale(${lerp(0.92, 1, o)})`, clipPath: `inset(0 ${away * 100}% 0 0)` };
    case "push":      // camera push-in — keeps scaling up through the frame
      return { opacity: o, transform: `scale(${after ? lerp(1, 1.18, away) : lerp(0.82, 1, o)})` };
    case "export":    // render "pop" in, quick shrink out
      return { opacity: o, transform: `scale(${after ? lerp(1, 0.84, away) : lerp(0.5, 1, o)})` };
    case "build":     // assembles out of soft focus
    default:
      return { opacity: o, transform: `translateY(${away * 16}px) scale(${lerp(0.74, 1, o)})`, filter: `blur(${away * 6}px)` };
  }
}

// A smooth winding ascent — the camera follows this line.
const ROUTE: [number, number][] = [
  [83.962, 28.424], [83.936, 28.450], [83.914, 28.478], [83.894, 28.506],
  [83.874, 28.532], [83.854, 28.557], [83.834, 28.578], [83.816, 28.596],
];
// Capability facts (no AI-as-sell). lngLat is derived along the route at render.
const FACTS: { at: number; text: string; hatch?: boolean; motion: string }[] = [
  { at: 0.20, text: "Describe a moment — it builds the whole scene", motion: "build" },
  { at: 0.34, text: "Draw animated routes between any places", motion: "route" },
  { at: 0.48, text: "Highlight a country, a region, an area", hatch: true, motion: "highlight" },
  { at: 0.62, text: "A cinematic camera — fly, orbit, push in", motion: "push" },
  { at: 0.75, text: "Change your map style!", motion: "export" },
];
// The highlighted area sits where the "Highlight…" caption appears (mid-flight),
// just ahead of the camera near route-t≈0.6 — NOT saved for the very end.
const HIGHLIGHT = {
  type: "Feature" as const, properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[83.836, 28.540], [83.876, 28.538], [83.884, 28.562], [83.856, 28.574], [83.830, 28.560], [83.836, 28.540]]] },
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
  // REVERSED story: open on the TITLE (close), fly back into a DEAD-FLAT cruise
  // that reveals the captions, then PULL BACK wide after the last one.
  const intro = ease(clamp(p / 0.1));            // title → cruise (gentle back-out)
  const cruise = ease(clamp((p - 0.1) / 0.72));  // along-route travel, p .10→.82
  const out = ease(clamp((p - 0.82) / 0.18));    // final pull-back, p .82→1
  const a = pointAlong(ROUTE, cruise);
  // Heading from a guaranteed-separated, capped pair so the bearing never collapses.
  const hb = Math.min(0.985, cruise + 0.1);
  const ha = Math.max(0, hb - 0.1);
  return {
    lng: a[0], lat: a[1],
    // Altitude is DEAD FLAT through the cruise (zoom + pitch both constant there);
    // the only up/down moves are the deliberate title close-up and the end pull-back.
    zoom: lerp(lerp(12.52, 12.32, intro), 11.5, out),
    pitch: lerp(lerp(63, 72, intro), 56, out),
    bearing: headingOf(pointAlong(ROUTE, ha), pointAlong(ROUTE, hb)),
  };
}

// Dark-red hatch — matches the highlighted area drawn on the map.
const HatchBadge: React.FC = () => (
  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden style={{ filter: "drop-shadow(0 0 16px rgba(255,45,77,0.85))" }}>
    <defs>
      <pattern id="ft-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke="#ff3b56" strokeWidth="1.4" strokeOpacity="0.6" />
      </pattern>
    </defs>
    <polygon points="10,16 158,5 196,38 186,72 42,78 4,42" fill="url(#ft-hatch)" stroke="#ff5a6e" strokeWidth="2.4" strokeDasharray="9 7" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
      <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.1s" repeatCount="indefinite" />
    </polygon>
  </svg>
);

export const FlyThroughMap: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(0);
  const curRef = useRef(0);
  const smoothRef = useRef(0); // intermediate eased target → momentum/inertia glide
  const rollRef = useRef(0);   // current eased roll (deg)
  const bearRef = useRef(0);   // last bearing → turn rate
  const turnRef = useRef(0);   // smoothed turn rate → bank
  const tRef = useRef(0);      // wall-clock-ish time → idle sway
  const prevRef = useRef(0);   // last frame's cur → scroll speed
  const spdRef = useRef(0);    // smoothed scroll speed → bank gain
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

  // Safety net only — the real reveal is gated on the map's `idle` event (onLoad).
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 14000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!loaded) return;
    let raf = 0; let last = -1;
    const tick = () => {
      // everswap-style glide — cascade two eases (raw scroll → smoothed → current)
      // so the camera carries momentum and keeps gliding for a beat after the scroll
      // stops, instead of tracking the wheel 1:1.
      smoothRef.current += (targetRef.current - smoothRef.current) * 0.1;
      curRef.current += (smoothRef.current - curRef.current) * 0.085;
      if (Math.abs(targetRef.current - curRef.current) < 0.00025 && Math.abs(targetRef.current - smoothRef.current) < 0.00025) { curRef.current = targetRef.current; smoothRef.current = targetRef.current; }
      const cur = curRef.current;
      tRef.current += 0.016;
      const c = flyCam(cur);
      const m = mapRef.current?.getMap();
      if (m) {
        if (Math.abs(cur - last) > 0.0002) {
          last = cur;
          try { m.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing } as any); } catch { /* ignore */ }
          setP(cur);
        }
        // Banking — like an aircraft rolling INTO a curve. The bank scales with
        // scroll SPEED (lots of roll while you scroll through a bend, only a gentle
        // sway when still) and is held steady through the curve, never jittery L/R.
        const instSpd = Math.abs(cur - prevRef.current); prevRef.current = cur;
        spdRef.current = spdRef.current * 0.8 + instSpd * 0.2;
        const spd = clamp(spdRef.current / 0.0035, 0, 1); // 0 still → 1 scrolling fast
        let db = c.bearing - bearRef.current; if (db > 180) db -= 360; if (db < -180) db += 360;
        bearRef.current = c.bearing;
        turnRef.current = turnRef.current * 0.88 + db * 0.12; // smoothed turn rate → held through the bend
        const settle = 1 - clamp((cur - 0.9) / 0.1) * 0.85;  // level off as the title arrives
        const bank = clamp(turnRef.current * (3 + spd * 24), -6.5, 6.5);
        const idle = (Math.sin(tRef.current * 0.5) * 0.9 + Math.sin(tRef.current * 0.23) * 0.4) * (0.5 + 0.5 * (1 - spd));
        rollRef.current += ((bank + idle) * settle - rollRef.current) * 0.1;
        const w = wrapRef.current;
        // Dynamic scale — only as much zoom as the current bank needs to keep the
        // rotated frame covering the viewport (minimal crop when level).
        const sc = 1.05 + Math.min(Math.abs(rollRef.current) / 6.5, 1) * 0.15;
        if (w) { w.style.transformOrigin = "center center"; w.style.transform = `rotate(${rollRef.current.toFixed(3)}deg) scale(${sc.toFixed(3)})`; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const drawT = clamp((p - 0.1) / 0.72);   // route draws as the camera cruises
  const sliced = useMemo(() => {
    const out: [number, number][] = [ROUTE[0]];
    const pts = 48;
    for (let i = 1; i <= pts; i++) { const t = (i / pts) * drawT; if (t > 0) out.push(pointAlong(ROUTE, t)); }
    return out.length > 1 ? out : [ROUTE[0], ROUTE[0]];
  }, [drawT]);
  const routeData = useMemo(() => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliced } }] }), [sliced]) as any;
  // Highlight grows BORDER-FIRST: the rim/glow lead, the dark-red fill + faux
  // side-wall fill in slightly behind.
  const hp = clamp((p - 0.40) / 0.14);          // peaks at the "Highlight…" caption (~0.48)
  const hlBorder = clamp(hp / 0.5);
  const hlFill = clamp((hp - 0.45) / 0.55);
  const hlOut = clamp(1 - (p - 0.58) / 0.1);    // fades out 0.58→0.68 → NOT the last beat
  const styleSwap = clamp((p - 0.73) / 0.025);  // map look SNAPS to a new style as "Change your map style!" lands
  const titleP = clamp(1 - p / 0.085);          // TITLE OPENS the sequence, fades as the cruise begins
  const barVh = lerp(0, 6, clamp(p / 0.05));
  const dissolve = clamp((p - 0.955) / 0.035);  // shorter, quick hand-off into the (dark) page below

  return (
    <section ref={ref} id="how" className="relative" style={{ height: "400vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-[#05060e]">
        <div ref={wrapRef} className="absolute inset-0 will-change-transform">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: ROUTE[0][0], latitude: ROUTE[0][1], zoom: 12.2, pitch: 71, bearing: headingOf(ROUTE[0], ROUTE[1]) }}
          mapStyle={style}
          interactive={false}
          attributionControl={false}
          maxPitch={82}
          onLoad={(e) => {
            // Reveal only when the FIRST view is FULLY painted. We wait for the map's
            // `idle` event — fires once every imagery AND terrain-DEM tile in view is
            // loaded — so no back-corner tile pops in a few scrolls later. A tiles-loaded
            // poll + a hard cap back it up so it can never hang.
            const map = e.target as unknown as { setMaxTileCacheSize?: (n: number) => void; areTilesLoaded?: () => boolean; once?: (ev: string, cb: () => void) => void };
            try { map.setMaxTileCacheSize?.(1536); } catch { /* ignore */ }
            let done = false;
            const reveal = () => { if (!done) { done = true; setLoaded(true); } };
            try { map.once?.("idle", reveal); } catch { /* ignore */ }
            let tries = 0;
            const check = () => {
              if (done) return;
              tries += 1;
              if ((map.areTilesLoaded?.() ?? true) && tries > 6) reveal();   // tiles report loaded
              else if (tries > 70) reveal();                                  // ~10s hard cap
              else setTimeout(check, 150);
            };
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
            {/* soft dark-red glow — reads first, with the border */}
            <Layer id="ft-hl-glow" type="line" paint={{ "line-color": "#ff2d4d", "line-width": lerp(0, 18, hlBorder), "line-blur": 12, "line-opacity": 0.5 * hlBorder * hlOut }} layout={{ "line-cap": "round", "line-join": "round" }} />
            {/* dark-red fill grows in after the border */}
            <Layer id="ft-hl-fill" type="fill" paint={{ "fill-color": "#7d0c1d", "fill-opacity": 0.45 * hlFill * hlOut, "fill-antialias": false }} />
            {/* faux side-wall (screen-offset down) → a slight raised/extruded read, robust on 3-D terrain */}
            <Layer id="ft-hl-wall" type="line" paint={{ "line-color": "#2c0510", "line-width": lerp(0, 9, hlFill), "line-translate": [0, 5], "line-opacity": 0.7 * hlFill * hlOut }} layout={{ "line-cap": "round", "line-join": "round" }} />
            {/* crisp bright rim on top — border-first growth via width + opacity */}
            <Layer id="ft-hl-rim" type="line" paint={{ "line-color": "#ff586e", "line-width": lerp(0.5, 3, hlBorder), "line-translate": [0, -1], "line-opacity": hlBorder * hlOut }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
          {FACTS.map((w, i) => {
            // Trapezoid window → full opacity for a readable plateau, soft edges.
            const o = clamp((0.12 - Math.abs(p - w.at)) / 0.045);
            // Anchor each caption just AHEAD of where the camera is when it peaks
            // (same cruise mapping as flyCam) → the camera flies into/through it.
            const pos = pointAlong(ROUTE, clamp(ease(clamp((w.at - 0.1) / 0.72)) + 0.06, 0, 1));
            return (
              <Marker key={i} longitude={pos[0]} latitude={pos[1]} anchor="center">
                <div className="pointer-events-none" style={factStyle(w.motion, o, p > w.at)}>
                  <span className="relative inline-block max-w-[50vw] px-8 py-3.5">
                    {/* legibility plate — the "highlight" caption gets a SOLID dark-red
                        treatment that matches the highlighted area drawn on the map. */}
                    <span className="absolute inset-0 rounded-2xl" style={w.hatch
                      ? { background: "radial-gradient(120% 140% at 50% 50%, rgba(46,3,12,0.9), rgba(28,2,8,0.55) 72%, rgba(28,2,8,0.12))", border: "1px solid rgba(255,96,116,0.5)", boxShadow: "0 0 34px rgba(255,45,77,0.45), inset 0 0 26px rgba(255,45,77,0.2)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
                      : { background: "radial-gradient(120% 130% at 50% 50%, rgba(4,6,14,0.64), rgba(4,6,14,0.16) 76%, transparent)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }} />
                    {w.hatch && <HatchBadge />}
                    <span className={`relative block text-center font-bold leading-[1.1] tracking-tight text-white ${w.hatch ? "text-[clamp(22px,3.6vw,42px)]" : "text-[clamp(20px,3.1vw,36px)]"}`} style={{ textShadow: w.hatch
                      ? "0 0 34px rgba(255,86,110,0.95), 0 2px 22px rgba(0,0,0,1), 0 1px 3px rgba(0,0,0,1)"
                      : "0 0 30px rgba(47,224,255,0.85), 0 2px 22px rgba(0,0,0,0.99), 0 1px 3px rgba(0,0,0,1)" }}>{w.text}</span>
                  </span>
                </div>
              </Marker>
            );
          })}
        </Map>
        </div>

        {/* ── Painted color + cinematic grade ── */}
        {/* recolor terrain (luminance kept → bright snow stays as painted snowcaps).
            TWO palettes crossfade at the "Change your map style!" beat — the 3-D terrain
            is untouched, only the look changes (cool cinematic → warm topographic). */}
        <div className="pointer-events-none absolute inset-0 mix-blend-color" style={{ background: "linear-gradient(165deg, #1b4a6b 0%, #243a86 55%, #3a2a6e 100%)", opacity: 0.55 * (1 - styleSwap) }} />
        <div className="pointer-events-none absolute inset-0 mix-blend-color" style={{ background: "linear-gradient(160deg, #b6552a 0%, #d98a2f 48%, #7d2f63 100%)", opacity: 0.62 * styleSwap }} />
        <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ background: "radial-gradient(90% 70% at 50% 28%, rgba(255,176,90,0.5), transparent 65%)", opacity: styleSwap }} />
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

        {/* scroll cue — cascading chevrons below the opening title */}
        <div className="pointer-events-none absolute left-1/2 top-[80%] z-10 flex -translate-x-1/2 flex-col items-center" style={{ opacity: clamp(1 - p / 0.06) }}>
          {[0, 1, 2].map((i) => (
            <ChevronDown key={i} size={34} className="text-cyan" style={{ marginTop: i ? -18 : 0, filter: "drop-shadow(0 0 12px #2fe0ff)", animation: `cascade 1.5s ease-in-out ${i * 0.18}s infinite` }} />
          ))}
        </div>

        {/* title OPENS the sequence — the camera flies back "through" it as it fades */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: titleP, transform: `translateY(${(1 - titleP) * -14}px) scale(${lerp(1, 1.08, 1 - titleP)})` }}>
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
