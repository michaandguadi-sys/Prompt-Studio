"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender, getRemotionEnvironment, Img, Audio,
} from "remotion";
import Map, { MapRef, Source, Layer as MapLayer } from "react-map-gl/maplibre";
import { LngLat } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { resolveMapStyle, demSource, ML_TERRAIN_SOURCE_ID, isDarkStyle, NOIR, isGridStyle, GRID, graticule } from "@/lib/maplibre";
import { safeInterpolate, easings, catmullRomChain, linearChain } from "@/lib/interp";
import { centroidOf } from "@/lib/geo";
import { makePatternImageData, patternImageId } from "@/lib/mapPatterns";
import { cleanCountryGeo } from "@/lib/geoClean";
import { evalTiming, timingTransform } from "./timing";
import type {
  Composition, CameraPose, Layer, CameraLayer, HighlightLayer, LabelLayer,
  FlagLayer, TitleLayer, ChartLayer, ImageLayer, RouteLayer, MarkerLayer,
  AnnotationLayer, ConnectionsLayer, SpotlightLayer, TrackLayer, ChoroplethLayer, BubbleLayer, FlowLayer, HeatmapLayer, Look,
} from "../doc/schema";
import { fontStack, WEBFONTS_CSS_URL } from "../doc/themes";

/** Photoreal 3D (Google Earth) overlay — lazy so deck.gl/loaders.gl never load
 *  in the headless render path; only fetched in the browser preview when used. */
const LazyGoogle3D = React.lazy(() => import("./GooglePhotoreal3D"));
/** Read the BYO Google Maps key (browser-only) without importing the settings UI. */
function readGoogleKey(): string {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(localStorage.getItem("mapanisy-google") || "null")?.apiKey || ""; } catch { return ""; }
}

import {
  DEFAULT_THEME, ThemeCtx, updateLiveState, poseAt, highlightPose,
  followRoutePose, trackPose,
  sanitizePose, routeTravel, flagIsoOf, clampN,
  HighlightSource, HighlightLabel,
  RouteView, RouteSource, RouteEndpoints, RouteIconView, DistanceLabel,
  TrackView, TrackSource, TrackOverlay,
  HeatmapSource, HeatmapLegend,
  ChoroplethSource, ChoroplethLegend,
  FlowSource, FlowLegend,
  LabelView, FlagView, MarkerView,
  AnnotationView, BubbleView, ConnectionsView, SpotlightView,
  TitleView, ChartView, ImageView,
  RadiusView, TimestampView, AtmosphereView,
} from "./layers";


/** The layer types that can drive the camera, in the order they appear in the
 *  stack. The TOP-MOST (lowest index) enabled one is the "director". */
/**
 * Which layer drives the CAMERA — decoupled from z-order so you can stack a
 * highlight on top (or underneath) without it hijacking the framing:
 *   1. A route/highlight explicitly set to "frame the camera" wins (top-most).
 *   2. Otherwise the CAMERA layer is the authority (the intuitive default).
 *   3. With no camera layer, the top-most route/highlight auto-frames.
 */
export function findDirector(layers: Layer[]): Layer | undefined {
  const on = layers.filter((l) => l.enabled);
  // ONLY the Camera layer drives the camera (routes/highlights never hijack the
  // framing — they just render). A GPS track is the exception: the imported track
  // IS the flight path, so it drives when there's no explicit camera.
  const cam = on.find((l) => l.type === "camera");
  if (cam) return cam;
  const track = on.find((l) => l.type === "track" && (l as TrackLayer).points.length > 1);
  if (track) return track;
  return undefined;
}

/* ── The composition ──────────────────────────────────────────────────────── */

