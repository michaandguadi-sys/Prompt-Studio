"use client";

import React, { useEffect, useMemo, useRef } from "react";
import MapGL, { type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoStop } from "./worldCoords";
import { ML_STYLES, applyBasemapIdentity, type PaintStash } from "@/lib/maplibre";
import type { Map3DStyle } from "@/lib/presets/map3dStyles";
import { outlineFor, seaLaneFor, DIVE_3D } from "./demoGeo";

/**
 * GRADED SATELLITE base — real Earth texture (ESRI World Imagery through our
 * cached /api/sat proxy) pulled down into a dark cinematic grade: desaturated,
 * crushed blacks, gentle warmth. Terrain reads as texture, never as noise.
 */
const satelliteNightStyle = (origin: string): Record<string, unknown> => ({
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [`${origin}/api/sat/{z}/{x}/{y}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#04060f" } },
    {
      id: "sat", type: "raster", source: "sat",
      paint: {
        "raster-saturation": -0.45,
        "raster-contrast": 0.22,
        "raster-brightness-max": 0.6,
        "raster-brightness-min": 0.015,
        "raster-hue-rotate": 8,
        "raster-fade-duration": 0,
      },
    },
  ],
});

/**
 * The living map — the Generate page's entire background is a real MapLibre
 * globe (the product's own engine, so what you see IS what it makes):
 *
 *   · idle: the camera drifts slowly around the world; ambient flight arcs
 *     draw between world hubs with glowing particles riding them
 *   · typing: recognised places bloom as pulsing pins, the journey draws as
 *     bright arcs, and the camera eases to frame what the AI understood
 *   · hover (inspiration cards): that story's route previews in amber
 *   · generate: the camera dives toward the first destination — the animation
 *     begins before the editor even opens
 *   · a soft parallax follows the mouse; everything pauses when tab is hidden
 *
 * All overlay drawing happens on ONE canvas in a single rAF loop that projects
 * geo coordinates through the live map — no React re-renders per frame.
 */

/** A tap-to-preview restyle of the living map: raster grade + accent palette
 *  for arcs/pins. Lets the landing's style cards recolour the world LIVE. */
export type MapGrade = {
  tint: string;                       // wash colour drawn over the frame
  accents: [string, string, string];  // arc / pin / hub palette
  saturation?: number;                // raster-saturation (-1..1)
  brightness?: number;                // raster-brightness-max (0..1)
  hueRotate?: number;                 // raster-hue-rotate (degrees)
  contrast?: number;                  // raster-contrast (-1..1)
  /** 0..1 — how hard the tint wash hits (drives the duotone feel). */
  tintStrength?: number;
};

/** How the typed story previews on the map: flowing route arcs, plain pins,
 *  glowing territory highlights, a heat scatter, or a water-hugging sea lane. */
export type PreviewFlavor = "route" | "pins" | "highlight" | "heat" | "sea";

/** Pick the preview flavor from the prompt text + the intent engine's action. */
export function flavorForPrompt(text: string, action?: string | null): PreviewFlavor {
  if (/heat ?map|earthquake|wildfire|outbreak|cases|crime|density|incidents|hotspots?|events\b/i.test(text)) return "heat";
  if (/\b(sail|sailing|boat|ferry|cruise|ship|voyage|by sea)\b/i.test(text)) return "sea";
  if (action === "highlight" || /highlight|every country|countries i|visited|territory|empire|region/i.test(text)) return "highlight";
  return "route";
}

/**
 * REAL basemap variants for the landing's style taps — actual style swaps
 * (different tiles / vector styles / 3D terrain), not a colour grade on one
 * satellite. Mirrors the editor's own basemaps in src/lib/maplibre.ts.
 */
export type LandingBaseStyle = "satellite" | "light" | "streets" | "dark-editorial" | "terrain3d";

/** Satellite + real 3D terrain (same DEM proxy the editor renders with). */
const terrain3dStyle = (origin: string): Record<string, unknown> => ({
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [`${origin}/api/sat/{z}/{x}/{y}`],
      tileSize: 256, maxzoom: 19,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
    dem: {
      type: "raster-dem",
      tiles: [`${origin}/api/dem/{z}/{x}/{y}`],
      encoding: "terrarium", tileSize: 256, maxzoom: 15,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#04060f" } },
    { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.1, "raster-contrast": 0.1, "raster-fade-duration": 0 } },
  ],
  terrain: { source: "dem", exaggeration: 1.2 },
});

type Props = {
  stops: GeoStop[];
  hoverStops?: GeoStop[] | null;
  generating?: boolean;
  grade?: MapGrade | null;
  flavor?: PreviewFlavor;
  /** Landing style taps: swap the REAL basemap (satellite / light / streets /
   *  dark-editorial with red borders + grey streets / satellite + 3D terrain). */
  baseStyle?: LandingBaseStyle;
  /** A full PRO style (the editor's own Map3DStyle). When set it DRIVES the
   *  preview through the SAME pipeline as the render — applyBasemapIdentity
   *  recolours land/water/borders + grid, terrain lifts, and the overlay palette
   *  is derived from the style — so the preview == the actual output. */
  proStyle?: Map3DStyle | null;
  /** Arrival choreography: start on a tilted 3D close-up over the Alps and fly
   *  down to the drifting world view as the page reveals (once per session). */
  introFly?: boolean;
};

/* Ambient world hubs — the idle "airline network" show. */
const HUBS: [number, number][] = [
  [-74.01, 40.71], [-0.13, 51.51], [2.35, 48.86], [28.98, 41.01], [55.27, 25.20],
  [139.69, 35.69], [103.85, 1.29], [151.21, -33.87], [-43.17, -22.91], [-99.13, 19.43],
  [18.42, -33.93], [77.10, 28.70], [-122.42, 37.77], [13.40, 52.52],
];
/** Ambient arc cycles: [fromHub, toHub, durationSec, phaseSec] */
const AMBIENT: [number, number, number, number][] = [
  [0, 1, 9, 0], [1, 4, 11, 2], [4, 5, 10, 4], [5, 7, 12, 1], [12, 5, 13, 6],
  [9, 8, 10, 3], [2, 3, 8, 5], [3, 11, 11, 7], [10, 8, 14, 2], [6, 7, 9, 8],
  [13, 2, 7, 4], [0, 12, 10, 9],
];

/** IDLE WORLD TOUR — a curated showreel of the most cinematic terrain on Earth.
 *  The background glides between these framings with the editor's eased camera
 *  language; zooms stay modest so the hero never becomes a tile-heavy drag. */
type Hero = { c: [number, number]; z: number; p: number; b: number };
const WORLD_TOUR: Hero[] = [
  { c: [86.9, 27.9],   z: 4.0, p: 30, b: 12 },   // Himalaya — the Everest massif
  { c: [7.3, 61.2],    z: 4.6, p: 26, b: -14 },  // Norwegian fjords
  { c: [-72.6, -50.9], z: 4.2, p: 24, b: 8 },    // Patagonia — Torres del Paine
  { c: [-112.2, 36.2], z: 4.8, p: 28, b: -18 },  // Grand Canyon
  { c: [9.6, 46.5],    z: 4.9, p: 30, b: -22 },  // The Alps
  { c: [170.3, -43.6], z: 4.7, p: 26, b: 16 },   // New Zealand — Southern Alps
  { c: [-19.0, 64.6],  z: 4.4, p: 20, b: 0 },    // Iceland
  { c: [137.9, 36.1],  z: 3.9, p: 24, b: 10 },   // Japan — the roof of Honshu
];
const TOUR_FLY_MS = 5200;    // the cinematic glide between landscapes
const TOUR_DWELL_MS = 6500;  // how long we hold on each, breathing gently

const IRIS = "#6E7BFF", CYAN = "#2FE0FF", VIOLET = "#B57BFF", AMBER = "#FFB86E";

/**
 * Per-basestyle theme for EVERY overlay element — when the general style
 * changes, the arcs, hubs, pins, label chips, highlights and sea lanes all
 * change their look with it (dark glow accents on satellite, deep inks on the
 * light map, editorial red on the red-border style, …).
 */
const STYLE_THEMES: Record<LandingBaseStyle, {
  accents: [string, string, string];
  pinCore: string;
  chipBg: string;
  chipText: string;
  sea: string;
  /** 0..1 — how hard the dark readability wash over the map hits. */
  wash: number;
}> = {
  satellite:        { accents: [IRIS, CYAN, VIOLET],                pinCore: "#ffffff", chipBg: "rgba(4,6,16,0.78)",    chipText: "rgba(255,255,255,0.92)", sea: CYAN,      wash: 1 },
  terrain3d:        { accents: [CYAN, IRIS, AMBER],                 pinCore: "#ffffff", chipBg: "rgba(4,6,16,0.78)",    chipText: "rgba(255,255,255,0.92)", sea: CYAN,      wash: 0.8 },
  light:            { accents: ["#4338CA", "#0E7490", "#7C3AED"],   pinCore: "#1E1B4B", chipBg: "rgba(255,255,255,0.9)", chipText: "rgba(24,28,45,0.94)",    sea: "#0E7490", wash: 0.28 },
  streets:          { accents: ["#B45309", "#0F766E", "#7C2D92"],   pinCore: "#292524", chipBg: "rgba(255,255,255,0.9)", chipText: "rgba(41,37,36,0.94)",    sea: "#0F766E", wash: 0.28 },
  "dark-editorial": { accents: ["#FF3B4D", "#9AA3B5", "#FF8091"],   pinCore: "#ffffff", chipBg: "rgba(10,10,14,0.82)",  chipText: "rgba(255,255,255,0.92)", sea: "#FF8091", wash: 0.6 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const eio = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

type ElementTheme = { accents: [string, string, string]; pinCore: string; chipBg: string; chipText: string; sea: string; wash: number };

/** Luminance test on a #rrggbb — decides light-vs-dark chip/pin treatment. */
function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

/** The base map JSON for a PRO style — same bases the editor uses (dark/light
 *  vector or the graded satellite/terrain raster), so applyBasemapIdentity can
 *  then recolour land/water/borders + grid identically to the render path. */
function proBase(style: Map3DStyle, origin: string): string | Record<string, unknown> {
  const url = String((style.basemap as any).styleUrl || "");
  const terrain = !!(style.basemap as any).terrain;
  if (/satellite/i.test(url)) return terrain ? terrain3dStyle(origin) : satelliteNightStyle(origin);
  if (/streets|voyager/i.test(url)) return ML_STYLES.streets;
  if (/light|positron/i.test(url)) return ML_STYLES.light;
  return ML_STYLES.dark;
}

/** Derive the canvas overlay palette from a pro style, so pins/arcs/labels
 *  match the map (accent = the style's border/accent, sea = its water). */
function themeForPro(style: Map3DStyle): ElementTheme {
  const sw = (style.swatches as string[]) ?? ["#04060f", "#1a1d2e", "#6E7BFF"];
  const bg = String((style.look as any)?.bgColor || sw[0] || "#04060f");
  const light = isLightHex(bg) || isLightHex(String((style.basemap as any).landColor || ""));
  // Same accent rule as elementPaletteFor (editor) — border colour, else a bright
  // legible default; card swatches are too earth-toned for a route line.
  const accent = String((style.basemap as any).boundaryGlow || (light ? "#3b4bd8" : IRIS));
  const water = String((style.basemap as any).waterColor || sw[1] || CYAN);
  return {
    accents: [accent, sw[1] || CYAN, sw[2] || VIOLET],
    pinCore: light ? "#141428" : "#ffffff",
    chipBg: light ? "rgba(255,255,255,0.9)" : "rgba(4,6,16,0.8)",
    chipText: light ? "rgba(20,24,40,0.95)" : "rgba(255,255,255,0.92)",
    sea: water,
    wash: light ? 0.24 : 0.78,
  };
}

export const LiveStoryMap: React.FC<Props> = ({ stops, hoverStops, generating, grade, flavor, baseStyle = "satellite", proStyle, introFly }) => {
  // REAL style swap per tap. A pro style drives the base through the editor's
  // own bases; otherwise the legacy landing basestyles apply.
  const mapStyle = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (proStyle) return proBase(proStyle, origin);
    switch (baseStyle) {
      case "light": return ML_STYLES.light;
      case "streets": return ML_STYLES.streets;
      case "dark-editorial": return ML_STYLES.dark;
      case "terrain3d": return terrain3dStyle(origin);
      default: return satelliteNightStyle(origin);
    }
  }, [baseStyle, proStyle]);
  const theme = proStyle ? themeForPro(proStyle) : (STYLE_THEMES[baseStyle] ?? STYLE_THEMES.satellite);
  const mapRef = useRef<MapRef>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const par = useRef({ x: 0, y: 0 });
  const loadedRef = useRef(false);
  // World-wrap guard: never zoom out past one-world-fills-the-frame, so the
  // hero can't show duplicated earths on ultra-wide screens (same rule the
  // render pipeline enforces via minZoomForAspect).
  const [minZoom] = React.useState(() =>
    typeof window === "undefined" ? 1.4 : Math.max(1.2, Math.log2((window.innerWidth * 1.07) / 512) + 0.05),
  );

  // Live refs so the rAF loop always sees fresh props without re-subscribing.
  const stopsRef = useRef(stops);
  const hoverRef = useRef(hoverStops);
  const genRef = useRef(!!generating);
  const gradeRef = useRef(grade);
  const flavorRef = useRef(flavor);
  const baseStyleRef = useRef(baseStyle);
  const introFlyRef = useRef(!!introFly);
  const introActiveRef = useRef(false); // true while the arrival flight owns the camera
  // Pin bloom: remember when each stop label first appeared, for the pop-in.
  const bornRef = useRef(new Map<string, number>());
  stopsRef.current = stops;
  hoverRef.current = hoverStops;
  genRef.current = !!generating;
  gradeRef.current = grade;
  flavorRef.current = flavor;
  baseStyleRef.current = baseStyle;
  introFlyRef.current = !!introFly;
  // The active overlay palette (pro-style-derived or legacy) the rAF loop reads.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // Whether 3D terrain is active (pro-style terrain OR the legacy terrain3d tap).
  const want3dRef = useRef(false);
  want3dRef.current = proStyle ? !!(proStyle.basemap as any).terrain : baseStyle === "terrain3d";
  // Remembers original paints across style switches for applyBasemapIdentity.
  const stashRef = useRef<PaintStash>({ styleKey: "", base: {} });

  /* STYLE IDENTITY — recolor land / water / borders + draw the graticule, using
     the SAME applyBasemapIdentity() the editor's render path uses. When a pro
     style is active this makes the preview basemap identical to the output.
     Runs on every styledata (idempotent) so it survives MapLibre's incremental
     style loads. Falls back to the legacy dark-editorial recolor otherwise. */
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m) return;
    const apply = () => {
      try {
        if (proStyle) {
          applyBasemapIdentity(m, proStyle.basemap as any, stashRef.current);
        } else if (baseStyle === "dark-editorial") {
          for (const l of m.getStyle()?.layers ?? []) {
            if (l.type !== "line") continue;
            if (/bound|admin/i.test(l.id)) { m.setPaintProperty(l.id, "line-color", "#FF3B4D"); m.setPaintProperty(l.id, "line-opacity", 0.85); }
            else if (/road|street|highway|motorway|primary|secondary|tertiary|trunk|minor|rail|transport|bridge|tunnel|path/i.test(l.id)) m.setPaintProperty(l.id, "line-color", "#8A93A6");
          }
        }
      } catch { /* style mid-swap — next styledata reapplies */ }
    };
    apply();
    m.on("styledata", apply);
    return () => { try { m.off("styledata", apply); } catch {} };
  }, [baseStyle, proStyle]);

  /* TERRAIN GUARD — 3D must survive style swaps. The terrain in the style JSON
     is applied only on a clean full load; react-map-gl style diffing and rapid
     tap-tap style switches can drop it (map goes flat = "stuck" 3D chip), and
     leaving 3D mid-swap can leave stale terrain on a flat style (camera under
     the surface). This effect is the single source of truth: it re-asserts the
     DEM + terrain on every styledata while 3D is active, and force-clears
     terrain the moment any other style takes over. */
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m) return;
    // A pro style with basemap.terrain lifts the 3D relief just like the editor.
    const want3d = proStyle ? !!(proStyle.basemap as any).terrain : baseStyle === "terrain3d";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const ensure = () => {
      try {
        if (want3d) {
          if (!m.getSource("dem")) {
            m.addSource("dem", {
              type: "raster-dem",
              tiles: [`${origin}/api/dem/{z}/{x}/{y}`],
              encoding: "terrarium", tileSize: 256, maxzoom: 15,
            });
          }
          if (!m.getTerrain?.()) m.setTerrain({ source: "dem", exaggeration: 1.2 });
        } else if (m.getTerrain?.()) {
          m.setTerrain(null);
        }
      } catch { /* style mid-swap — the next styledata re-runs this */ }
    };
    ensure();
    m.on("styledata", ensure);
    return () => { try { m.off("styledata", ensure); } catch {} };
  }, [baseStyle, proStyle]);

  /* Tap-to-restyle: regrade the satellite raster live (no style reload).
     The change must be UNMISTAKABLE — hue rotation + saturation + contrast
     together produce a real duotone shift, not a subtle wash. */
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m || !loadedRef.current) return;
    try {
      m.setPaintProperty("sat", "raster-saturation", grade?.saturation ?? -0.45);
      m.setPaintProperty("sat", "raster-brightness-max", grade?.brightness ?? 0.6);
      m.setPaintProperty("sat", "raster-hue-rotate", grade?.hueRotate ?? 8);
      m.setPaintProperty("sat", "raster-contrast", grade?.contrast ?? 0.22);
    } catch { /* style mid-load — cosmetic */ }
  }, [grade]);

  /* ── Camera choreography: react to stops / hover / generate ──────────────── */
  const camKey = useMemo(
    () => JSON.stringify([stops.map((s) => [s.lon, s.lat]), generating, baseStyle, proStyle?.id]),
    [stops, generating, baseStyle, proStyle],
  );
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m || !loadedRef.current) return;
    const t = setTimeout(() => {
      try {
        // EVERY move sets pitch + bearing EXPLICITLY. fitBounds keeps the
        // current pitch, which left the map stuck tilted after leaving the 3D
        // dive — the "tilt" bug. And in 3D mode the stops framing keeps a
        // pitched cinematic camera instead of flattening the terrain away.
        const want3d = want3dRef.current;
        if (want3d && !stopsRef.current.length) {
          // 3D close-up: dive onto real terrain so the capability is undeniable.
          m.flyTo({ center: [DIVE_3D.lon, DIVE_3D.lat], zoom: DIVE_3D.zoom, pitch: DIVE_3D.pitch, bearing: 40, duration: 3200, essential: true });
        } else if (genRef.current && stopsRef.current.length) {
          // Generation begins: dive toward the opening destination.
          const s = stopsRef.current[0];
          m.flyTo({ center: [s.lon, s.lat], zoom: Math.min(s.z, want3d ? 9.5 : 6.5), pitch: want3d ? 58 : 34, bearing: 0, duration: 2600, essential: true });
        } else if (stopsRef.current.length === 1) {
          const s = stopsRef.current[0];
          m.easeTo({ center: [s.lon, s.lat], zoom: Math.min(s.z, want3d ? 9 : 5.5), pitch: want3d ? 55 : 0, bearing: 0, duration: 1600 });
        } else if (stopsRef.current.length > 1) {
          let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999;
          for (const s of stopsRef.current) {
            minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon);
            minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
          }
          // cameraForBounds + easeTo (instead of fitBounds) so pitch/bearing
          // are OURS on arrival — never inherited from a previous 3D dive.
          const cam = m.cameraForBounds(
            [[minLon, minLat], [maxLon, maxLat]],
            { padding: { top: 110, bottom: 230, left: 90, right: 90 }, maxZoom: 5.2 },
          );
          if (cam) m.easeTo({ center: cam.center, zoom: Math.min(cam.zoom ?? 5.2, 5.2), pitch: want3d ? 45 : 0, bearing: 0, duration: 1700 });
        } else {
          // Back to the drifting world view — unless the arrival flight is
          // mid-glide (it lands on exactly this view by itself).
          if (!introActiveRef.current) m.easeTo({ center: [12, 26], zoom: 1.65, pitch: 0, bearing: 0, duration: 1800 });
        }
      } catch { /* map mid-teardown */ }
    }, 420); // settle briefly so keystrokes don't thrash the camera
    return () => clearTimeout(t);
  }, [camKey]);

  /* ── Mouse parallax (desktop only) ────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(hover:hover)").matches) return;
    const fn = (e: MouseEvent) => {
      mouse.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", fn, { passive: true });
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  /* ── The one rAF loop: idle drift + canvas overlay + parallax ─────────────── */
  useEffect(() => {
    let raf = 0;
    // Idle world-tour state (local to this rAF loop; see WORLD_TOUR).
    let tourIdx = -1;        // which hero we're on (−1 = tour not started)
    let tourFlying = false;  // true while a flyTo glide owns the camera
    let phaseUntil = 0;      // ts (ms) at which the current phase ends
    let dwellBearing = 0;    // bearing carried through the gentle dwell orbit
    let wasIdle = false;     // detect the moment we return to the idle state
    let driftLon = 12;       // reduced-motion fallback drift longitude
    const reduce = typeof window !== "undefined"
      && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (typeof document !== "undefined" && document.hidden) return;
      const t = ts / 1000;
      const m = mapRef.current?.getMap() as any;
      const cv = canvasRef.current;
      if (!m || !cv || !loadedRef.current) return;

      // Idle motion — only when nothing is recognised and not generating.
      const idle = !stopsRef.current.length && !hoverRef.current?.length
        && !genRef.current && !introActiveRef.current;
      if (idle) {
        if (want3dRef.current) {
          // 3D terrain tap: a slow orbit around the peak.
          if (!m.isMoving()) { try { m.setBearing((m.getBearing() + 0.045) % 360); } catch {} }
        } else if (reduce) {
          // Reduced motion: a barely-there world drift, no flying tour.
          if (!m.isMoving()) {
            try {
              const curLng = m.getCenter().lng;
              if (Math.abs(curLng - driftLon) > 1.5) driftLon = curLng;
              driftLon = ((driftLon + 0.004 + 180) % 360) - 180;
              m.jumpTo({ center: [driftLon, 24], zoom: 1.72, pitch: 0, bearing: 0 });
            } catch {}
          }
        } else {
          // CINEMATIC WORLD TOUR — glide between the most beautiful terrain on
          // Earth with the editor's own eased camera language (flyTo's parabolic
          // swoop), holding each landscape with a gentle orbiting "breath".
          try {
            // Returning to idle (after a story / hover cleared): restart cleanly
            // from wherever the camera is, so we glide — never snap — onward.
            if (!wasIdle) { tourFlying = false; phaseUntil = 0; }
            if (ts >= phaseUntil && !m.isMoving()) {
              if (tourFlying) {
                // just landed → begin the dwell
                tourFlying = false;
                dwellBearing = WORLD_TOUR[tourIdx].b;
                phaseUntil = ts + TOUR_DWELL_MS;
              } else {
                // start, or dwell finished → glide to the next landscape
                tourIdx = (tourIdx + 1) % WORLD_TOUR.length;
                const h = WORLD_TOUR[tourIdx];
                m.flyTo({ center: h.c, zoom: h.z, pitch: h.p, bearing: h.b, duration: TOUR_FLY_MS, curve: 1.5, essential: true });
                tourFlying = true;
                phaseUntil = ts + TOUR_FLY_MS;
              }
            } else if (!tourFlying && tourIdx >= 0 && !m.isMoving()) {
              // Dwell "breath": a slow orbit + micro zoom pulse so the held shot
              // stays alive (never frozen), mirroring the editor's easing.
              const h = WORLD_TOUR[tourIdx];
              dwellBearing += 0.02;
              m.jumpTo({ center: h.c, zoom: h.z + Math.sin(t * 0.5) * 0.015, pitch: h.p, bearing: dwellBearing });
            }
          } catch {}
        }
      }
      wasIdle = idle;

      // Parallax — the whole stage leans gently toward the cursor. The canvas
      // overlay lives ABOVE the readability washes (so pins/fills/lanes stay
      // vivid) and mirrors the exact same transform to stay glued to the map.
      par.current.x += ((mouse.current.x - 0.5) * 18 - par.current.x) * 0.04;
      par.current.y += ((mouse.current.y - 0.5) * 12 - par.current.y) * 0.04;
      const stage = `scale(1.07) translate(${(-par.current.x).toFixed(2)}px, ${(-par.current.y).toFixed(2)}px)`;
      if (wrapRef.current) wrapRef.current.style.transform = stage;
      if (canvasWrapRef.current) canvasWrapRef.current.style.transform = stage;

      // ── Canvas overlay ──
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const proj = (lon: number, lat: number): [number, number] | null => {
        try { const p = m.project([lon, lat]); return [p.x, p.y]; } catch { return null; }
      };
      const onScreen = (p: [number, number] | null): p is [number, number] =>
        !!p && p[0] > -220 && p[0] < W + 220 && p[1] > -220 && p[1] < H + 220;

      /** A lifted quadratic arc (control point = midpoint raised screen-up),
       *  with an optional glowing traveller dot at parametric position headT. */
      const drawArc = (
        a: [number, number], b: [number, number],
        color: string, width: number, alpha: number, headT: number | null, glow = true,
      ) => {
        const mx = (a[0] + b[0]) / 2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const lift = Math.min(160, len * 0.24);
        const cy = (a[1] + b[1]) / 2 - lift;
        const stroke = () => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, cy, b[0], b[1]); ctx.stroke(); };
        ctx.lineCap = "round";
        // Editor parity: a WIDE, blurred glow layer under the crisp core line
        // (RouteView draws a `line-blur` glow beneath the route). Reads premium.
        if (glow) {
          ctx.strokeStyle = color; ctx.lineWidth = width * 3.4; ctx.globalAlpha = alpha * 0.2;
          ctx.shadowColor = color; ctx.shadowBlur = 16; stroke(); ctx.shadowBlur = 0;
        }
        // crisp core
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; stroke();
        if (headT != null) {
          const u = 1 - headT, q = headT;
          const hx = u * u * a[0] + 2 * u * q * mx + q * q * b[0];
          const hy = u * u * a[1] + 2 * u * q * cy + q * q * b[1];
          // A ringed traveller head — a white core inside a coloured ring, the
          // same marker language as the editor's route endpoints (circle + stroke).
          ctx.globalAlpha = alpha;
          ctx.shadowColor = color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(hx, hy, width * 1.5 + 2.6, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(hx, hy, width * 0.9 + 1, 0, Math.PI * 2);
          ctx.fillStyle = "#fff"; ctx.fill();
        }
        ctx.globalAlpha = 1;
      };

      const busy = !!(stopsRef.current.length || hoverRef.current?.length);
      // EVERY overlay element re-themes with the active base style (arcs, hubs,
      // pins, chips, highlights, sea lanes) — a legacy grade's accents still win.
      const th = themeRef.current;
      const [AC1, AC2, AC3] = gradeRef.current?.accents ?? th.accents;

      // 1 · Ambient airline network — dimmed while a real story is on stage.
      const ambAlpha = busy ? 0.10 : 0.30;
      const colors = [AC1, AC2, AC3];
      AMBIENT.forEach(([fi, ti, dur, phase], i) => {
        const p = ((t + phase) % dur) / dur;
        const a = proj(HUBS[fi][0], HUBS[fi][1]);
        const b = proj(HUBS[ti][0], HUBS[ti][1]);
        if (!onScreen(a) || !onScreen(b)) return;
        const grow = eio(clamp(p / 0.55, 0, 1));
        const fade = 1 - eio(clamp((p - 0.72) / 0.28, 0, 1));
        drawArc(a, b, colors[i % 3], 1.6, ambAlpha * fade, p < 0.72 ? grow : null, false);
      });
      // Twinkling hub dots.
      HUBS.forEach(([lon, lat], i) => {
        const p = proj(lon, lat);
        if (!onScreen(p)) return;
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 2.1));
        ctx.globalAlpha = (busy ? 0.18 : 0.5) * tw;
        ctx.fillStyle = i % 3 ? AC1 : AC2;
        ctx.beginPath(); ctx.arc(p![0], p![1], 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });

      // 2 · Hover preview (inspiration cards) — warm amber sketch.
      const hs = hoverRef.current;
      if (hs?.length) {
        for (let i = 0; i < hs.length - 1; i++) {
          const a = proj(hs[i].lon, hs[i].lat), b = proj(hs[i + 1].lon, hs[i + 1].lat);
          if (onScreen(a) && onScreen(b)) {
            const shimmer = ((t * 0.55 + i * 0.21) % 1);
            drawArc(a, b, AMBER, 2.2, 0.85, shimmer);
          }
        }
        hs.forEach((s) => {
          const p = proj(s.lon, s.lat);
          if (!onScreen(p)) return;
          ctx.fillStyle = AMBER; ctx.shadowColor = AMBER; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(p![0], p![1], 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        });
      }

      // 3 · The user's recognised story — bright, alive, undeniable. The
      //     FLAVOR decides the sketch: route arcs, glowing territory
      //     highlights, or a heat scatter — matching what they described.
      const ss = stopsRef.current;
      const flav = flavorRef.current ?? "route";
      if (ss.length) {
        const now = performance.now();
        if (flav === "route") {
          // Clean, premium route arcs with a glowing ringed traveller head — the
          // editor's route element (glow + crisp line + circle marker), not an
          // emoji. The stop pins (drawn below) mark each waypoint.
          for (let i = 0; i < ss.length - 1; i++) {
            const a = proj(ss[i].lon, ss[i].lat), b = proj(ss[i + 1].lon, ss[i + 1].lat);
            if (onScreen(a) && onScreen(b)) drawArc(a, b, AC1, 3, 0.95, (t * 0.45 + i * 0.33) % 1);
          }
        }
        if (flav === "highlight") {
          // REAL territory highlight — exactly what the editor's highlight layer
          // does: fill the actual country polygon + glowing border. Falls back
          // to the radial bloom only for places without a demo outline.
          ss.forEach((s, i) => {
            const rings = outlineFor(s.label);
            if (rings) {
              const breathe = 0.8 + 0.2 * Math.sin(t * 1.4 + i * 1.1);
              for (const ring of rings) {
                ctx.beginPath();
                let started = false;
                for (const [lon, lat] of ring) {
                  const q = proj(lon, lat);
                  if (!q) { started = false; continue; }
                  if (!started) { ctx.moveTo(q[0], q[1]); started = true; }
                  else ctx.lineTo(q[0], q[1]);
                }
                ctx.closePath();
                // Editor-grade highlight: confident fill, glowing border that breathes.
                ctx.fillStyle = `${AC1}55`;
                ctx.fill();
                ctx.strokeStyle = AC1; ctx.lineWidth = 2.5;
                ctx.shadowColor = AC1; ctx.shadowBlur = 18;
                ctx.globalAlpha = breathe;
                ctx.stroke();
                ctx.stroke(); // double-stroke = hot core inside the glow
                ctx.shadowBlur = 0; ctx.globalAlpha = 1;
              }
              return;
            }
            const p = proj(s.lon, s.lat);
            if (!onScreen(p)) return;
            const [x, y] = p!;
            const r = 62 + 7 * Math.sin(t * 1.6 + i * 1.1);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `${AC1}3d`); g.addColorStop(0.7, `${AC1}22`); g.addColorStop(1, `${AC1}00`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = AC1; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.85;
            ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 14;
            ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
          });
        }
        if (flav === "sea") {
          // A boat journey stays IN THE WATER: draw the curated sea lane as a
          // map-projected polyline (it hugs the coastlines because the
          // waypoints do), with an animated draw + a sailing traveller.
          const lane = seaLaneFor(ss);
          if (lane) {
            const pts = lane.map(([lon, lat]) => proj(lon, lat)).filter(Boolean) as [number, number][];
            if (pts.length > 1) {
              // cumulative screen lengths for the draw progress + traveller
              const seg: number[] = [0];
              for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
              const total = seg[seg.length - 1] || 1;
              const cycle = (t * 0.14) % 1.25;               // draw, hold, restart
              const progress = Math.min(1, cycle);
              const target = total * progress;
              ctx.lineCap = "round"; ctx.lineJoin = "round";
              for (const [w, alpha, blur] of [[9, 0.16, 18], [4.5, 0.5, 8], [2, 0.95, 0]] as const) {
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) {
                  if (seg[i] <= target) { ctx.lineTo(pts[i][0], pts[i][1]); continue; }
                  const f = (target - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
                  ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
                  break;
                }
                ctx.strokeStyle = th.sea; ctx.lineWidth = w; ctx.globalAlpha = alpha;
                ctx.shadowColor = th.sea; ctx.shadowBlur = blur;
                ctx.stroke();
                ctx.shadowBlur = 0;
              }
              // the boat at the head of the drawn lane
              let bx = pts[0][0], by = pts[0][1];
              for (let i = 1; i < pts.length; i++) {
                if (seg[i] <= target) { bx = pts[i][0]; by = pts[i][1]; continue; }
                const f = (target - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
                bx = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
                by = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
                break;
              }
              // A glowing ringed marker at the head of the drawn lane (matches
              // the route markers — clean, premium, no emoji).
              ctx.globalAlpha = 1;
              ctx.shadowColor = th.sea; ctx.shadowBlur = 12;
              ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fillStyle = th.sea; ctx.fill(); ctx.shadowBlur = 0;
              ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
            }
          } else {
            // No curated lane between these stops — fall back to route arcs.
            for (let i = 0; i < ss.length - 1; i++) {
              const a = proj(ss[i].lon, ss[i].lat), b = proj(ss[i + 1].lon, ss[i + 1].lat);
              if (onScreen(a) && onScreen(b)) drawArc(a, b, th.sea, 2.6, 0.95, (t * 0.45 + i * 0.33) % 1);
            }
          }
        }
        if (flav === "heat") {
          // Event-density scatter: seeded warm dots clustered on each place.
          ss.forEach((s, i) => {
            const p = proj(s.lon, s.lat);
            if (!onScreen(p)) return;
            const [x, y] = p!;
            for (let k = 0; k < 26; k++) {
              const seed = i * 97 + k;
              const h = (n: number) => { const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
              const ang = h(1) * Math.PI * 2;
              const dist = Math.pow(h(2), 0.6) * 58;
              const flick = 0.55 + 0.45 * Math.sin(t * 2.4 + seed);
              ctx.globalAlpha = (0.16 + 0.5 * (1 - dist / 58)) * flick;
              ctx.fillStyle = h(3) > 0.45 ? "#ff5a44" : "#ffb020";
              ctx.shadowColor = "#ff5a44"; ctx.shadowBlur = 8;
              ctx.beginPath(); ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 1.6 + h(4) * 2.6, 0, Math.PI * 2); ctx.fill();
              ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1;
          });
        }
        ss.forEach((s, i) => {
          const p = proj(s.lon, s.lat);
          if (!onScreen(p)) return;
          const key = `${s.label}:${s.lon.toFixed(2)}`;
          if (!bornRef.current.has(key)) bornRef.current.set(key, now);
          const age = (now - bornRef.current.get(key)!) / 1000;
          const pop = eio(clamp(age / 0.5, 0, 1));
          const [x, y] = p!;
          // breathing outer ring
          const ring = 9 + 4 * Math.sin(t * 2.2 + i * 1.4);
          ctx.globalAlpha = 0.5 * pop;
          ctx.strokeStyle = AC2; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(x, y, ring * pop, 0, Math.PI * 2); ctx.stroke();
          // core pin — themed so it stays visible on light basemaps too
          ctx.globalAlpha = pop;
          ctx.fillStyle = th.pinCore; ctx.shadowColor = AC1; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(x, y, 4 * pop, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          // label — the editor's editorial language: UPPERCASE, letter-spaced,
          // on a themed chip with a thin leader line up from the pin.
          if (pop > 0.6 && s.label) {
            const label = s.label.toUpperCase();
            const hadLS = "letterSpacing" in ctx;
            if (hadLS) (ctx as any).letterSpacing = "1.3px";
            ctx.font = "700 10.5px Inter, sans-serif";
            const w = ctx.measureText(label).width;
            const chipY = y - 34;
            // leader line pin → chip
            ctx.globalAlpha = 0.4 * pop; ctx.strokeStyle = th.accents[0]; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, chipY + 20); ctx.stroke();
            // chip
            ctx.globalAlpha = 0.9 * pop;
            ctx.fillStyle = th.chipBg;
            const bx = x - w / 2 - 9;
            ctx.beginPath();
            (ctx as any).roundRect ? (ctx as any).roundRect(bx, chipY, w + 18, 20, 7) : ctx.rect(bx, chipY, w + 18, 20);
            ctx.fill();
            ctx.globalAlpha = pop;
            ctx.fillStyle = th.chipText;
            ctx.fillText(label, x - w / 2, chipY + 14);
            if (hadLS) (ctx as any).letterSpacing = "0px";
          }
          ctx.globalAlpha = 1;
        });
        // prune bloom memory for stops that left
        if (bornRef.current.size > 24) {
          const live = new Set(ss.map((s) => `${s.label}:${s.lon.toFixed(2)}`));
          for (const k of bornRef.current.keys()) if (!live.has(k)) bornRef.current.delete(k);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Map + parallax wrapper (slightly oversized so edges never show) */}
      <div ref={wrapRef} className="absolute inset-0 will-change-transform" style={{ transform: "scale(1.07)" }}>
        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: 12, latitude: 26, zoom: 1.65 }}
          mapStyle={mapStyle as any}
          interactive={false}
          attributionControl={false}
          maxPitch={85} // maplibre-gl 4.x hard limit — >85 THROWS and kills the map (90° needs the v5 upgrade)
          minZoom={minZoom}
          onLoad={(e) => {
            loadedRef.current = true;
            const m = e.target as any;
            try { m.setMaxParallelImageRequests?.(48); } catch {}
            // Debug handle for headless verification (harmless in prod).
            try { (window as any).__liveMap = m; } catch {}
            // ARRIVAL flight: tilted 3D close-up over the Alps → glide down to
            // the drifting world view while the page reveals around the map.
            if (introFlyRef.current && !introActiveRef.current) {
              introActiveRef.current = true;
              try { m.jumpTo({ center: [8.2, 46.4], zoom: 4.6, pitch: 55, bearing: -24 }); } catch {}
              setTimeout(() => {
                try { m.easeTo({ center: [12, 26], zoom: 1.65, pitch: 0, bearing: 0, duration: 3400, essential: true }); } catch {}
              }, 500);
              setTimeout(() => { introActiveRef.current = false; }, 4200);
            }
          }}
          onError={(e: any) => {
            // Transient tile fetch failures (Wi-Fi switch / sleep resume / dev
            // reload → "Failed to fetch", ERR_NETWORK_CHANGED) are self-healing:
            // MapLibre re-requests on the next camera move. Without this handler
            // react-map-gl dumps every one to console.error.
            const msg = String(e?.error?.message ?? e?.message ?? "");
            if (/failed to fetch|networkerror|network changed|abort|load failed/i.test(msg)) return;
            console.warn("[live-map]", msg);
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>

      {/* Cinematic grade — readability wash scaled per base style so the light
          and streets styles actually LOOK light instead of being crushed dark. */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ background: "rgba(6,9,22,0.38)", opacity: theme.wash }} />
      {/* Style-card tint — the tap-to-preview wash. Two passes so the change
          is unmistakable: a colour layer (the duotone body) + a soft-light
          punch. tintStrength drives both. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: grade ? (grade.tintStrength ?? 0.5) : 0,
          background: grade ? grade.tint : "transparent",
          mixBlendMode: "color" as any,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: grade ? 1 : 0,
          background: grade ? `linear-gradient(180deg, ${grade.tint}55 0%, transparent 40%, ${grade.tint}44 100%)` : "transparent",
          mixBlendMode: "soft-light" as any,
        }}
      />
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ background: "radial-gradient(75% 55% at 50% 0%, rgba(110,123,255,0.10), transparent 62%)", opacity: theme.wash }} />
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ background: "linear-gradient(to bottom, rgba(4,6,16,0.62) 0%, transparent 28%, transparent 58%, rgba(4,6,16,0.82) 100%)", opacity: Math.max(0.55, theme.wash) }} />
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ background: "radial-gradient(120% 90% at 50% 46%, transparent 40%, rgba(4,6,16,0.5) 100%)", opacity: theme.wash }} />

      {/* Overlay canvas ABOVE the washes — story elements (pins, fills, lanes,
          arcs) stay vivid; only the basemap gets the readability treatment.
          Mirrors the map wrapper's parallax transform each frame. */}
      <div ref={canvasWrapRef} className="pointer-events-none absolute inset-0 will-change-transform" style={{ transform: "scale(1.07)" }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
};
