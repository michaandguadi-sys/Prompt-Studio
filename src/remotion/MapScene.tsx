"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  delayRender,
  continueRender,
  getRemotionEnvironment,
  Img,
} from "remotion";
import Map, { MapRef, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type { SceneSpec, MapSceneSpec, CameraPos } from "@/lib/types";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { safeInterpolate, easings, catmullRomChain, linearChain } from "@/lib/interp";

/** Smoothstep: 0→1 with zero derivatives at endpoints. Kills boundary kinks. */
const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * Arc-length parameterized sample along a polyline (#7 route rework).
 *
 * The old code indexed coordinates by `floor(t * (n-1))`, which moves the
 * vehicle in vertex-sized jumps — fast across long segments, crawling across
 * short ones, and visibly snapping on sparse routes. This walks the cumulative
 * distance so position advances at CONSTANT SPEED along the path, and
 * interpolates WITHIN the segment for buttery-smooth motion. Returns the
 * interpolated point plus the local heading (degrees, 0 = north).
 */
type RouteSample = { lon: number; lat: number; bearing: number };
function sampleRouteAt(coords: [number, number][], t: number): RouteSample {
  const n = coords.length;
  if (n === 0) return { lon: 0, lat: 0, bearing: 0 };
  if (n === 1) return { lon: coords[0][0], lat: coords[0][1], bearing: 0 };

  // Cumulative segment lengths (planar lon/lat — fine at the scales we draw).
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    const d = Math.hypot(dx, dy);
    seg.push(d);
    total += d;
  }
  const bearingOf = (a: [number, number], b: [number, number]) =>
    (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;

  if (total === 0) return { lon: coords[0][0], lat: coords[0][1], bearing: 0 };
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0) return { lon: coords[0][0], lat: coords[0][1], bearing: bearingOf(coords[0], coords[1]) };
  if (clamped >= 1) return { lon: coords[n - 1][0], lat: coords[n - 1][1], bearing: bearingOf(coords[n - 2], coords[n - 1]) };

  let target = clamped * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? target / seg[i] : 0;
      const a = coords[i];
      const b = coords[i + 1];
      return {
        lon: a[0] + (b[0] - a[0]) * f,
        lat: a[1] + (b[1] - a[1]) * f,
        bearing: bearingOf(a, b),
      };
    }
    target -= seg[i];
  }
  const last = coords[n - 1];
  return { lon: last[0], lat: last[1], bearing: bearingOf(coords[n - 2], last) };
}

/**
 * Quantize terrain exaggeration to 0.05 increments. WHY:
 * Even tiny per-frame deltas (e.g. exag = 1.5012 → 1.5014) cause Mapbox to
 * re-process the terrain DEM tiles, producing visible flicker on the elevation
 * surface. Quantizing to 0.05 means terrain only "updates" when the user has
 * moved meaningfully, killing the per-frame jitter at the cost of a barely
 * perceptible step in the exaggeration ramp.
 */
const quantizeExag = (x: number) => Math.round(x * 20) / 20;
import { beatsToFrames } from "@/lib/beats";
import { centroidOf } from "@/lib/geo";
import { makePatternImageData, patternImageId } from "@/lib/mapPatterns";
import { RouteIcon } from "./RouteIcon";
import { useStudio } from "@/store/studio";

/**
 * Walk every layer in the loaded Mapbox style and toggle visibility based on
 * whether the layer is a road/street or a text label. Called once on map idle.
 */
function applyLayerToggles(
  map: any,
  opts: { showStreets: boolean; showLabels: boolean },
) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      const id = (layer.id || "").toLowerCase();
      const type = layer.type;
      // Road / street layers
      const isStreet =
        id.includes("road") || id.includes("street") || id.includes("highway") ||
        id.includes("motorway") || id.includes("path") || id.includes("track") ||
        id.includes("tunnel") || id.includes("bridge");
      // Label/symbol layers (text)
      const isLabel = type === "symbol";

      try {
        if (isStreet && !opts.showStreets) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        } else if (isLabel && !opts.showLabels) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        } else {
          // Restore visibility if previously hidden
          map.setLayoutProperty(layer.id, "visibility", "visible");
        }
      } catch {}
    }
  } catch {}
}