export const MapComposition: React.FC<{ comp: Composition; watermark?: boolean; googleApiKey?: string; capturing?: boolean }> = ({ comp, watermark, googleApiKey, capturing }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(1, Math.round(comp.durationSec * fps));
  // OpenHistoricalMap display year for THIS frame: animates mapYear → mapYearEnd
  // across the scene when an end year is set (history unfolds), else the static
  // start year. Rounded so the date filter only re-applies on a real year tick.
  const ohmYear = useMemo(() => {
    const a = parseFloat(String(comp.basemap.mapYear ?? "").trim());
    if (!isFinite(a)) return null;
    const b = parseFloat(String(comp.basemap.mapYearEnd ?? "").trim());
    if (!isFinite(b) || b === a) return Math.round(a);
    const t = totalFrames > 1 ? Math.min(1, Math.max(0, frame / (totalFrames - 1))) : 0;
    return Math.round(a + (b - a) * t);
  }, [comp.basemap.mapYear, comp.basemap.mapYearEnd, frame, totalFrames]);
  const mapRef = useRef<MapRef>(null);
  // The map instance attaches to the ref AFTER the first commit, so on the very
  // first render `project()` has no map and every overlay falls back to {0,0}
  // (piling them in the top-left). Flipping this from the map's own onLoad/onIdle
  // (the only reliable "instance exists" signal) forces a re-render so overlays
  // project correctly — fixes frame-0 of exports and single-pass still/thumbnail
  // renders (which otherwise never re-render once the map is ready).
  const [, setMapReady] = useState(false);
  // Remembers each OHM layer's pristine filter (keyed by style+layer) so the
  // historical date filter can be re-applied for a new year without stacking.
  // (Plain object — `Map` here is the react-map-gl component, not JS Map.)
  const ohmBase = useRef<Record<string, unknown>>({});
  // Cached OHM layer ids + base filters (built ONCE per style) so the year tick
  // doesn't re-serialise the whole 250-layer style every frame — keeps the
  // historical timelapse smooth in both the live preview and the render.
  const ohmLayersRef = useRef<{ key: string; list: { id: string; base: any; thematic: boolean }[] } | null>(null);
  // Original paint values stashed before land/water recolour (for restore).
  const paintBase = useRef<Record<string, unknown>>({});
  // Tracks the style the stashes belong to — cleared when the basemap changes.
  const paintStyleKey = useRef<string>("");

  const camera = comp.layers.find((l): l is CameraLayer => l.type === "camera");
  // The TOP-MOST of camera / route / highlight is the "director" that drives the
  // camera motion. Whatever it is, the OTHER layers still render (a route still
  // draws, a highlight still highlights) — only the movement owner changes.
  const director = findDirector(comp.layers);
  const moveEnd = Math.max(1, Math.round((camera?.moveFraction ?? 0.85) * totalFrames));
  const ease = easings[(camera?.easing ?? "easeInOut") as keyof typeof easings] ?? easings.easeInOut;
  const rawP = safeInterpolate(frame, [0, moveEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Multi-stop journeys are paced by the documentary scheduler (per-leg easing,
  // dwells at stops) — feed it LINEAR progress, or the global ease would make
  // the first leg crawl and the middle legs sprint. Single start→end shots keep
  // the scene-level easing curve as their tween.
  const multiStop = (camera?.waypoints?.length ?? 0) >= 1;
  const p = multiStop ? rawP : ease(rawP);
  let pose: CameraPose;
  if (director?.type === "route") {
    // Lock the camera to the route's OWN travel progress (not the camera ease),
    // so the framing, the drawn line head, and the vehicle move as one.
    const travel = routeTravel(director, frame, fps, totalFrames);
    pose = followRoutePose(director, travel, camera);
  } else if (director?.type === "track") {
    pose = trackPose(director, frame, fps, totalFrames);
  } else if (director?.type === "highlight") {
    pose = director.geojson ? highlightPose(director.geojson, p, camera) : (camera ? poseAt(camera, p) : { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 });
  } else {
    pose = camera ? poseAt(camera, p) : { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 };
  }
  // HARD-sanitise the pose: Catmull-Rom paths can overshoot and an unresolved
  // route/highlight can yield NaN/Infinity — either of which makes Mapbox throw
  // "failed to invert matrix" and crash the preview. Clamp everything to a valid
  // camera envelope so the map can never receive a singular transform.
  pose = sanitizePose(pose);
  updateLiveState(pose.zoom, frame, totalFrames);

  // Force the live Mapbox transform to EXACTLY this frame's pose *before* any
  // overlay projects lon/lat → screen. Without this, react-map-gl applies the
  // camera a beat later, so projected overlays (esp. the flag-fill clip) lag a
  // frame behind the map during the zoom/pitch and "swim" off the borders.
  {
    const liveMap = mapRef.current?.getMap();
    if (liveMap) {
      try { liveMap.jumpTo({ center: [pose.lon, pose.lat], zoom: pose.zoom, pitch: pose.pitch, bearing: pose.bearing }); } catch {}
    }
  }

  // ── Frame-accurate tile gate ──
  // ONLY gate during the headless render (where we must wait for map tiles before
  // each frame is captured). In the interactive <Player> a delayRender handle
  // interferes with looping/seeking — it's what made the preview break after one
  // replay and need a reload. In the Player we just let the map play live.
  const isRendering = getRemotionEnvironment().isRendering;
  const [tilesHandle] = useState<number | null>(() =>
    isRendering ? delayRender("v2 map tiles", { timeoutInMilliseconds: 90000 }) : null);
  const released = useRef(false);

  // Photoreal 3D (Google Earth) — preview-only, gated on a BYO Google Maps key.
  // Key from Settings (browser) OR, in the headless render, from a render prop
  // (passed in the render request — never written to a file or the project JSON).
  const googleKey = useMemo(() => readGoogleKey() || (googleApiKey ?? ""), [googleApiKey]);
  // Photoreal renders in the editor preview, AND in the headless export WHEN a key
  // was supplied to the render (otherwise export falls back to 3-D satellite).
  const photoreal3d = !!(comp.basemap as any).photoreal3d && !!googleKey && (!isRendering || !!googleApiKey);
  const [googleCredit, setGoogleCredit] = useState("");
  // EXPORT FALLBACK: the headless render can't stream Google's 3D tiles frame-by-
  // frame, so a photoreal scene EXPORTS as a rich satellite + 3D-terrain +
  // 3D-buildings world (the closest faithful 3D look) instead of a flat map.
  const photorealExportFallback = !!(comp.basemap as any).photoreal3d && isRendering && !googleApiKey;
  const effStyleUrl = photorealExportFallback ? "mapbox://styles/mapbox/satellite-streets-v12" : comp.basemap.styleUrl;
  // Stable per-style reference — recomputing inline styles every render made
  // react-map-gl thrash / miss the change (the "switch doesn't show until you
  // toggle" bug). Now the style object changes ONLY when the chosen style does.
  // Pass window.location.origin so the satellite proxy URL is always absolute —
  // the headless Chromium in the render agent needs a full URL, not a relative one.
  const mapOrigin = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? "");
  const mapStyleResolved = React.useMemo(() => resolveMapStyle(effStyleUrl, mapOrigin), [effStyleUrl, mapOrigin]);
  const release = useCallback(() => {
    if (released.current || tilesHandle === null) return;
    released.current = true;
    continueRender(tilesHandle);
  }, [tilesHandle]);
  React.useEffect(() => {
    if (tilesHandle === null) return;
    // Heavy tile sources need more time before the safety release fires so frames
    // aren't captured half-painted: OHM is an external slow CDN, satellite is a
    // high-res raster source that can fire 50+ requests per frame transition.
    const sat = /satellite/i.test(comp.basemap.styleUrl ?? "");
    const slow = /ohm|openhistorical/i.test(comp.basemap.styleUrl ?? "");
    const t = setTimeout(release, slow ? 12000 : sat ? 9000 : 3500);
    return () => clearTimeout(t);
  }, [release, tilesHandle, comp.basemap.styleUrl]);

  // ── PER-FRAME render gate (the real anti-flicker fix) ──
  // The once-only handle above only made FRAME 0 wait. Every later frame moves the
  // camera, which loads NEW tiles asynchronously — so frames were being captured
  // mid-load (blank/half-painted tiles + label pop = the artifacts/flicker). Here
  // we block EACH render frame until the map reports it's fully settled (all tiles
  // for this pose loaded, style applied), then two RAFs so the freshly-loaded tiles
  // are actually painted into the preserved buffer before the screenshot. The live
  // <Player> preview is never gated (it must seek/loop freely).
  React.useEffect(() => {
    if (!isRendering) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const handle = delayRender(`frame ${frame} settled`, { timeoutInMilliseconds: 30000 });
    let done = false;
    let raf1 = 0, raf2 = 0, poll: ReturnType<typeof setTimeout> | null = null;
    const finish = () => { if (done) return; done = true; try { continueRender(handle); } catch {} };
    const settle = () => {
      if (done) return;
      const ready = (map.areTilesLoaded?.() ?? true) && (map.isStyleLoaded?.() ?? true);
      if (ready) { raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(finish); }); }
      else { poll = setTimeout(settle, 40); }
    };
    // Two RAFs before polling: first lets jumpTo take effect and MapLibre queue
    // new tile requests; second confirms those requests are registered so
    // areTilesLoaded() returns false (not a stale true from the prior position).
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(settle); });
    const safety = setTimeout(finish, 28000); // never hang the whole render
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); if (poll) clearTimeout(poll); clearTimeout(safety); finish(); };
  }, [isRendering, frame, pose.lon, pose.lat, pose.zoom, pose.pitch, pose.bearing, ohmYear]);

  // ── Webfonts (Bebas Neue, Montserrat, …) ──
  // Inject the Google-Fonts stylesheet once, in BOTH the player preview and the
  // headless render, then gate the render on document.fonts.ready so titles
  // export in the chosen typeface instead of falling back to a system font.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.getElementById("ps-webfonts")) {
      const link = document.createElement("link");
      link.id = "ps-webfonts"; link.rel = "stylesheet"; link.href = WEBFONTS_CSS_URL;
      document.head.appendChild(link);
    }
  }, []);
  const [fontHandle] = useState<number | null>(() =>
    isRendering ? delayRender("webfonts", { timeoutInMilliseconds: 20000 }) : null);
  React.useEffect(() => {
    if (fontHandle === null) return;
    let done = false;
    const fin = () => { if (!done) { done = true; continueRender(fontHandle); } };
    (document as any).fonts?.ready?.then(fin).catch(fin);
    const t = setTimeout(fin, 8000); // safety net if fonts.ready never resolves
    return () => clearTimeout(t);
  }, [fontHandle]);

  // ── Register fill textures: canvas patterns + country flags ──
  const patternSig = comp.layers
    .filter((l): l is HighlightLayer => l.type === "highlight" && l.fillType !== "solid")
    .map((l) => `${l.fillType}:${l.fillColor}:${flagIsoOf(l)}`)
    .join("|");
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const register = () => {
      if (!map.isStyleLoaded?.()) return;
      for (const l of comp.layers) {
        // "flag" fills are drawn as a projected SVG overlay (so they scale with
        // the camera), not a fixed-size fill-pattern — skip them here.
        if (l.type !== "highlight" || l.fillType === "solid" || l.fillType === "flag") continue;
        const idp = patternImageId(l.fillType as any, l.fillColor);
        if (map.hasImage?.(idp)) continue;
        const data = makePatternImageData(l.fillType as any, l.fillColor);
        if (data) { try { map.addImage(idp, data, { pixelRatio: 2 }); } catch {} }
      }
      map.triggerRepaint?.();
    };
    register();
    map.on?.("styledata", register);
    return () => { map.off?.("styledata", register); };
  }, [patternSig, comp.basemap.styleUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Basemap: streets / labels visibility, 3D terrain, 3D buildings ──
  const bm = comp.basemap;
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      if (!map.isStyleLoaded?.()) return;
      try {
        // Label detail — what kind of place names show, for an individual look:
        //   none       → no labels
        //   countries  → countries / continents / oceans only
        //   cities     → countries + major cities (the cinematic default)
        //   all        → everything the style provides (towns, regions, POIs…)
        const detail = ((bm as any).labelDetail ?? (bm.showLabels ? "cities" : "none")) as "none" | "countries" | "cities" | "all";
        const isCountryLabel = (id: string) => /country|continent|ocean|sea|marine/.test(id) && !/road/.test(id);
        const isCityLabel = (id: string) => /city|place_town|capital|settlement|place-/.test(id);
        const isMinorLabel = (id: string) => /state|province|oblast|region|county|district|town|village|hamlet|suburb|neighbou|locality|poi|housenum|roadname|road_name|water_name_lake|watername_lake|mountain|peak|airport|railway/.test(id);
        const showLabel = (id: string) => {
          if (detail === "none") return false;
          if (detail === "all") return true;
          if (detail === "countries") return isCountryLabel(id);
          // "cities" → countries + cities, drop the dense minor layers
          return isCountryLabel(id) || (isCityLabel(id) && !isMinorLabel(id)) || (!isMinorLabel(id));
        };
        const style = map.getStyle();
        for (const layer of style?.layers ?? []) {
          const id = (layer.id || "").toLowerCase();
          const isRoad = /road|street|highway|motorway|path|bridge|tunnel|trunk/.test(id);
          const isLabel = (layer as any).type === "symbol";
          if (isRoad) map.setLayoutProperty(layer.id, "visibility", bm.showStreets ? "visible" : "none");
          else if (isLabel) map.setLayoutProperty(layer.id, "visibility", showLabel(id) ? "visible" : "none");
        }
      } catch {}
      try {
        const exag = Math.max(0, Math.min(5, (bm as any).terrainStrength ?? 1.4));
        const isSatellite = /satellite/i.test(bm.styleUrl ?? "") || photorealExportFallback;
        const darkStyle = isDarkStyle(bm.styleUrl);
        if ((bm.terrain || photorealExportFallback) && exag > 0 && !photoreal3d) {
          // (1) REAL 3-D mesh terrain via our CORS-proxied DEM (`/api/dem`) — the
          //     upstream terrarium tiles have no CORS so MapLibre couldn't load
          //     them directly; the proxy fixes that. Extrudes on GPU contexts
          //     (the editor preview + the user's render agent) when the camera is
          //     pitched. Recolours nothing — the chosen style is preserved.
          try {
            if (!map.getSource(ML_TERRAIN_SOURCE_ID)) map.addSource(ML_TERRAIN_SOURCE_ID, demSource() as any);
            map.setTerrain({ source: ML_TERRAIN_SOURCE_ID, exaggeration: exag } as any);
          } catch {}
          // (1b) ATMOSPHERE — sky + distance fog, the Google-Earth-Studio touch.
          //      At cinematic pitch the loaded tile pyramid otherwise ENDS in a
          //      jagged edge against the backdrop; fog blends the far ground into
          //      a graded horizon so tilted terrain shots read like aerials, not
          //      a floating map fragment. Tones follow the style's mood.
          try {
            (map as any).setSky?.({
              "sky-color": darkStyle ? "#0a1322" : "#8fbce0",
              "horizon-color": darkStyle ? "#16263c" : "#dcebf6",
              "fog-color": darkStyle ? "#0d1a2b" : "#e9f1f8",
              "sky-horizon-blend": 0.7,
              "horizon-fog-blend": 0.55,
              "fog-ground-blend": 0.82,
            });
          } catch {}
          // (2) NATIVE MapLibre `hillshade` from the SAME DEM — this is the key to
          //     "looks good on the SELECTED style": unlike a grey raster overlay
          //     (which desaturates everything), a hillshade layer paints only the
          //     relief SHADOWS + soft highlights, leaving the style's hues intact.
          //     Shadow/highlight tones are tuned per style (dark vs light) and it
          //     reads as relief even flat/top-down. Skipped on satellite (imagery
          //     already carries real relief).
          if (isSatellite) {
            if (map.getLayer("ps-hillshade")) map.removeLayer("ps-hillshade");
          } else {
            const hsExag = Math.min(1, 0.35 + exag * 0.14); // visible relief, not a wash
            const shadow = darkStyle ? "#000000" : "#3a3f4a";
            const highlight = darkStyle ? "rgba(150,170,210,0.30)" : "rgba(255,255,255,0.45)";
            const accent = darkStyle ? "rgba(90,120,170,0.40)" : "rgba(80,90,110,0.35)";
            try { if (map.getLayer("ps-hillshade") && (map.getStyle()?.layers ?? []).find((l: any) => l.id === "ps-hillshade")?.type !== "hillshade") map.removeLayer("ps-hillshade"); } catch {}
            if (!map.getLayer("ps-hillshade")) {
              const firstSymbol = (map.getStyle()?.layers ?? []).find((ly: any) => ly.type === "symbol")?.id;
              map.addLayer({ id: "ps-hillshade", type: "hillshade", source: ML_TERRAIN_SOURCE_ID,
                paint: { "hillshade-exaggeration": hsExag, "hillshade-shadow-color": shadow, "hillshade-highlight-color": highlight, "hillshade-accent-color": accent } as any } as any, firstSymbol);
            } else {
              map.setPaintProperty("ps-hillshade", "hillshade-exaggeration", hsExag as any);
              map.setPaintProperty("ps-hillshade", "hillshade-shadow-color", shadow as any);
              map.setPaintProperty("ps-hillshade", "hillshade-highlight-color", highlight as any);
              map.setPaintProperty("ps-hillshade", "hillshade-accent-color", accent as any);
            }
          }
        } else {
          try { map.setTerrain(null as any); } catch {}
          try { (map as any).setSky?.(null); } catch {}
          if (map.getLayer("ps-hillshade")) map.removeLayer("ps-hillshade");
        }
      } catch {}
      try {
        // Art-directed 3D buildings — colour / opacity / height / glassy gradient
        // are all style-driven, so a "neon city" or "holographic" or "miniature
        // diorama" look is just a different set of paint props on the same layer.
        const bColor = (bm as any).buildingColor || "#b9c2d6";
        const bOpacity = (bm as any).buildingOpacity ?? 0.62;
        const hMult = Math.max(0.2, Math.min(8, (bm as any).buildingHeightMult ?? 1));
        const bGrad = !!(bm as any).buildingGradient;
        const heightExpr: any = ["*", hMult, ["coalesce", ["get", "render_height"], ["get", "height"], 8]];
        if ((bm.buildings3d || photorealExportFallback) && !photoreal3d) {
          if (!map.getLayer("ps-3d-buildings")) {
            // Extrude buildings from the style's OWN vector source (openmaptiles
            // schema: `building` source-layer, render_height/render_min_height).
            const style = map.getStyle();
            const vectorSrc = Object.entries(style?.sources ?? {}).find(([, s]) => (s as any).type === "vector")?.[0];
            if (vectorSrc) {
              const firstSymbol = (style?.layers ?? []).find((ly: any) => ly.type === "symbol")?.id;
              map.addLayer({
                id: "ps-3d-buildings", source: vectorSrc, "source-layer": "building", type: "fill-extrusion", minzoom: 13,
                paint: {
                  "fill-extrusion-color": bColor,
                  "fill-extrusion-height": heightExpr,
                  "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
                  "fill-extrusion-opacity": bOpacity,
                  "fill-extrusion-vertical-gradient": bGrad,
                },
              } as any, firstSymbol);
            }
          } else {
            // Live-update the paint so switching a 3D style restyles buildings.
            try {
              map.setPaintProperty("ps-3d-buildings", "fill-extrusion-color", bColor as any);
              map.setPaintProperty("ps-3d-buildings", "fill-extrusion-opacity", bOpacity as any);
              map.setPaintProperty("ps-3d-buildings", "fill-extrusion-vertical-gradient", bGrad as any);
              map.setPaintProperty("ps-3d-buildings", "fill-extrusion-height", heightExpr);
            } catch {}
          }
        } else if (map.getLayer("ps-3d-buildings")) {
          map.removeLayer("ps-3d-buildings");
        }
        // Sun on the 3-D extrusion buildings, driven by time of day. Crude solar
        // arc (azimuth sweeps with the clock, altitude peaks at noon) → MapLibre
        // light direction. Unlike Google's photoreal tiles, this DOES render in
        // the headless export, so 3-D + time-of-day survives to 4K.
        try {
          const tod = Math.max(0, Math.min(24, (bm as any).timeOfDay ?? 13));
          const altitude = Math.max(0, Math.sin(((tod - 6) / 12) * Math.PI)); // 0 at dawn/dusk, 1 at noon
          const azimuth = ((tod / 24) * 360 + 90) % 360;                       // moves E→W over the day
          const night = tod < 5.5 || tod > 19.5;
          map.setLight({ anchor: "map", position: [1.5, azimuth, 90 - altitude * 75], color: night ? "#9fb4e6" : altitude < 0.4 ? "#ffd9a8" : "#ffffff", intensity: night ? 0.25 : 0.4 + altitude * 0.4 } as any);
        } catch {}
      } catch {}
      // ── Land & water recolour — repaint the MAP ITSELF, not the grade ──
      // Overrides the basemap's water fills + land background; clearing the
      // colour restores the style's original (stashed on first touch).
      try {
        // Drop stashes from a previous style so we re-capture fresh originals
        // (and don't leak memory across many style switches).
        if (paintStyleKey.current !== bm.styleUrl) { paintStyleKey.current = bm.styleUrl; paintBase.current = {}; }
        const setOrRestore = (layerId: string, prop: string, override: string) => {
          const key = `${bm.styleUrl}::${layerId}::${prop}`;
          if (!(key in paintBase.current)) paintBase.current[key] = map.getPaintProperty(layerId, prop as any) ?? null;
          map.setPaintProperty(layerId, prop as any, override || paintBase.current[key]);
        };
        // Signature "noir" deepening: dark basemaps get a richer near-black land +
        // deep-water + a subtle cool boundary glow by DEFAULT, so every map reads
        // cinematic out of the box. Explicit land/water colours still win.
        const grid = isGridStyle(bm.styleUrl);
        const noir = isDarkStyle(bm.styleUrl);
        const effLand = (bm as any).landColor || (grid ? GRID.land : noir ? NOIR.land : "");
        const effWater = (bm as any).waterColor || (grid ? GRID.water : noir ? NOIR.water : "");
        // A creative 3D style can force a glowing accent boundary on ANY base.
        const glow = (bm as any).boundaryGlow || "";
        const boundaryColor = glow || (grid ? GRID.boundary : NOIR.boundary);
        for (const layer of map.getStyle()?.layers ?? []) {
          const id = (layer.id || "").toLowerCase();
          const t = (layer as any).type;
          if (t === "fill" && /water|ocean|sea|river|lake/.test(id)) setOrRestore(layer.id, "fill-color", effWater);
          else if (t === "background") setOrRestore(layer.id, "background-color", effLand);
          else if (t === "fill" && /\bland\b|landcover|landuse|park|grass|wood|sand|ice|earth|natural/.test(id)) setOrRestore(layer.id, "fill-color", effLand);
          else if ((noir || grid || glow) && t === "line" && /boundary|admin/.test(id) && !/water/.test(id)) {
            setOrRestore(layer.id, "line-color", boundaryColor);
          }
        }
        // Blueprint graticule — a glowing lat/long grid over the navy base.
        if (grid) {
          if (!map.getSource("ps-grid")) map.addSource("ps-grid", { type: "geojson", data: graticule(10) as any } as any);
          if (!map.getLayer("ps-grid-lines")) {
            const firstSymbol = (map.getStyle()?.layers ?? []).find((ly: any) => ly.type === "symbol")?.id;
            map.addLayer({ id: "ps-grid-lines", type: "line", source: "ps-grid", paint: { "line-color": GRID.line, "line-width": 0.7 } as any } as any, firstSymbol);
          }
        } else if (map.getLayer("ps-grid-lines")) {
          map.removeLayer("ps-grid-lines");
        }
      } catch {}
      map.triggerRepaint?.();
    };
    apply();
    map.on?.("styledata", apply);
    map.on?.("idle", apply);
    // A style switch reloads the base style ASYNC, so the immediate apply() above
    // bails (style not loaded yet). Retry until it's ready so the new look +
    // recolour/terrain appear right after clicking — no toggle off/on needed.
    let tries = 0;
    const retry = setInterval(() => { if (map.isStyleLoaded?.()) { apply(); clearInterval(retry); } else if (++tries > 50) clearInterval(retry); }, 80);
    return () => { map.off?.("styledata", apply); map.off?.("idle", apply); clearInterval(retry); };
  }, [bm.showStreets, bm.showLabels, (bm as any).labelDetail, bm.terrain, bm.buildings3d, bm.styleUrl, (bm as any).terrainStrength, (bm as any).landColor, (bm as any).waterColor, (bm as any).buildingColor, (bm as any).buildingOpacity, (bm as any).buildingHeightMult, (bm as any).buildingGradient, (bm as any).boundaryGlow, (bm as any).timeOfDay, (bm as any).photoreal3d, photoreal3d, photorealExportFallback]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── OpenHistoricalMap: show the world AS OF `ohmYear` (animated or static) ──
  // Re-applies the date filter whenever the displayed year TICKS, so borders and
  // places change over time as the scene plays. Every dated OHM feature is kept
  // only while start ≤ year ≤ end; the coalesce defaults KEEP undated features,
  // so if OHM's schema ever differs this degrades to "show all", never blank.
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Build (once per style) the list of OHM-source layers + their base filters.
    // Re-serialising getStyle() every year tick is what made the timelapse stutter.
    // Base-geography source-layers (coastline / water / maritime) stay visible at
    // ALL years so the map never goes blank; the THEMATIC layers (boundaries,
    // country areas, places, routes) get STRICT dating so the map actually reads
    // correct to the year — undated bulk-import features are hidden once a year is
    // set, instead of showing in every era (which made the timelapse look static).
    const BASE_SRCLAYERS = /water|maritime|ocean|coast|land_ohm_polygons|background/i;
    const ensureCache = (): { id: string; base: any; thematic: boolean }[] | null => {
      const cur = ohmLayersRef.current;
      if (cur && cur.key === bm.styleUrl) return cur.list;
      if (!map.isStyleLoaded?.() || !map.getSource?.("ohm")) return null;
      const list: { id: string; base: any; thematic: boolean }[] = [];
      for (const layer of map.getStyle()?.layers ?? []) {
        if ((layer as any).source !== "ohm") continue;
        const srcLayer = String((layer as any)["source-layer"] ?? "");
        const thematic = !BASE_SRCLAYERS.test(srcLayer);
        list.push({ id: layer.id, base: (layer as any).filter ?? null, thematic });
      }
      ohmLayersRef.current = { key: bm.styleUrl, list };
      return list;
    };
    const applyDate = () => {
      const list = ensureCache();
      if (!list || !list.length) return;
      const dated = ohmYear !== null && isFinite(ohmYear);
      // STRICT (thematic): the feature must have a real start that has happened by
      // `year`, and must not have ended yet. Undated features are HIDDEN — so a
      // year of 1500 shows the 1500 world, not modern borders stacked on top.
      const strict: any = ["all",
        ["has", "start_decdate"],
        ["<=", ["to-number", ["get", "start_decdate"]], ohmYear],
        [">=", ["to-number", ["coalesce", ["get", "end_decdate"], 1e6]], ohmYear],
      ];
      // LENIENT (base geography): keep undated land/water so the map never blanks.
      const lenient: any = ["all",
        ["<=", ["to-number", ["coalesce", ["get", "start_decdate"], -1e6]], ohmYear],
        [">=", ["to-number", ["coalesce", ["get", "end_decdate"], 1e6]], ohmYear],
      ];
      try {
        for (const { id, base, thematic } of list) {
          if (!map.getLayer(id)) continue;
          if (!dated) { map.setFilter(id, base); continue; }
          const dateFilter = thematic ? strict : lenient;
          map.setFilter(id, base ? ["all", base, dateFilter] : dateFilter);
        }
        map.triggerRepaint?.();
      } catch {}
    };
    // On style (re)load, invalidate the cache then re-apply for the current year.
    const onStyle = () => { ohmLayersRef.current = null; applyDate(); };
    applyDate();
    map.on?.("styledata", onStyle);
    return () => { map.off?.("styledata", onStyle); };
  }, [ohmYear, bm.styleUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTransparent = comp.basemap.transparentBg;
  const project = (lon: number, lat: number) => {
    const m = mapRef.current?.getMap() as any;
    if (!m) return { x: 0, y: 0 };
    // Use the FLAT (terrain-free) screen projection for 2-D overlays. MapLibre's
    // map.project() drapes points onto 3-D terrain and returns off-screen / NaN
    // coords when the DEM isn't loaded for that point during a render frame —
    // which makes every marker / label / flag vanish on tilted terrain shots.
    try {
      const t = m.transform;
      if (t && typeof t.locationPoint === "function") {
        const pt = t.locationPoint(new LngLat(lon, lat));
        if (pt && isFinite(pt.x) && isFinite(pt.y)) return { x: pt.x, y: pt.y };
      }
    } catch {}
    const p = m.project([lon, lat]);
    return p && isFinite(p.x) && isFinite(p.y) ? p : { x: 0, y: 0 };
  };

  return (
    <ThemeCtx.Provider value={comp.theme ?? DEFAULT_THEME}>
    <AbsoluteFill style={{ background: isTransparent ? "transparent" : (comp.look?.bgColor ?? "#05060e") }}>
      <Map
        ref={mapRef}
        mapStyle={mapStyleResolved as any}
        // Camera is driven imperatively via jumpTo each frame (above) — a single
        // transform update per frame, and guaranteed in sync with overlays.
        initialViewState={{ longitude: pose.lon, latitude: pose.lat, zoom: pose.zoom, pitch: pose.pitch, bearing: pose.bearing }}
        interactive={false}
        attributionControl={false}
        // CLEAN RENDER (no artifacts / flicker):
        //  • preserveDrawingBuffer — the headless renderer screenshots the WebGL
        //    canvas; without this the GL back-buffer is cleared after paint and the
        //    capture grabs an empty/garbage frame (the "weird artifacts").
        //  • fadeDuration:0 in render mode — kills MapLibre's tile cross-fade so a
        //    frame is never captured with tiles half-faded-in (the flicker). In the
        //    live preview we allow a 250ms fade so tiles blend in smoothly instead
        //    of popping — a much nicer editing experience.
        preserveDrawingBuffer={isRendering || !!capturing}
        fadeDuration={isRendering || capturing ? 0 : 250}
        // 64 parallel tile fetches in the PREVIEW too (default is 16) — the
        // editor camera crosses many zoom levels, and satellite tiles through
        // the proxy were bottlenecked four-deep per host. This is the single
        // biggest "satellite feels slow in the editor" fix.
        maxParallelImageRequests={64}
        onLoad={() => {
          setMapReady(true);
          const m = mapRef.current?.getMap();
          if (m) {
            (m as any).setMaxTileCacheSize?.(8192);
            (m as any).setMaxParallelImageRequests?.(64);
          }
          if (m?.areTilesLoaded?.()) release();
        }}
        onIdle={() => { setMapReady(true); release(); }}
        style={{ width: "100%", height: "100%", filter: mapFilterCss(comp.look) }}
      >
        {/* PHOTOREAL 3D (Google Earth) — deck.gl overlay of Google's
            Photorealistic 3D Tiles, preview-only (never in the headless render),
            and only when the user has supplied a Google Maps key. */}
        {photoreal3d && (
          <React.Suspense fallback={null}>
            <LazyGoogle3D apiKey={googleKey} onAttribution={setGoogleCredit} timeOfDay={(comp.basemap as any).timeOfDay ?? 13} sunDate={(comp.basemap as any).sunDate} />
          </React.Suspense>
        )}
        {/* ── Pass 1: Earth observation rasters — ALWAYS behind everything else.
            MapLibre layers are painted in declaration order (first = bottom).
            We render earthlayer sources FIRST so that highlights/routes always
            appear on top regardless of where the user placed them in the panel. */}
        {comp.layers.filter((l) => l.enabled && l.type === "earthlayer").map((l) => {
          const el = l as any;
          const tr = evalTiming(el.timing, frame, fps, totalFrames);
          const opacity = Math.min(1, (el.opacity ?? 0.75) * tr.opacity);
          if (opacity < 0.005) return null;
          const dsId = el.datasetId ?? "MODIS_Terra_CorrectedReflectance_TrueColor";
          const fmt = el.tileFormat ?? "jpg";
          const matrix = el.tileMatrix ?? "GoogleMapsCompatible_Level9";
          const mz: number = el.maxzoom ?? 9;
          // GIBS URL: static datasets use the default slot (no date); dated datasets
          // use YYYY-MM-DD. Both patterns served by the same WMTS endpoint.
          const date = (el.date && el.date !== "") ? el.date : new Date(Date.now() - 172800000).toISOString().slice(0, 10);
          const datePart = (el.date === "") ? "/default" : `/${date}`;
          const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${dsId}/default${datePart}/${matrix}/{z}/{y}/{x}.${fmt}`;
          const srcId = `gibs-${l.id}`;
          const lyrId = `gibs-lyr-${l.id}`;
          // Compare layer: cross-fade between two earth states (before / after).
          // The "before" layer fades IN (inverse opacity) as the "after" fades OUT,
          // creating a smooth temporal transition driven by the timing system.
          const hasCmp = !!(el.compareDatasetId);
          const cmpOpacity = hasCmp ? Math.min(1, (el.opacity ?? 0.75) * Math.max(0, 1 - tr.opacity) * 1.2) : 0;
          const cDate = el.compareDate && el.compareDate !== "" ? el.compareDate : date;
          const cMatrix = el.tileMatrix ?? "GoogleMapsCompatible_Level9";
          const cMz: number = el.compareMaxzoom ?? mz;
          const cDatePart = (el.compareDate === "") ? "/default" : `/${cDate}`;
          const cUrl = hasCmp
            ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${el.compareDatasetId}/default${cDatePart}/${cMatrix}/{z}/{y}/{x}.${el.tileFormat ?? "png"}`
            : null;
          const cSrcId = `gibs-cmp-${l.id}`;
          const cLyrId = `gibs-cmp-lyr-${l.id}`;
          return (
            <React.Fragment key={l.id}>
              <Source id={srcId} type="raster" tiles={[tileUrl]} tileSize={256} minzoom={0} maxzoom={mz} attribution={el.attribution ?? "NASA GIBS / Earthdata"} />
              <MapLayer id={lyrId} type="raster" source={srcId} paint={{ "raster-opacity": opacity, "raster-fade-duration": 0 }} />
              {cUrl && cmpOpacity > 0.005 && (
                <>
                  <Source id={cSrcId} type="raster" tiles={[cUrl]} tileSize={256} minzoom={0} maxzoom={cMz} />
                  <MapLayer id={cLyrId} type="raster" source={cSrcId} paint={{ "raster-opacity": cmpOpacity, "raster-fade-duration": 0 }} />
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* ── Pass 2: Vector / GeoJSON sources — rendered after rasters so they
            appear on TOP. Panel z-order is preserved: layers[0] is top-most in
            the editor → iterate reversed so it's painted last = highest. */}
        {[...comp.layers].reverse().map((l, ri) => {
          if (!l.enabled || l.type === "earthlayer") return null;
          if (l.type === "highlight" && l.geojson)
            return <HighlightSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} terrain={!!comp.basemap.terrain || /satellite/i.test(String(comp.basemap.styleUrl ?? ""))} />;
          if (l.type === "route" && l.coordinates.length > 1 && l.showLine !== false)
            return <RouteSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "track" && l.points.length > 1)
            return <TrackSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "choropleth" && (l as ChoroplethLayer).data?.length)
            return <ChoroplethSource key={`${l.id}-${ri}`} layer={l as ChoroplethLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "flow" && (l as FlowLayer).data?.length)
            return <FlowSource key={`${l.id}-${ri}`} layer={l as FlowLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "heatmap" && (l as HeatmapLayer).data?.length)
            return <HeatmapSource key={`${l.id}-${ri}`} layer={l as HeatmapLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          return null;
        })}
      </Map>

      {/* Google Photorealistic 3D Tiles attribution (required by Google's ToS). */}
      {photoreal3d && (
        <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 5, fontSize: "1.1vh", color: "rgba(255,255,255,0.7)", textShadow: "0 1px 3px rgba(0,0,0,0.8)", pointerEvents: "none", maxWidth: "60%", lineHeight: 1.3 }}>
          {googleCredit || "Data: Google"}
        </div>
      )}

      {/* Colour grade UNDER the text — map gets the treatment, type stays crisp. */}
      {!isTransparent && comp.look && <LookUnder look={comp.look} />}
      {!isTransparent && <TimeAtmosphere t={(comp.basemap as any).timeOfDay ?? 13} />}

      {/* DOM overlay layers, in stack order. Reversed like the canvas layers so
          layers[0] (top of the panel) paints LAST = on top — a route placed above
          a flag/highlight in the panel now draws over it (markers, icons, labels). */}
      {[...comp.layers].reverse().map((l) => {
        if (!l.enabled) return null;
        switch (l.type) {
          case "label": return <LabelView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "flag":  return <FlagView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "title": return <TitleView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "chart": return <ChartView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "image": return <ImageView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "marker": return <MarkerView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "annotation": return <AnnotationView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "connections": return <ConnectionsView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "spotlight": return <SpotlightView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "radius": return <RadiusView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "timestamp": return <TimestampView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "atmosphere": return <AtmosphereView key={l.id} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "choropleth": return <ChoroplethLegend key={l.id} layer={l as ChoroplethLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "bubble": return <BubbleView key={l.id} layer={l as BubbleLayer} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
          case "flow": return <FlowLegend key={l.id} layer={l as FlowLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "heatmap": return <HeatmapLegend key={l.id} layer={l as HeatmapLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "earthlayer": {
            const el = l as any;
            const tr = evalTiming(el.timing, frame, fps, totalFrames);
            const vis = tr.opacity * (el.opacity ?? 0.75) > 0.05;
            if (!vis || !el.label) return null;
            return (
              <div key={l.id} style={{ position: "absolute", left: "1.6%", bottom: "3.5%", zIndex: 6, pointerEvents: "none", opacity: Math.min(1, tr.opacity * 3) }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5vh", background: "rgba(6,8,14,0.72)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.6vh", padding: "0.35vh 0.8vh", backdropFilter: "blur(8px)" }}>
                  <div style={{ width: "0.7vh", height: "0.7vh", borderRadius: "50%", background: "#4FC3F7", boxShadow: "0 0 6px #4FC3F7" }} />
                  <span style={{ fontSize: "1.05vh", fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "Inter, sans-serif", letterSpacing: 0.3 }}>{el.label}</span>
                  {el.date && el.date !== "" && <span style={{ fontSize: "0.9vh", color: "rgba(255,255,255,0.45)", fontFamily: "Inter, sans-serif" }}>{el.date}</span>}
                </div>
              </div>
            );
          }
          case "highlight": return (
            <HighlightLabel key={`${l.id}-hl`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />
          );
          case "route": return l.coordinates.length > 1 ? (
            <React.Fragment key={`${l.id}-rt`}>
              {(l as any).showEndpoints !== false && <RouteEndpoints layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />}
              {l.icon !== "none" && <RouteIconView layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />}
            </React.Fragment>
          ) : null;
          case "track": return l.points.length > 1 ? (
            <TrackOverlay key={`${l.id}-tk`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />
          ) : null;
          default: return null;
        }
      })}

      {/* Cinematic look — graded post layer over the whole frame. */}
      {!isTransparent && comp.look && <LookOverlay look={comp.look} />}

      {/* Documentary narration caption — word-by-word animated subtitle.
          Multi-beat: one line per beat timed to camera arrival (narrationLines).
          Single: full narration text revealed word-by-word across the scene. */}
      {((comp as any).narration || (comp as any).narrationLines?.length > 0) && ((comp.look as any)?.showCaptions !== false) && (
        (comp as any).narrationLines?.length > 1
          ? <MultiNarrationCaption lines={(comp as any).narrationLines} frame={frame} fps={fps} totalFrames={totalFrames} />
          : <NarrationCaption text={(comp as any).narration ?? ""} frame={frame} totalFrames={totalFrames} />
      )}

      {/* Voiceover audio — plays during Remotion render so the exported video has sound.
          Uses the data URL stored on the composition (generated by ElevenLabs TTS). */}
      {(comp as any).voiceover?.url && (
        <Audio src={(comp as any).voiceover.url} volume={(comp as any).voiceover.volume ?? 0.9} startFrom={0} />
      )}

      {/* In-frame source citations — journalism-grade "Source: World Bank" tag. */}
      {(comp as any).citations?.length > 0 && (
        <SourceCitationsOverlay citations={(comp as any).citations} frame={frame} totalFrames={totalFrames} />
      )}

      {watermark && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-end", padding: "3.5%", pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5em", fontSize: "2.6vh", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.82)", textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}>
            <span style={{ width: "1.4vh", height: "1.4vh", borderRadius: "50%", background: "#6E7BFF", boxShadow: "0 0 10px rgba(110,123,255,0.7)" }} />
            Mapanisy
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};

/* ── Cinematic look overlay ───────────────────────────────────────────────── */

// Static fractal-noise tile for film grain (deterministic per frame → render-safe).
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const PAPER_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.07' numOctaves='5' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E\")";

/** A full-frame texture overlay style (paper / halftone / scanlines / grid / noise). */
function textureStyle(kind: string, opacity: number): React.CSSProperties | null {
  switch (kind) {
    case "paper":     return { backgroundImage: PAPER_URI, backgroundSize: "260px 260px", opacity: opacity * 0.55, mixBlendMode: "multiply" };
    case "noise":     return { backgroundImage: GRAIN_URI, backgroundSize: "180px 180px", opacity: opacity * 0.5, mixBlendMode: "overlay" };
    case "halftone":  return { backgroundImage: "radial-gradient(rgba(0,0,0,0.55) 22%, transparent 23%)", backgroundSize: "7px 7px", opacity: opacity * 0.4, mixBlendMode: "multiply" };
    case "scanlines": return { backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.5) 0 1px, transparent 1px 3px)", opacity: opacity * 0.5, mixBlendMode: "multiply" };
    case "grid":      return { backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.12) 1px,transparent 1px)", backgroundSize: "44px 44px", opacity: opacity * 0.6, mixBlendMode: "overlay" };
    default: return null;
  }
}

/**
 * Colour-grade the MAP ITSELF via a CSS filter on the map container. "antique"
 * makes any modern basemap read like an aged historical map (warm sepia, lifted
 * blacks, desaturated); the rest are quick film grades. Amount scales intensity.
 * Chromium applies this during compositing, so it renders headless too.
 */
function mapFilterCss(look?: Look): string | undefined {
  const k = look?.mapFilter ?? "none";
  if (k === "none") return undefined;
  const a = Math.max(0, Math.min(1, look?.mapFilterAmount ?? 0.85));
  switch (k) {
    case "sepia":     return `sepia(${a}) contrast(1.05) brightness(1.02)`;
    case "antique":   return `sepia(${a}) saturate(${(0.8 - 0.2 * a).toFixed(2)}) hue-rotate(-14deg) contrast(${(1 + 0.12 * a).toFixed(2)}) brightness(${(1 + 0.06 * a).toFixed(2)})`;
    case "noir":      return `grayscale(${a}) contrast(${(1 + 0.22 * a).toFixed(2)}) brightness(0.98)`;
    case "cool":      return `saturate(${(1 + 0.1 * a).toFixed(2)}) hue-rotate(${Math.round(14 * a)}deg) brightness(1.01) contrast(1.05)`;
    case "warm":      return `sepia(${(0.4 * a).toFixed(2)}) saturate(${(1 + 0.15 * a).toFixed(2)}) brightness(1.03) contrast(1.04)`;
    case "blueprint": return `invert(${a}) hue-rotate(180deg) saturate(${(1.8 * a + 0.6).toFixed(2)}) brightness(0.82) contrast(1.12)`;
    case "duotone":   return `grayscale(1) sepia(${a}) saturate(${(3 * a).toFixed(2)}) hue-rotate(155deg) contrast(1.06)`;
    default:          return undefined;
  }
}

/** The COLOUR grade (tint + texture + grain) — rendered UNDER the text/overlay
 *  layers so titles and labels stay crisp while the map gets the treatment. */
/** Time-of-day atmosphere — warms dawn/dusk, cools + darkens night, near-clear at
 *  midday. Applies on EVERY style so the chosen hour reads even without photoreal. */
const TimeAtmosphere: React.FC<{ t: number }> = ({ t }) => {
  const day = Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)); // 0 at dawn/dusk/night, 1 noon
  const night = t < 5.5 ? clampN((5.5 - t) / 4, 0, 1) : t > 19.5 ? clampN((t - 19.5) / 4, 0, 1) : 0;
  const golden = !night && day < 0.5 ? (0.5 - day) / 0.5 : 0;
  if (night < 0.02 && golden < 0.02) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {golden > 0.02 && <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(255,138,46,${(0.3 * golden).toFixed(3)}), transparent 58%)`, mixBlendMode: "screen" }} />}
      {night > 0.02 && <AbsoluteFill style={{ background: `rgba(8,16,46,${(0.52 * night).toFixed(3)})`, mixBlendMode: "multiply" }} />}
      {night > 0.02 && <AbsoluteFill style={{ background: `radial-gradient(130% 80% at 50% -12%, rgba(34,46,96,${(0.5 * night).toFixed(3)}), transparent 55%)` }} />}
    </AbsoluteFill>
  );
};

const LookUnder: React.FC<{ look: Look }> = ({ look }) => {
  const tex = textureStyle(look.texture ?? "none", look.textureOpacity ?? 0.5);
  // 3-way grade: tint shadows / mids / highlights independently. Screen lifts &
  // colours darks (lift), soft-light tints mids (gamma), multiply colours the
  // brights (gain) — the standard, render-safe way to fake colour wheels in the
  // browser so the headless render matches the preview exactly.
  const gS = (look as any).gradeShadow as string, gM = (look as any).gradeMid as string, gH = (look as any).gradeHigh as string;
  const gSa = (look as any).gradeShadowAmt ?? 0.5, gMa = (look as any).gradeMidAmt ?? 0.5, gHa = (look as any).gradeHighAmt ?? 0.5;
  const hasGrade = !!gS || !!gM || !!gH;
  if (!(look.tintOpacity > 0) && !tex && !(look.grain > 0) && !hasGrade) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {look.tintOpacity > 0 && (
        <AbsoluteFill style={{ background: look.tintColor, opacity: look.tintOpacity, mixBlendMode: "soft-light" }} />
      )}
      {gS && <AbsoluteFill style={{ background: gS, opacity: gSa * 0.5, mixBlendMode: "screen" }} />}
      {gM && <AbsoluteFill style={{ background: gM, opacity: gMa * 0.85, mixBlendMode: "soft-light" }} />}
      {gH && <AbsoluteFill style={{ background: gH, opacity: gHa * 0.5, mixBlendMode: "multiply" }} />}
      {tex && <AbsoluteFill style={tex} />}
      {look.grain > 0 && (
        <AbsoluteFill style={{ backgroundImage: GRAIN_URI, backgroundSize: "160px 160px", opacity: look.grain * 0.5, mixBlendMode: "overlay" }} />
      )}
    </AbsoluteFill>
  );
};

/** The FRAME devices (vignette + letterbox) — these stay over everything. */
const LookOverlay: React.FC<{ look: Look }> = ({ look }) => {
  const bars = Math.round((look.letterbox ?? 0) * 100);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {look.vignette > 0 && (
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.96) 128%)", opacity: look.vignette }} />
      )}
      {bars > 0 && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: `${bars}%`, background: "#000" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${bars}%`, background: "#000" }} />
        </>
      )}
    </AbsoluteFill>
  );
};

/** Multi-beat narration: one line per beat, each shown when the camera arrives.
 *  Replaces NarrationCaption for single-scene animations with multiple AI beats. */
const MultiNarrationCaption: React.FC<{
  lines: Array<{ text: string; startSec: number }>;
  frame: number;
  fps: number;
  totalFrames: number;
}> = ({ lines, frame, fps, totalFrames }) => {
  const currentSec = frame / fps;
  const totalSec = totalFrames / fps;

  // Find the currently active line (the last one whose startSec ≤ currentSec).
  let activeIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentSec >= lines[i].startSec) { activeIdx = i; break; }
  }
  if (activeIdx < 0) return null;

  const line = lines[activeIdx];
  const nextStartSec = lines[activeIdx + 1]?.startSec ?? totalSec;
  const lineStartF = Math.round(line.startSec * fps);
  const lineEndF = Math.round((nextStartSec - 0.35) * fps);
  const lineDuration = Math.max(1, lineEndF - lineStartF);
  const relFrame = frame - lineStartF;
  if (relFrame < 0 || relFrame > lineDuration + Math.round(fps * 0.35)) return null;

  const inRamp = Math.round(fps * 0.28);
  const outRamp = Math.round(fps * 0.28);
  const inOpacity = Math.min(1, relFrame / Math.max(1, inRamp));
  const outStart = Math.max(inRamp, lineDuration - outRamp);
  const outOpacity = relFrame > outStart ? Math.max(0, 1 - (relFrame - outStart) / Math.max(1, outRamp)) : 1;
  const globalOpacity = inOpacity * outOpacity;
  if (globalOpacity < 0.01) return null;

  const words = line.text.trim().split(/\s+/).filter(Boolean);
  const revealFrames = Math.max(1, lineDuration * 0.72);
  const wordsPerFrame = words.length / revealFrames;
  const WORD_RAMP = 5;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 8% 5.2%", pointerEvents: "none" }}>
      <div style={{ opacity: globalOpacity, background: "rgba(0,0,0,0.64)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderRadius: "0.5em", padding: "0.55em 1.3em", maxWidth: "78%", textAlign: "center", lineHeight: 1.55 }}>
        {words.map((word, i) => {
          const wordStartF = i / wordsPerFrame;
          const progress = Math.max(0, Math.min(1, (relFrame - wordStartF) / WORD_RAMP));
          return (
            <span key={`${activeIdx}-${i}`} style={{ display: "inline-block", marginRight: "0.3em", opacity: progress, transform: `translateY(${(1 - progress) * 7}px)`, fontSize: "2.05vh", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500, color: "rgba(255,255,255,0.96)", letterSpacing: "0.01em", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Documentary-style narration caption — word-by-word animated subtitle.
 *  Each word slides up and fades in sequentially as the scene plays, exactly
 *  like Vox / NYT / Bloomberg explainer videos. Clears before the beat transition.
 *  This is a core differentiator from Google Earth Studio (which only flies cameras). */
const NarrationCaption: React.FC<{ text: string; frame: number; totalFrames: number }> = ({ text, frame, totalFrames }) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  // Animate: appear at 6% of scene, begin exiting at 90%.
  const inF = Math.round(0.06 * totalFrames);
  const outF = Math.round(0.90 * totalFrames);
  const globalOpacity = frame < inF
    ? frame / Math.max(1, inF)
    : frame > outF
    ? Math.max(0, 1 - (frame - outF) / Math.max(1, totalFrames - outF))
    : 1;
  if (globalOpacity < 0.01) return null;

  // Word-by-word reveal: evenly distribute words across the readable window
  // so the last word is visible well before the exit starts.
  const readableFrames = Math.max(1, outF - inF);
  const wordsPerFrame = words.length / readableFrames;
  const WORD_RAMP = 5; // frames for each word to fully appear

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 8% 5.2%", pointerEvents: "none" }}>
      <div style={{
        opacity: globalOpacity,
        background: "rgba(0,0,0,0.64)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: "0.5em",
        padding: "0.55em 1.3em",
        maxWidth: "78%",
        textAlign: "center",
        lineHeight: 1.55,
      }}>
        {words.map((word, i) => {
          // Frame at which this word starts appearing
          const wordStartF = inF + i / wordsPerFrame;
          const progress = Math.max(0, Math.min(1, (frame - wordStartF) / WORD_RAMP));
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.3em",
                opacity: progress,
                transform: `translateY(${(1 - progress) * 7}px)`,
                fontSize: "2.05vh",
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 500,
                color: "rgba(255,255,255,0.96)",
                letterSpacing: "0.01em",
                textShadow: "0 1px 6px rgba(0,0,0,0.6)",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Journalism-grade in-frame source citations — the small "Source: World Bank / UN"
 *  tag seen in FT, Bloomberg, and NYT data graphics. Fades in after 1.5s,
 *  stays for the rest of the scene. Bottom-right corner, ultra-subtle. */
const SourceCitationsOverlay: React.FC<{ citations: string[]; frame: number; totalFrames: number }> = ({ citations, frame, totalFrames }) => {
  if (!citations?.length) return null;
  const inF = Math.round(0.2 * totalFrames);
  const opacity = frame < inF ? Math.min(1, frame / Math.max(1, inF)) : 1;
  if (opacity < 0.01) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-end", padding: "3.2% 3.5%", pointerEvents: "none" }}>
      <div style={{ opacity: opacity * 0.72, fontSize: "1.05vh", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500, color: "rgba(255,255,255,0.75)", letterSpacing: "0.04em", textAlign: "right", lineHeight: 1.6, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
        <span style={{ opacity: 0.55 }}>Source: </span>{citations.join(" · ")}
      </div>
    </AbsoluteFill>
  );
};