export const MapScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const mapRef = useRef<MapRef>(null);
  const scene = spec.scene as MapSceneSpec;
  // Picker mode (lives outside Remotion render context — read directly each
  // render via getState so this hook doesn't break server-side rendering of
  // exported TSX, which doesn't have the studio store).
  const pickerActive =
    typeof window !== "undefined" &&
    !!(useStudio as any).getState?.()?.picker;
  const FRAMES = spec.durationSec * spec.fps;
  const beats = beatsToFrames(scene.beats, FRAMES);
  const ease1 = easings[scene.easing?.phase1 ?? "easeInOut"];
  const ease2 = easings[scene.easing?.phase2 ?? "smooth"];
  const { palette, letterboxHeight, labelTypography, fonts } = spec.style;

  // Three independent render-blockers — Remotion captures the frame only
  // when ALL handles are resolved, preventing partial renders where Mapbox
  // tiles or custom fonts haven't loaded yet.
  const [tilesHandle] = useState(() =>
    delayRender("Waiting for Mapbox tiles", { timeoutInMilliseconds: 90000 }),
  );
  const [fontsHandle] = useState(() =>
    delayRender("Waiting for fonts", { timeoutInMilliseconds: 30000 }),
  );

  // Wait for document.fonts to finish loading every @font-face referenced by
  // text labels in this composition. Without this, custom uploaded fonts
  // render with the system fallback for the first ~5 frames.
  React.useEffect(() => {
    if (typeof document === "undefined") {
      continueRender(fontsHandle);
      return;
    }
    document.fonts.ready
      .then(() => continueRender(fontsHandle))
      .catch(() => continueRender(fontsHandle));
  }, [fontsHandle]);

  const continued = useRef(false);

  const releaseTiles = useCallback((map: any) => {
    if (continued.current) return;
    continued.current = true;
    if (map) {
      applyLayerToggles(map, {
        showStreets: scene.showStreets !== false,
        showLabels: scene.showLabels !== false,
      });
    }
    continueRender(tilesHandle);
  }, [tilesHandle, scene.showStreets, scene.showLabels]);

  const onMapIdle = useCallback(() => {
    releaseTiles(mapRef.current?.getMap());
  }, [releaseTiles]);

  // When the Mapbox style loads, check if tiles are already cached (re-mount
  // at the same camera position). If so, release the blocker immediately —
  // `idle` may never fire again when there is nothing new to load.
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.areTilesLoaded?.()) releaseTiles(map);
  }, [releaseTiles]);

  // Safety-net: if `idle` never fires (race between Remotion and Mapbox), we
  // release the blocker after 3 s so the render doesn't hang for 90 s.
  React.useEffect(() => {
    const t = setTimeout(() => releaseTiles(mapRef.current?.getMap()), 3000);
    return () => clearTimeout(t);
  }, [releaseTiles]);

  // ── Live streets/labels toggle ───────────────────────────────────────
  // The toggle in onMapIdle only fires ONCE. When the user toggles streets
  // or labels in the UI after the map loaded, we need to re-walk all layers.
  // Also: switching basemap style RESETS visibility — listen for styledata.
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      if (!map.isStyleLoaded?.()) return;
      applyLayerToggles(map, {
        showStreets: scene.showStreets !== false,
        showLabels: scene.showLabels !== false,
      });
    };
    apply();
    // Re-apply after any style change (basemap swap repopulates layers)
    map.on?.("styledata", apply);
    return () => {
      map.off?.("styledata", apply);
    };
  }, [scene.showStreets, scene.showLabels, scene.mapStyleUrl]);

  // ── Orphan source/layer prune (the "deleted still shows until reload" fix) ──
  // react-map-gl adds Mapbox sources/layers imperatively and is supposed to
  // remove them when a <Source>/<Layer> unmounts. In practice, deleting or
  // hiding a highlight / arrow / route in the live preview can leave a stale
  // Mapbox source on the map until a full reload — so removed coordinates keep
  // rendering (and get captured by Quick Export). We defensively prune any of
  // OUR managed sources (highlight-* / arrow-* / route-*) that are no longer in
  // the current scene. Skipped during headless render (spec is static there, so
  // no orphans accumulate) to keep frame output deterministic.
  const expectedSourceIds = React.useMemo(() => {
    const ids = new Set<string>();
    const hls = scene.highlights ?? (scene.highlight ? [scene.highlight] : []);
    hls.forEach((h, hi) => {
      if (h?.geojson && h.enabled !== false) ids.add(`highlight-${hi}`);
    });
    (scene.arrows ?? []).forEach((_, ai) => ids.add(`arrow-${ai}`));
    if (scene.route && scene.route.enabled !== false && (scene.route.coordinates?.length ?? 0) > 1) {
      ids.add("route-ghost");
      ids.add("route-drawn");
      ids.add("route-head");
    }
    return ids;
  }, [scene.highlights, scene.highlight, scene.arrows, scene.route]);

  React.useEffect(() => {
    if (getRemotionEnvironment().isRendering) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded?.()) return;
    const prune = () => {
      let style: any;
      try { style = map.getStyle(); } catch { return; }
      if (!style) return;
      const isManaged = (id: string) =>
        id.startsWith("highlight-") || id.startsWith("arrow-") || id.startsWith("route-");
      const orphanSources = new Set<string>();
      for (const srcId of Object.keys(style.sources ?? {})) {
        if (isManaged(srcId) && !expectedSourceIds.has(srcId)) orphanSources.add(srcId);
      }
      if (orphanSources.size === 0) return;
      // Remove layers backed by an orphan source first (Mapbox forbids removing
      // a source still in use), then the sources themselves.
      for (const layer of style.layers ?? []) {
        if (layer?.source && orphanSources.has(layer.source)) {
          try { map.removeLayer(layer.id); } catch {}
        }
      }
      for (const srcId of orphanSources) {
        try { map.removeSource(srcId); } catch {}
      }
    };
    prune();
    // Re-run after react-map-gl finishes its own reconciliation on the next idle.
    map.once?.("idle", prune);
    return () => { map.off?.("idle", prune); };
  }, [expectedSourceIds]);

  // ── Register fill-pattern tiles (hatch / crosshatch / dots / stripes) ──
  // Mapbox `fill-pattern` needs a named image registered on the map. We paint
  // each (type,color) tile to a canvas and add it once; style swaps wipe the
  // image registry, so we re-register on styledata too.
  const patternSig = React.useMemo(() => {
    const hls = scene.highlights ?? (scene.highlight ? [scene.highlight] : []);
    return hls
      .filter((h) => h?.style?.fillType && h.style.fillType !== "solid")
      .map((h) => `${h!.style.fillType}:${h!.style.fillColor}`)
      .join("|");
  }, [scene.highlights, scene.highlight]);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const register = () => {
      if (!map.isStyleLoaded?.()) return;
      const hls = scene.highlights ?? (scene.highlight ? [scene.highlight] : []);
      for (const h of hls) {
        const ft = h?.style?.fillType;
        if (!ft || ft === "solid") continue;
        const id = patternImageId(ft, h.style.fillColor);
        if (map.hasImage?.(id)) continue;
        const data = makePatternImageData(ft, h.style.fillColor);
        if (data) {
          try { map.addImage(id, data, { pixelRatio: 2 }); } catch {}
        }
      }
      map.triggerRepaint?.();
    };
    register();
    map.on?.("styledata", register);
    return () => { map.off?.("styledata", register); };
  }, [patternSig, scene.mapStyleUrl]);

  // ── Multi-waypoint camera path ────────────────────────────────────────
  // Effective path: [start, mid?, ...extraWaypoints, end]. Linear or
  // Catmull-Rom spline interpolation through all waypoints.
  const waypoints: CameraPos[] = [
    scene.start,
    ...(scene.mid ? [scene.mid] : []),
    ...(scene.extraWaypoints ?? []),
    scene.end,
  ];
  const N = waypoints.length;
  const animEnd = beats.arrive;
  const useSmooth = scene.smoothCameraPath !== false && N >= 3;

  // Global animation progress (0→1 over [0, animEnd]) eased by phase1 easing
  const animProgress = safeInterpolate(frame, [0, animEnd], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  let longitude: number, latitude: number, zoomBase: number;
  let pitchBase: number, bearingBase: number;

  if (useSmooth) {
    // Smooth bezier camera — but ONLY for lon/lat where overshoot is fine.
    // For zoom/pitch we use linearChain (smoothstep per segment) which
    // mathematically CANNOT overshoot — kills the camera wobble that was
    // most visible with 3D terrain on.
    const t = ease1(animProgress);
    longitude  = catmullRomChain(waypoints.map((w) => w.lon), t);
    latitude   = catmullRomChain(waypoints.map((w) => w.lat), t);
    zoomBase   = linearChain(waypoints.map((w) => w.zoom), t);
    pitchBase  = linearChain(waypoints.map((w) => w.pitch ?? 0), t);
    bearingBase = linearChain(waypoints.map((w) => w.bearing ?? scene.end.bearing ?? 0), t);
  } else {
    // Linear per-phase fallback (original behavior)
    const perPhase = N > 1 ? animEnd / (N - 1) : animEnd;
    const rawPhase = Math.min(N - 2, Math.floor(frame / Math.max(1, perPhase)));
    const phaseStart = rawPhase * perPhase;
    const phaseEnd = (rawPhase + 1) * perPhase;
    const easingFn = rawPhase === 0 ? ease1 : ease2;
    const tRaw = safeInterpolate(frame, [phaseStart, phaseEnd], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    const t = easingFn(tRaw);
    const a = waypoints[rawPhase];
    const b = waypoints[Math.min(N - 1, rawPhase + 1)];
    longitude  = safeInterpolate(t, [0, 1], [a.lon, b.lon]);
    latitude   = safeInterpolate(t, [0, 1], [a.lat, b.lat]);
    zoomBase   = safeInterpolate(t, [0, 1], [a.zoom, b.zoom]);
    pitchBase  = safeInterpolate(t, [0, 1], [a.pitch ?? 0, b.pitch ?? 0]);
    bearingBase = safeInterpolate(t, [0, 1], [a.bearing ?? 0, b.bearing ?? scene.end.bearing ?? 0]);
  }

  // Cinematic micro-zoom hold after the last waypoint
  const microZoom = safeInterpolate(frame, [animEnd, FRAMES], [0, 0.18], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  let zoom = zoomBase + microZoom;
  let pitch = pitchBase;
  let bearing = bearingBase;

  // ── B3: Camera follows route ─────────────────────────────────────────
  // When enabled, override lon/lat with the current icon position along
  // the route during the draw animation. Zoom stays driven by waypoints
  // (so the user can still tighten in as the journey progresses).
  if (scene.route?.followCamera && scene.route.enabled !== false && scene.route.coordinates.length > 1) {
    const r = scene.route;
    const drawEnd = Math.max(1, Math.round((r.drawDuration ?? 0.7) * FRAMES));
    const rawProgress = Math.max(0, Math.min(1, frame / drawEnd));
    // Match the icon/line ease so the camera glides with the vehicle instead
    // of lurching between vertices.
    const progress =
      rawProgress < 0.5
        ? 4 * rawProgress * rawProgress * rawProgress
        : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;
    const s = sampleRouteAt(r.coordinates, progress);
    longitude = s.lon;
    latitude = s.lat;
  }

  // Highlight region opacity (with breathing pulse on hold)
  const highlightAlpha = safeInterpolate(
    frame,
    [beats.hold, beats.breathe],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const pulse = 0.5 + 0.5 * Math.sin((frame - beats.breathe) / 6);
  const highlightBorderOp = highlightAlpha;
  const highlightGlowOp = highlightAlpha * (0.55 + 0.1 * pulse);

  // Package (default) font for all labels. Per-label overrides shadow this
  // inside scene.labels.map via label.fontFamily (#5).
  const fontFamilyBase = `'${fonts.primary.family}', 'Inter', Arial, sans-serif`;
  const fontFamily = fontFamilyBase;
  const isTransparent = scene.transparentBg === true;

  // Empty Mapbox style: no tiles, fully transparent background. Used in
  // overlay mode so the highlight + labels float alone on alpha — perfect
  // for compositing in DaVinci Resolve over your own footage.
  const EMPTY_STYLE: any = {
    version: 8,
    sources: {},
    layers: [
      {
        id: "_transparent_bg",
        type: "background",
        paint: { "background-color": "rgba(0,0,0,0)" },
      },
    ],
  };
  const effectiveStyle = isTransparent ? EMPTY_STYLE : scene.mapStyleUrl;

  // Quantize camera props: prevents floating-point noise from triggering unnecessary
  // tile re-fetches between frames (5dp ≈ 1 m at equator, invisible at any zoom).
  const qLon     = Math.round(longitude * 1e5) / 1e5;
  const qLat     = Math.round(latitude  * 1e5) / 1e5;
  const qZoom    = Math.round(zoom      * 1e4) / 1e4;
  const qPitch   = Math.round(pitch   * 10) / 10;
  const qBearing = Math.round(bearing * 10) / 10;

  return (
    <AbsoluteFill style={{ background: isTransparent ? "transparent" : "#06080f" }}>
      <Map
        // Force a clean style reload when the base map changes. react-map-gl's
        // in-place setStyle() uses a diff that silently fails once custom
        // sources/layers exist (a pinned highlight or route), so switching the
        // base style would otherwise appear to do nothing. Keying on the style
        // identity remounts the map for a guaranteed switch. The key is stable
        // for the duration of a render (mapStyleUrl never changes mid-render),
        // so this never remounts during actual frame rendering.
        key={isTransparent ? "ps-style-transparent" : scene.mapStyleUrl}
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={effectiveStyle}
        longitude={qLon}
        latitude={qLat}
        zoom={qZoom}
        bearing={qBearing}
        pitch={qPitch}
        // ── Render-perf tuning ─────────────────────────────────────────
        // Larger tile cache + aggressive prefetch hugely cuts per-frame
        // tile re-fetch latency. For a 5-second pan that crosses ~200 tiles
        // this drops "Failed to fetch" Mapbox errors from common → rare.
        maxTileCacheSize={1000}
        // ── 3D terrain (wobble-free — smoothstep fade + stable prop) ──
        // Three fixes vs. the naive impl:
        //   (1) Smoothstep fade (zero derivatives at endpoints) instead of
        //       linear clamp — no visible kink as zoom crosses the boundary.
        //   (2) ALWAYS pass terrain prop when enabled (never undefined).
        //       Toggling terrain on/off re-initializes Mapbox's DEM source
        //       which causes the visible "pop" every frame.
        //   (3) Exaggeration ramps from 0 (zoom ≤6) → full (zoom ≥10) over
        //       a wider, smoother window — eliminates LOD-swap stutter.
        terrain={
          scene.terrain?.enabled
            ? {
                source: "mapbox-dem",
                // Quantize to 0.05 so tiny per-frame deltas don't re-tile.
                exaggeration: quantizeExag(
                  scene.terrain.exaggeration * smoothstep((zoom - 6) / 4),
                ),
              }
            : undefined
        }
        // Disable Mapbox's symbol crossfade — eliminates flicker when
        // terrain LOD swaps between zoom levels.
        fadeDuration={0}
        style={{
          width: spec.width,
          height: spec.height,
          cursor: pickerActive ? "crosshair" : "default",
        }}
        onLoad={onMapLoad}
        onIdle={onMapIdle}
        onClick={(e: any) => {
          if (!pickerActive) return;
          const lng = e?.lngLat?.lng;
          const lat = e?.lngLat?.lat;
          if (typeof lng === "number" && typeof lat === "number") {
            (useStudio as any).getState().resolvePick(lng, lat);
          }
        }}
        interactive={pickerActive}
        attributionControl={false}
        renderWorldCopies={false}
        projection={{ name: "mercator" }}
      >
        {/* ── 3D terrain DEM source (terrain prop on <Map> uses this) ── */}
        {scene.terrain?.enabled && !isTransparent && (
          <Source
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
        )}

        {/* ── 3D buildings — fill-extrusion from streets composite source ── */}
        {scene.show3dBuildings && !isTransparent && (
          <Layer
            id="3d-buildings"
            source="composite"
            source-layer="building"
            type="fill-extrusion"
            minzoom={12}
            filter={["==", ["get", "extrude"], "true"]}
            paint={{
              "fill-extrusion-color": "#aaa",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.6,
            }}
          />
        )}

        {/* ── Highlights — N polygons, each with own style + animation + label ── */}
        {((scene.highlights ?? (scene.highlight ? [scene.highlight] : []))).map(
          (h, hi) => {
            if (!h?.geojson) return null;
            if (h.enabled === false) return null;
            const data =
              h.geojson.type === "FeatureCollection" || h.geojson.type === "Feature"
                ? h.geojson
                : { type: "Feature", geometry: h.geojson, properties: {} };

            // Per-highlight animation curve. If `h.fade` is set, use that
            // window; else fall back to the global beats [hold, breathe].
            // Lets the user stagger reveals: Germany at 30%, Poland at 50%…
            let a: number;
            if (h.fade) {
              const fInFrames = Math.round(h.fade.in * FRAMES);
              const fOutFrames = Math.round(h.fade.out * FRAMES);
              a = safeInterpolate(
                frame,
                [fInFrames, fInFrames + 8, fOutFrames - 8, fOutFrames],
                [0, 1, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
            } else {
              a = highlightAlpha;
            }
            const anim = h.animationStyle ?? "fade";

            // Paint overrides per animation style
            let borderPaint: any = {};
            let fillPaint: any = {};
            let glowPaint: any = {};
            if (anim === "static") {
              borderPaint = { "line-opacity": 1, "line-width": h.style.borderWidth };
              fillPaint   = { "fill-opacity": h.style.fillOpacity };
              glowPaint   = { "line-opacity": 0.55 };
            } else if (anim === "sweep") {
              // Border DRAWS around the perimeter via line-trim-offset.
              // Fill comes in after the border is mostly drawn.
              borderPaint = {
                "line-opacity": a > 0 ? 1 : 0,
                "line-width": h.style.borderWidth,
                "line-trim-offset": [0, Math.max(0, 1 - a)] as [number, number],
              };
              const fillDelay = Math.max(0, (a - 0.6) / 0.4);
              fillPaint   = { "fill-opacity": fillDelay * h.style.fillOpacity };
              glowPaint   = {
                "line-opacity": a * 0.55,
                "line-trim-offset": [0, Math.max(0, 1 - a)] as [number, number],
              };
            } else if (anim === "pulse-in") {
              // Border GROWS in width as opacity ramps up (energetic entry)
              borderPaint = {
                "line-opacity": a,
                "line-width": a * h.style.borderWidth,
              };
              fillPaint   = { "fill-opacity": a * h.style.fillOpacity };
              glowPaint   = { "line-opacity": a * (0.55 + 0.15 * pulse) };
            } else if (anim === "border-first") {
              // Border full at 50%, fill kicks in after
              const borderRamp = Math.min(1, a / 0.5);
              const fillRamp = Math.max(0, (a - 0.5) / 0.5);
              borderPaint = {
                "line-opacity": borderRamp,
                "line-width": h.style.borderWidth,
              };
              fillPaint   = { "fill-opacity": fillRamp * h.style.fillOpacity };
              glowPaint   = { "line-opacity": borderRamp * 0.55 };
            } else {
              // "fade" — simple synchronized fade using the per-h alpha
              borderPaint = {
                "line-opacity": a,
                "line-width": h.style.borderWidth,
              };
              fillPaint   = { "fill-opacity": a * h.style.fillOpacity };
              glowPaint   = { "line-opacity": a * (0.55 + 0.1 * pulse) };
            }

            return (
              <Source key={`hl-${hi}`} id={`highlight-${hi}`} type="geojson" data={data}>
                <Layer
                  id={`highlight-${hi}-glow`}
                  type="line"
                  paint={{
                    "line-color": h.style.glowColor,
                    "line-width": h.style.glowWidth,
                    "line-blur": h.style.glowBlur,
                    ...glowPaint,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
                <Layer
                  id={`highlight-${hi}-fill`}
                  type="fill"
                  paint={{
                    // Textured fills (hatch/dots/stripes) use a registered
                    // fill-pattern tile; "solid" (or unset) uses a flat color.
                    ...(h.style.fillType && h.style.fillType !== "solid"
                      ? { "fill-pattern": patternImageId(h.style.fillType, h.style.fillColor) }
                      : { "fill-color": h.style.fillColor }),
                    ...fillPaint,
                  }}
                />
                <Layer
                  id={`highlight-${hi}-border`}
                  type="line"
                  paint={{ "line-color": h.style.borderColor, ...borderPaint }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
              </Source>
            );
          },
        )}

        {/* ── C2: Animated arrows (curved line between two points) ── */}
        {(scene.arrows ?? []).map((arrow, ai) => {
          const fade = arrow.fade ?? { in: 0.2, out: 1 };
          const fadeInF = Math.round(fade.in * FRAMES);
          const fadeOutF = Math.round(fade.out * FRAMES);
          const op = safeInterpolate(frame, [fadeInF, fadeInF + 6, fadeOutF - 6, fadeOutF], [0, 1, 1, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          if (op < 0.01) return null;
          // Bezier-like arc via great-circle samples + curvature offset
          // Build N samples along great-circle, then offset each toward
          // the perpendicular for the curvature lift.
          const N = 48;
          const curv = arrow.curvature ?? 0.4;
          const samples: [number, number][] = [];
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            // Linear lerp + perpendicular offset
            const lon = arrow.from.lon + (arrow.to.lon - arrow.from.lon) * t;
            const lat = arrow.from.lat + (arrow.to.lat - arrow.from.lat) * t;
            // Perpendicular vector (rotated 90° in lon/lat space)
            const dx = arrow.to.lon - arrow.from.lon;
            const dy = arrow.to.lat - arrow.from.lat;
            const len = Math.sqrt(dx * dx + dy * dy);
            const px = -dy / Math.max(0.001, len);
            const py = dx / Math.max(0.001, len);
            const lift = 4 * curv * t * (1 - t) * len; // peak at midpoint
            samples.push([lon + px * lift, lat + py * lift]);
          }
          const drawProgress = safeInterpolate(
            frame,
            [fadeInF, fadeInF + Math.round((arrow.drawDuration ?? 0.5) * FRAMES)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const trimEnd = 1 - drawProgress;
          return (
            <Source
              key={`arrow-${ai}`}
              id={`arrow-${ai}`}
              type="geojson"
              data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: samples } }}
            >
              <Layer
                id={`arrow-${ai}-casing`}
                type="line"
                paint={{
                  "line-color": "#000",
                  "line-width": arrow.width * 1.8,
                  "line-opacity": 0.5 * op,
                  "line-trim-offset": [0, trimEnd] as [number, number],
                }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
              <Layer
                id={`arrow-${ai}-line`}
                type="line"
                paint={{
                  "line-color": arrow.color,
                  "line-width": arrow.width,
                  "line-opacity": op,
                  "line-trim-offset": [0, trimEnd] as [number, number],
                }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
            </Source>
          );
        })}

        {/* ── Animated route ──────────────────────────────────────────
            Four animation styles:
              - "draw"        → line-trim-offset progressive reveal
              - "fade"        → whole line, opacity fades 0→1
              - "dotted-flow" → animated dash-array offset (continuous flow)
              - "static"      → fully visible from frame 0

            A faint ghost line is ALWAYS rendered underneath at full extent
            so the user can see the path even before the animation starts.
        */}
        {scene.route && scene.route.enabled !== false && scene.route.coordinates.length > 1 && (() => {
          const r = scene.route;
          const style = r.animationStyle ?? "draw";
          const drawEnd = Math.max(1, Math.round((r.drawDuration ?? 0.7) * FRAMES));
          const rawProgress = Math.max(0, Math.min(1, frame / drawEnd));
          // Ease-in-out cubic — the line ACCELERATES out of the origin and
          // DECELERATES into the destination, the way a deliberate camera move
          // does. Linear felt mechanical; pure easeOut started too fast. This
          // SAME curve drives the vehicle icon below so head + line never desync.
          const progress =
            rawProgress < 0.5
              ? 4 * rawProgress * rawProgress * rawProgress
              : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;
          // Subtle alpha breathing on the colored line after fully drawn —
          // adds "life" without being distracting.
          const breathe = rawProgress >= 1
            ? 0.92 + 0.08 * Math.sin((frame - drawEnd) / 9)
            : 1;

          const routeData = {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: r.coordinates },
          };

          // Leading "comet" head — a glowing dot riding the tip of the drawn
          // line while it's still being revealed. This is the single biggest
          // upgrade to the cheap-looking reveal: the eye follows a bright,
          // moving point instead of an abstract growing line. Hidden once the
          // line is fully drawn (and skipped for fade/static styles).
          const drawing = style === "draw" && rawProgress < 1;
          const head = drawing ? sampleRouteAt(r.coordinates, progress) : null;
          const headData = head
            ? {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "Point" as const, coordinates: [head.lon, head.lat] },
              }
            : null;
          const headPulse = 1 + 0.18 * Math.sin(frame / 4);

          const baseOpacity =
            style === "fade" ? progress :
            style === "static" ? 1 :
            1;
          const trimPaint =
            style === "draw"
              ? { "line-trim-offset": [0, 1 - progress] as [number, number] }
              : {};
          const dashFlowPaint =
            style === "dotted-flow"
              ? {
                  "line-dasharray": [
                    Math.max(0.01, 1 - (frame % 12) / 12),
                    1.5,
                  ] as [number, number],
                }
              : r.style.dashed
                ? { "line-dasharray": [2, 1] as [number, number] }
                : {};

          return (
            <>
              {/* ── GHOST (always visible) ──────────────────────────────
                  3-stop stack: dark wide casing → BRIGHT WHITE halo →
                  colored core. The white halo guarantees visibility against
                  any basemap (dark, light, satellite imagery) regardless
                  of how the user's route color was set. */}
              <Source id="route-ghost" type="geojson" data={routeData}>
                <Layer
                  id="route-ghost-casing"
                  type="line"
                  paint={{
                    "line-color": "#000000",
                    "line-width": Math.max(4, r.style.width * 1.6),
                    "line-opacity": 0.55,
                    "line-blur": 1,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
                <Layer
                  id="route-ghost-halo"
                  type="line"
                  paint={{
                    "line-color": "#ffffff",
                    "line-width": Math.max(2, r.style.width * 0.9),
                    "line-opacity": 0.4,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
                <Layer
                  id="route-ghost-line"
                  type="line"
                  paint={{
                    "line-color": r.style.color,
                    "line-width": Math.max(1, r.style.width * 0.55),
                    "line-opacity": 0.6,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
              </Source>

              {/* ── ANIMATED MAIN ROUTE ──────────────────────────────── */}
              <Source id="route-drawn" type="geojson" data={routeData}>
                <Layer
                  id="route-casing"
                  type="line"
                  paint={{
                    "line-color": r.style.casingColor,
                    "line-width": r.style.casingWidth,
                    "line-opacity": 0.9 * baseOpacity,
                    ...trimPaint,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
                <Layer
                  id="route-glow"
                  type="line"
                  paint={{
                    "line-color": r.style.glowColor,
                    "line-width": r.style.glowWidth,
                    "line-blur": 10,
                    "line-opacity": 0.75 * baseOpacity,
                    ...trimPaint,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
                <Layer
                  id="route-line"
                  type="line"
                  paint={{
                    "line-color": r.style.color,
                    "line-width": r.style.width,
                    "line-opacity": baseOpacity * breathe,
                    ...trimPaint,
                    ...dashFlowPaint,
                  }}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                />
              </Source>

              {/* ── LEADING COMET HEAD (draw style only, while drawing) ──
                  Three stacked circles: a soft wide glow, a colored mid ring,
                  and a bright white core. Rides the line tip via arc-length
                  sampling so it moves at constant speed and tracks the exact
                  point the line has reached. */}
              {headData && (
                <Source id="route-head" type="geojson" data={headData}>
                  <Layer
                    id="route-head-glow"
                    type="circle"
                    paint={{
                      "circle-radius": Math.max(10, r.style.width * 2.6) * headPulse,
                      "circle-color": r.style.glowColor,
                      "circle-opacity": 0.35,
                      "circle-blur": 1,
                    }}
                  />
                  <Layer
                    id="route-head-ring"
                    type="circle"
                    paint={{
                      "circle-radius": Math.max(5, r.style.width * 1.3) * headPulse,
                      "circle-color": r.style.color,
                      "circle-opacity": 0.95,
                    }}
                  />
                  <Layer
                    id="route-head-core"
                    type="circle"
                    paint={{
                      "circle-radius": Math.max(2, r.style.width * 0.6),
                      "circle-color": "#ffffff",
                      "circle-opacity": 1,
                    }}
                  />
                </Source>
              )}
            </>
          );
        })()}
      </Map>

      {/* ── Highlight labels — projected to screen at polygon centroid ── */}
      {((scene.highlights ?? (scene.highlight ? [scene.highlight] : []))).map(
        (h, hi) => {
          if (!h?.label?.text) return null;
          const fade = h.label.fade ?? { in: scene.beats.hold, out: 1 };
          const fadeInF = Math.round(fade.in * FRAMES);
          const fadeOutF = Math.round(fade.out * FRAMES);
          const labelOp = safeInterpolate(
            frame,
            [fadeInF, fadeInF + 8, fadeOutF - 8, fadeOutF],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (labelOp < 0.01) return null;

          // Resolve anchor → [lon, lat]
          let anchorPoint: [number, number];
          const a = h.label.anchor ?? "centroid";
          const centroid = centroidOf(h.geojson);
          if (typeof a === "object" && "lon" in a) {
            anchorPoint = [a.lon, a.lat];
          } else if (a === "top") {
            // top of bbox: highest latitude
            const allPts = (h.geojson?.coordinates?.flat?.(Infinity) ?? []) as number[];
            const lats: number[] = [];
            for (let i = 1; i < allPts.length; i += 2) lats.push(allPts[i]);
            anchorPoint = [centroid[0], lats.length ? Math.max(...lats) : centroid[1]];
          } else if (a === "bottom") {
            const allPts = (h.geojson?.coordinates?.flat?.(Infinity) ?? []) as number[];
            const lats: number[] = [];
            for (let i = 1; i < allPts.length; i += 2) lats.push(allPts[i]);
            anchorPoint = [centroid[0], lats.length ? Math.min(...lats) : centroid[1]];
          } else {
            anchorPoint = centroid;
          }

          const proj = mapRef.current?.getMap()?.project(anchorPoint);
          const x = proj ? proj.x : spec.width / 2;
          const y = proj ? proj.y : spec.height / 2;

          const ls = h.label.style ?? {};
          const size = ls.size ?? labelTypography.titleSize * 0.55;
          const subSize = ls.subSize ?? labelTypography.subSize * 0.7;
          const color = ls.color ?? "#ffffff";
          const subColor = ls.subColor ?? h.style.borderColor;
          const spacing = ls.spacing ?? labelTypography.titleSpacing * 0.7;
          const weight = ls.weight ?? 300;

          return (
            <div
              key={`hl-label-${hi}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                opacity: labelOp,
                pointerEvents: "none",
                textAlign: "center",
                whiteSpace: "nowrap",
                textShadow: "0 2px 12px rgba(0,0,0,0.85), 0 0 30px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: size,
                  fontWeight: weight,
                  letterSpacing: spacing,
                  color,
                  lineHeight: 1,
                }}
              >
                {h.label.text}
              </div>
              {h.label.sub && (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily,
                    fontSize: subSize,
                    fontWeight: 300,
                    letterSpacing: spacing * 0.5,
                    color: subColor,
                    opacity: 0.92,
                  }}
                >
                  {h.label.sub}
                </div>
              )}
            </div>
          );
        },
      )}

      {/* ── Flag badges — "this is country X" chip at the polygon anchor ── */}
      {((scene.highlights ?? (scene.highlight ? [scene.highlight] : []))).map(
        (h, hi) => {
          if (h.enabled === false) return null;
          const flag = h.flag;
          const iso = (flag?.iso || h.countryISO || "").toLowerCase();
          if (!flag?.show || !iso) return null;

          // Fade with the highlight's own window (or global hold→end).
          const fade = h.fade ?? { in: scene.beats.hold, out: 1 };
          const fadeInF = Math.round(fade.in * FRAMES);
          const fadeOutF = Math.round(fade.out * FRAMES);
          const op = safeInterpolate(
            frame,
            [fadeInF, fadeInF + 8, fadeOutF - 8, fadeOutF],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (op < 0.01) return null;

          // Anchor → [lon, lat] (centroid / top / bottom of the polygon).
          const centroid = centroidOf(h.geojson);
          const anchor = flag.anchor ?? "centroid";
          let anchorPoint: [number, number] = centroid;
          if (anchor === "top" || anchor === "bottom") {
            const allPts = (h.geojson?.coordinates?.flat?.(Infinity) ?? []) as number[];
            const lats: number[] = [];
            for (let i = 1; i < allPts.length; i += 2) lats.push(allPts[i]);
            if (lats.length) {
              anchorPoint = [centroid[0], anchor === "top" ? Math.max(...lats) : Math.min(...lats)];
            }
          }
          const proj = mapRef.current?.getMap()?.project(anchorPoint);
          const x = proj ? proj.x : spec.width / 2;
          const y = proj ? proj.y : spec.height / 2;

          const w = flag.size ?? 220;
          const fh = Math.round(w * 0.66); // flags ~3:2
          const showCode = flag.showCode !== false;

          return (
            <div
              key={`hl-flag-${hi}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                opacity: op,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                gap: Math.round(w * 0.09),
                padding: `${Math.round(w * 0.06)}px ${Math.round(w * 0.1)}px`,
                borderRadius: Math.round(w * 0.07),
                background: "rgba(6,8,15,0.82)",
                border: `2px solid ${h.style.borderColor}`,
                boxShadow: `0 10px 40px rgba(0,0,0,0.55), 0 0 ${Math.round(w * 0.18)}px ${h.style.borderColor}40`,
                backdropFilter: "blur(6px)",
              }}
            >
              <Img
                src={`https://flagcdn.com/w320/${iso}.png`}
                style={{
                  width: w,
                  height: fh,
                  borderRadius: Math.round(w * 0.035),
                  objectFit: "cover",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
                }}
              />
              {showCode && (
                <span
                  style={{
                    fontFamily,
                    fontSize: Math.round(w * 0.26),
                    fontWeight: 700,
                    letterSpacing: Math.round(w * 0.02),
                    color: "#ffffff",
                    textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                  }}
                >
                  {iso.toUpperCase()}
                </span>
              )}
            </div>
          );
        },
      )}

      {/* ── C1: Photo pins (image markers anchored at coordinates) ── */}
      {(scene.photoPins ?? []).map((pin, pi) => {
        const fade = pin.fade ?? { in: 0.3, out: 1 };
        const fadeInF = Math.round(fade.in * FRAMES);
        const fadeOutF = Math.round(fade.out * FRAMES);
        const op = safeInterpolate(frame, [fadeInF, fadeInF + 8, fadeOutF - 8, fadeOutF], [0, 1, 1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        if (op < 0.01) return null;
        const proj = mapRef.current?.getMap()?.project([pin.lon, pin.lat]);
        if (!proj) return null;
        const size = pin.size ?? 180;
        const scale = safeInterpolate(frame, [fadeInF, fadeInF + 12], [0.7, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        return (
          <div
            key={`photo-pin-${pi}`}
            style={{
              position: "absolute",
              left: proj.x,
              top: proj.y - size / 2 - 20, // hovers above the anchor
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity: op,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: size,
                height: size,
                borderRadius: "50%",
                overflow: "hidden",
                border: `${Math.round(size / 30)}px solid #ffffff`,
                boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 0 0 2px rgba(0,0,0,0.3)",
                background: "#222",
              }}
            >
              <img
                src={pin.url}
                alt={pin.name}
                width={size}
                height={size}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            {pin.caption && (
              <div
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  fontFamily,
                  fontSize: Math.round(size * 0.13),
                  fontWeight: 500,
                  color: "#fff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {pin.caption}
              </div>
            )}
            {/* Small triangle pointing down to the anchor */}
            <div style={{
              position: "absolute",
              left: "50%",
              top: "100%",
              transform: "translate(-50%, -3px)",
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "10px solid #fff",
              filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.5))",
            }} />
          </div>
        );
      })}

      {/* ── Per-stop markers: each PINGS once as the route reaches it ──────
          The old version pulsed every marker forever (the "cheap" tell). Now
          each stop computes WHEN the drawing line arrives at it (its fraction
          along the path), drops in with a one-shot expanding ping ring, then
          holds steady — so markers light up in sequence with the reveal. */}
      {scene.route && scene.route.enabled !== false && scene.route.showStopMarkers !== false && (() => {
        const r = scene.route;
        const stops = [r.from, ...(r.via ?? []), r.to];
        const coords = r.coordinates;
        const drawEnd = Math.max(1, Math.round((r.drawDuration ?? 0.7) * FRAMES));

        // Cumulative distance along the resolved path → fraction lookup.
        const cum: number[] = [0];
        for (let i = 1; i < coords.length; i++) {
          cum.push(cum[i - 1] + Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]));
        }
        const total = cum[cum.length - 1] || 1;
        const fracForStop = (lon: number, lat: number) => {
          let best = 0, bestD = Infinity;
          for (let i = 0; i < coords.length; i++) {
            const d = Math.hypot(coords[i][0] - lon, coords[i][1] - lat);
            if (d < bestD) { bestD = d; best = i; }
          }
          return cum[best] / total;
        };

        return stops.map((stop, si) => {
          const proj = mapRef.current?.getMap()?.project([stop.lon, stop.lat]);
          if (!proj) return null;
          // First + last anchor at frame 0; intermediate stops arrive mid-draw.
          const arriveFrame = si === 0 ? 0 : Math.round(fracForStop(stop.lon, stop.lat) * drawEnd);
          if (frame < arriveFrame - 2) return null; // not reached yet

          // Drop-in opacity + scale as the line arrives.
          const op = safeInterpolate(frame, [arriveFrame, arriveFrame + 8], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const dropScale = safeInterpolate(frame, [arriveFrame, arriveFrame + 10], [0.4, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          // One-shot ping ring: expands 14→40 and fades out over ~22 frames.
          const pingT = (frame - arriveFrame) / 22;
          const showPing = pingT >= 0 && pingT <= 1;
          const pingR = 14 + 26 * pingT;
          const pingOp = showPing ? (1 - pingT) * 0.7 : 0;
          const baseR = 14;
          return (
            <div
              key={`stop-marker-${si}`}
              style={{
                position: "absolute",
                left: proj.x,
                top: proj.y,
                transform: `translate(-50%, -50%) scale(${dropScale})`,
                opacity: op,
                pointerEvents: "none",
              }}
            >
              <svg width={100} height={100} viewBox="0 0 100 100" style={{ display: "block" }}>
                {showPing && (
                  <circle cx="50" cy="50" r={pingR} fill="none" stroke={r.style.color} strokeWidth="2.5" opacity={pingOp} />
                )}
                <circle cx="50" cy="50" r={baseR} fill={r.style.color} />
                <circle cx="50" cy="50" r={baseR} fill="none" stroke={r.style.casingColor} strokeWidth="2" />
                <text
                  x="50" y="50"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="14"
                  fontWeight="700"
                  fill={r.style.casingColor}
                  fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
                >
                  {si + 1}
                </text>
              </svg>
            </div>
          );
        });
      })()}

      {/* Route vehicle icon — projected to screen + rotated to bearing */}
      {scene.route && scene.route.enabled !== false && scene.route.icon?.show && scene.route.coordinates.length > 1 && (() => {
        const r = scene.route;
        const drawEnd = Math.max(1, Math.round((r.drawDuration ?? 0.7) * FRAMES));
        const rawProgress = Math.max(0, Math.min(1, frame / drawEnd));
        // Use the SAME ease-in-out curve as the line draw so the vehicle sits
        // exactly on the line tip throughout the reveal (no lead/lag).
        const progress =
          rawProgress < 0.5
            ? 4 * rawProgress * rawProgress * rawProgress
            : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;
        // Arc-length sample → constant-speed motion + interpolated heading.
        const s = sampleRouteAt(r.coordinates, progress);
        const proj = mapRef.current?.getMap()?.project([s.lon, s.lat]);
        if (!proj) return null;
        const bearing = s.bearing;
        const size = r.icon.size ?? 96;
        return (
          <div
            style={{
              position: "absolute",
              left: proj.x - size / 2,
              top: proj.y - size / 2,
              width: size,
              height: size,
              transform: `rotate(${r.icon.preset === "aircraft" ? bearing : 0}deg)`,
              pointerEvents: "none",
              filter: `drop-shadow(0 4px 12px rgba(0,0,0,0.6))`,
            }}
          >
            <RouteIcon
              preset={r.icon.preset}
              customUrl={r.icon.customUrl}
              size={size}
              color={r.style.color}
              casing={r.style.casingColor}
            />
          </div>
        );
      })()}

      {/* Labels */}
      {scene.labels.map((label, i) => {
        if (label.enabled === false) return null;
        // Fade in / out, each optional. fadeIn=false → hard cut in;
        // fadeOut=false → hold on screen to the end (no out animation).
        const inA = label.primaryInFrame;
        const inB = inA + (label.fadeIn === false ? 0.001 : 6);
        const noOut = label.fadeOut === false;
        const outA = noOut ? FRAMES + 100 : label.primaryOutFrame;
        const outB = noOut ? FRAMES + 101 : label.primaryOutFrame + 8;
        const labelOp = safeInterpolate(
          frame,
          [inA, inB, outA, outB],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        if (labelOp < 0.01) return null;

        // Per-label font override (#5): every label defaults to the style
        // package's primary font, but may pick its own via label.fontFamily.
        // Shadows the outer `fontFamily` so all label chrome below uses it.
        const fontFamily = label.fontFamily
          ? `'${label.fontFamily}', 'Inter', Arial, sans-serif`
          : fontFamilyBase;

        // ── New variant: tracked-card / stat-counter / lowerthird ──
        // These all anchor at projectLon/projectLat (like city-projected)
        // but render different chrome. Share the projection lookup.
        const isNewTracked =
          (label.layout === "tracked-card" ||
            label.layout === "stat-counter" ||
            label.layout === "lowerthird") &&
          label.projectLon != null;

        if (isNewTracked) {
          const proj = mapRef.current
            ?.getMap()
            ?.project([label.projectLon!, label.projectLat!]);
          const x = proj ? proj.x : spec.width / 2;
          const y = proj ? proj.y : spec.height / 2;
          const accent = label.accentColor ?? palette.borderColor;

          if (label.layout === "stat-counter") {
            // Animate counter from 0 → counterValue using the same eased
            // progress as the global animation. Looks like a tracked KPI badge.
            const target = label.counterValue ?? 0;
            const count = Math.round(target * labelOp);
            return (
              <div
                key={i}
                style={{
                  position: "absolute", left: x, top: y,
                  transform: "translate(-50%, -50%)", opacity: labelOp,
                  pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap",
                }}
              >
                <div style={{
                  display: "inline-flex", flexDirection: "column", alignItems: "center",
                  padding: "16px 28px", borderRadius: 12,
                  background: "rgba(6,8,15,0.85)", backdropFilter: "blur(8px)",
                  border: `2px solid ${accent}`,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${accent}33`,
                }}>
                  <div style={{
                    fontFamily, fontSize: 64, fontWeight: 700,
                    color: accent, lineHeight: 1, letterSpacing: 1,
                  }}>
                    {label.counterPrefix ?? ""}{count.toLocaleString()}{label.counterSuffix ?? ""}
                  </div>
                  {label.primary && (
                    <div style={{
                      marginTop: 6, fontFamily, fontSize: 18, fontWeight: 400,
                      color: "rgba(255,255,255,0.85)", letterSpacing: 4,
                      textTransform: "uppercase",
                    }}>
                      {label.primary}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (label.layout === "lowerthird") {
            // Lower-third style card — accent bar + name + role
            const slideX = safeInterpolate(frame, [label.primaryInFrame, label.primaryInFrame + 12], [-30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div
                key={i}
                style={{
                  position: "absolute", left: x, top: y,
                  transform: `translate(0, 8px) translateX(${slideX}px)`,
                  opacity: labelOp, pointerEvents: "none", whiteSpace: "nowrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                  <div style={{
                    width: 6, background: accent,
                    boxShadow: `0 0 16px ${accent}cc`,
                  }} />
                  <div style={{
                    padding: "12px 22px",
                    background: "rgba(6,8,15,0.85)",
                    backdropFilter: "blur(8px)",
                  }}>
                    <div style={{
                      fontFamily, fontSize: 32, fontWeight: 500,
                      color: "#fff", lineHeight: 1.1,
                    }}>{label.primary}</div>
                    {label.secondary && (
                      <div style={{
                        marginTop: 4, fontFamily, fontSize: 16, fontWeight: 300,
                        color: accent, letterSpacing: 2, textTransform: "uppercase",
                      }}>{label.secondary}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // tracked-card — soft pill with primary + secondary
          return (
            <div
              key={i}
              style={{
                position: "absolute", left: x, top: y,
                transform: "translate(-50%, -120%)", opacity: labelOp,
                pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap",
              }}
            >
              <div style={{
                padding: "10px 18px", borderRadius: 8,
                background: "rgba(6,8,15,0.85)", backdropFilter: "blur(6px)",
                border: `1px solid ${accent}66`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}>
                <div style={{ fontFamily, fontSize: 28, fontWeight: 500, color: "#fff", lineHeight: 1.1 }}>
                  {label.primary}
                </div>
                {label.secondary && (
                  <div style={{
                    marginTop: 3, fontFamily, fontSize: 14, fontWeight: 300,
                    color: accent, letterSpacing: 1.5,
                  }}>{label.secondary}</div>
                )}
              </div>
            </div>
          );
        }

        if (label.layout === "city-projected" && label.projectLon != null) {
          const proj = mapRef.current
            ?.getMap()
            ?.project([label.projectLon, label.projectLat!]);
          const x = proj ? proj.x : spec.width / 2;
          const y = proj ? proj.y : spec.height / 2;

          return (
            <React.Fragment key={i}>
              <svg
                viewBox={`0 0 ${spec.width} ${spec.height}`}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  opacity: labelOp,
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={56}
                  fill="none"
                  stroke={palette.ringColor}
                  strokeWidth={3}
                  opacity={0.55}
                />
                <circle cx={x} cy={y} r={18} fill={palette.dotColor} />
                <circle
                  cx={x}
                  cy={y}
                  r={18}
                  fill="none"
                  stroke={palette.borderColor}
                  strokeWidth={3}
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: `${(x / spec.width) * 100}%`,
                  top: `${(y / spec.height) * 100}%`,
                  transform: "translate(-50%, -260%)",
                  opacity: labelOp,
                  pointerEvents: "none",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                <div
                  style={{
                    fontFamily,
                    fontSize: labelTypography.titleSize * 0.7,
                    fontWeight: 200,
                    letterSpacing: labelTypography.titleSpacing,
                    color: "#ffffff",
                    textShadow: `0 2px 24px rgba(0,0,0,0.9), 0 0 60px ${palette.borderColor}4D`,
                  }}
                >
                  {label.primary}
                </div>
                {label.secondary && (
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily,
                      fontSize: labelTypography.subSize * 0.85,
                      fontWeight: 300,
                      letterSpacing: labelTypography.subSpacing * 0.7,
                      color: "rgba(255,255,255,0.7)",
                      textShadow: "0 1px 10px rgba(0,0,0,0.85)",
                    }}
                  >
                    {label.secondary}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        }

        // bottom-banner
        const slideY = safeInterpolate(
          frame,
          [label.primaryInFrame, label.primaryInFrame + 12],
          [14, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "12%",
              transform: `translateX(-50%) translateY(${slideY}px)`,
              opacity: labelOp,
              pointerEvents: "none",
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "26px 72px",
                border: `1.5px solid ${palette.borderColor}aa`,
                background: "rgba(6,8,15,0.55)",
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: labelTypography.titleSize,
                  fontWeight: labelTypography.titleWeight,
                  letterSpacing: labelTypography.titleSpacing,
                  color: "#ffffff",
                  textShadow: `0 2px 18px rgba(0,0,0,0.9), 0 0 50px ${palette.borderColor}59`,
                }}
              >
                {label.primary}
              </div>
              {label.secondary && (
                <div
                  style={{
                    marginTop: 14,
                    fontFamily,
                    fontSize: labelTypography.subSize,
                    fontWeight: 300,
                    letterSpacing: labelTypography.subSpacing,
                    color: palette.borderColor,
                    opacity: 0.92,
                  }}
                >
                  {label.secondary}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Letterbox (skipped in transparent overlay mode) */}
      {!isTransparent && letterboxHeight > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: letterboxHeight,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: letterboxHeight,
              background:
                "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
