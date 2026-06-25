"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender, getRemotionEnvironment, Img,
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
  AnnotationLayer, ConnectionsLayer, SpotlightLayer, TrackLayer, ChoroplethLayer, BubbleLayer, Theme, Look,
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

/* ── Theme (fonts) propagation ────────────────────────────────────────────────
   The project theme provides the default display/body fonts every text layer
   uses unless it sets its own `fontFamily`. Passed via context so deeply-nested
   layer views can read it without threading props through every component. */
const DEFAULT_THEME: Theme = { name: "Default", accent: "#6E7BFF", fill: "#6E7BFF", border: "#6E7BFF", glow: "#6E7BFF", text: "#ffffff", fontDisplay: "Inter", fontBody: "Inter" };
const ThemeCtx = React.createContext<Theme>(DEFAULT_THEME);
const useTheme = () => React.useContext(ThemeCtx);
/** Resolve a text layer's font: per-layer override → theme display font. */
const displayFont = (theme: Theme, override?: string | null) => fontStack(override || theme.fontDisplay);
const bodyFont = (theme: Theme, override?: string | null) => fontStack(override || theme.fontBody);

/* ── Flag-fill helpers ────────────────────────────────────────────────────── */

const flagIsoOf = (l: HighlightLayer): string => (l.flagISO || l.countryISO || "").toLowerCase();
const flagImageId = (iso: string) => `ps-flag-${iso}`;

/** The fill paint source for a highlight: pattern tile or solid color.
 *  ("flag" is rendered as a projected SVG overlay, not a Mapbox fill.) */
function fillSource(l: HighlightLayer): Record<string, unknown> {
  if (l.fillType !== "solid" && l.fillType !== "flag") return { "fill-pattern": patternImageId(l.fillType as any, l.fillColor) };
  return { "fill-color": l.fillColor };
}

/** Extract outer rings of [lon,lat] from any Polygon/MultiPolygon geojson. */
function polygonRings(geojson: any): number[][][] {
  const g = geojson?.type === "FeatureCollection" ? geojson.features?.[0]?.geometry
    : geojson?.type === "Feature" ? geojson.geometry : geojson;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates ?? [];
  if (g.type === "MultiPolygon") return (g.coordinates ?? []).flatMap((poly: any) => poly);
  return [];
}

/* ── Camera interpolation ─────────────────────────────────────────────────── */

/** Path interpolation through start → waypoints → end (used by fly-in styles). */
function pathPose(cam: CameraLayer, progress: number, reverse = false): CameraPose {
  const path = reverse ? [cam.end, ...[...cam.waypoints].reverse(), cam.start] : [cam.start, ...cam.waypoints, cam.end];
  const pick = (key: keyof CameraPose) => {
    const vals = path.map((p) => p[key] as number);
    return cam.smoothPath && vals.length >= 3 ? catmullRomChain(vals, progress) : linearChain(vals, progress);
  };
  return { lon: pick("lon"), lat: pick("lat"), zoom: pick("zoom"), pitch: pick("pitch"), bearing: pick("bearing") };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Style-aware camera pose. `p` is the eased 0→1 progress. */
function poseAt(cam: CameraLayer, p: number): CameraPose {
  const s = cam.start, e = cam.end;
  switch (cam.style) {
    case "hold":
      return { ...e };
    case "zoom-out":
      // Start tight on the place, pull back to the wider `start` framing.
      return pathPose(cam, p, true);
    case "pan": {
      // Glide laterally across the place at the end zoom.
      const span = (360 / Math.pow(2, e.zoom)) * 0.7;
      return { lon: e.lon - span / 2 + span * p, lat: e.lat, zoom: e.zoom, pitch: e.pitch, bearing: e.bearing };
    }
    case "orbit": {
      // Settle the zoom onto the place while the bearing sweeps around it.
      return { lon: e.lon, lat: e.lat, zoom: lerp(s.zoom, e.zoom, Math.min(1, p * 1.3)), pitch: Math.max(e.pitch, 40), bearing: s.bearing + p * 75 };
    }
    case "push-in": {
      // Fly in, but with a rising tilt for a dramatic dolly.
      const base = pathPose(cam, p);
      return { ...base, pitch: lerp(0, Math.max(e.pitch, 60), p) };
    }
    case "fly-in":
    default:
      return pathPose(cam, p);
  }
}

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: number, d: number) => (Number.isFinite(v) ? v : d);

/** Clamp a pose into a valid Mapbox camera envelope (no NaN/Infinity, no
 *  out-of-range zoom/pitch) so the GL transform can never become singular. */
function sanitizePose(p: CameraPose): CameraPose {
  return {
    lon: clampN(finiteOr(p.lon, 0), -180, 180),
    lat: clampN(finiteOr(p.lat, 20), -85, 85),
    zoom: clampN(finiteOr(p.zoom, 3), 0.5, 22),
    pitch: clampN(finiteOr(p.pitch, 0), 0, 84),
    bearing: finiteOr(p.bearing, 0) % 360,
  };
}

/** Bounds → Mapbox zoom that frames a set of lon/lat points (16:9-ish, padded). */
function zoomForBounds(coords: [number, number][]): number {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLon)) return 4;
  const latRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonSpan = Math.max(0.0005, (maxLon - minLon) * Math.cos(latRad));
  const latSpan = Math.max(0.0005, (maxLat - minLat) * 1.6); // aspect fudge
  const span = Math.max(lonSpan, latSpan);
  return clampN(Math.log2(360 / span) - 0.7, 1.2, 12);
}

/** Point at fraction `t` of the polyline's ARC LENGTH. Must be arc-length (not
 *  vertex-index) so the moving vehicle and follow-camera sit EXACTLY on the head
 *  of the line Mapbox draws via `line-trim-offset` (which is also arc-length).
 *  Vertices on a real route bunch up in cities, so vertex-index fraction drifts
 *  badly ahead of the drawn line — that's the car-runs-off-the-line bug. */
function pointAlong(coords: [number, number][], t: number): [number, number] {
  const n = coords.length;
  if (n === 0) return [0, 20];
  if (n === 1) return coords[0];
  // Cumulative geographic-ish distance (lon weighted by cos lat).
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < n; i++) {
    const latMid = (((coords[i][1] + coords[i - 1][1]) / 2) * Math.PI) / 180;
    const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos(latMid);
    const dy = coords[i][1] - coords[i - 1][1];
    total += Math.hypot(dx, dy);
    cum.push(total);
  }
  if (total <= 0) return coords[0];
  const target = clampN(t, 0, 1) * total;
  let i = 1;
  while (i < n - 1 && cum[i] < target) i++;
  const i0 = i - 1, i1 = i;
  const seg = cum[i1] - cum[i0] || 1;
  const k = (target - cum[i0]) / seg;
  return [lerp(coords[i0][0], coords[i1][0], k), lerp(coords[i0][1], coords[i1][1], k)];
}

const smoothstep = (x: number) => { const t = clampN(x, 0, 1); return t * t * (3 - 2 * t); };

/**
 * THE single source of truth for a route's 0→1 progress. The drawn line, the
 * moving vehicle icon, AND (when the route drives the camera) the follow camera
 * all read this — so they are perfectly in lock-step. Honors the layer's
 * entrance (`timing.inSec`) so the journey starts WHEN the route appears, and
 * its `drawFraction` (how much of the scene the travel takes). "static" is
 * instantly complete.
 */
/** Coordinates in TRAVEL order (reversed when direction = "reverse"). */
function routeCoords(l: RouteLayer): [number, number][] {
  const c = (l.coordinates as [number, number][]) ?? [];
  return l.direction === "reverse" ? [...c].reverse() : c;
}

/** Chaikin corner-cutting → smooth, bezier-like curves. Endpoints preserved. */
function chaikin(pts: [number, number][], iters: number): [number, number][] {
  let out = pts;
  for (let k = 0; k < iters; k++) {
    if (out.length < 3) break;
    const next: [number, number][] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** The geometry the line, vehicle and follow-camera all share: directed + smoothed. */
function finalRouteCoords(l: RouteLayer): [number, number][] {
  const directed = routeCoords(l);
  const sm = (l as any).smoothness ?? 0;
  if (sm <= 0 || directed.length < 3) return directed;
  return chaikin(directed, Math.round(sm * 3));
}

/** Via stops snapped to the path: their arc-length position (0..1), pause + leg
 *  weight. Cached per layer object (stable across frames until edited). */
const _routeStopCache = new WeakMap<object, { at: number; pauseSec: number; weight: number }[]>();
function routeStops(l: RouteLayer): { at: number; pauseSec: number; weight: number }[] {
  const via: any[] = (l as any).via ?? [];
  if (!via.length) return [];
  const cached = _routeStopCache.get(l as object); if (cached) return cached;
  const coords = finalRouteCoords(l);
  const cum: number[] = [0]; let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const m = (((coords[i][1] + coords[i - 1][1]) / 2) * Math.PI) / 180;
    total += Math.hypot((coords[i][0] - coords[i - 1][0]) * Math.cos(m), coords[i][1] - coords[i - 1][1]);
    cum.push(total);
  }
  const fracOf = (p: [number, number]) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const m = (((coords[i][1] + p[1]) / 2) * Math.PI) / 180;
      const d = Math.hypot((coords[i][0] - p[0]) * Math.cos(m), coords[i][1] - p[1]);
      if (d < bd) { bd = d; bi = i; }
    }
    return total > 0 ? cum[bi] / total : 0;
  };
  const stops = via
    .map((v) => ({ at: fracOf([v.lon, v.lat]), pauseSec: v.pauseSec ?? 0, weight: v.weight ?? 1 }))
    .filter((s) => s.at > 0.002 && s.at < 0.998)
    .sort((a, b) => a.at - b.at);
  _routeStopCache.set(l as object, stops);
  return stops;
}

function routeTravel(l: RouteLayer, frame: number, fps: number, totalFrames: number): number {
  // The vehicle + follow-camera always travel (over the "travel time" window) —
  // independent of how the LINE reveals. So a "static" line can still have a car
  // driving across it.
  const start = Math.round((l.timing?.inSec ?? 0) * fps);
  const dur = Math.max(1, Math.round((l.drawFraction ?? 0.6) * totalFrames));
  const e = frame - start;
  if (e <= 0) return 0;

  const stops = routeStops(l);
  if (!stops.length) return smoothstep(e / dur);

  // Multi-stop: walk the legs. Each leg's MOVING time ∝ its weight; at each
  // interior stop the path-progress HOLDS for pauseSec (extending the window).
  const bounds = [0, ...stops.map((s) => s.at), 1];
  const weights = [...stops.map((s) => s.weight), 1]; // final leg weight = 1
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  for (let i = 0; i < weights.length; i++) {
    const legFrames = Math.max(1, Math.round((dur * weights[i]) / wsum));
    if (e < t + legFrames) return lerp(bounds[i], bounds[i + 1], smoothstep((e - t) / legFrames));
    t += legFrames;
    if (i < stops.length) {
      const p = Math.max(0, Math.round((stops[i].pauseSec || 0) * fps));
      if (e < t + p) return bounds[i + 1]; // holding at the stop
      t += p;
    }
  }
  return 1;
}

/** Forward azimuth (compass bearing, deg) from point a → b. */
function geoBearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a[1]), φ2 = toRad(b[1]), Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Camera behaviour WHEN a route is the priority (top-most) layer:
 *   - "frame":  hold framed on the whole journey while the line draws.
 *   - "follow": travelling shot that tracks the moving vehicle (establish→close).
 *   - "chase":  follow + turn the bearing into the current leg for a dynamic feel.
 *  All share the route's own `travel` progress so framing, line and vehicle lock. */
function followRoutePose(route: RouteLayer, travel: number, cam?: CameraLayer): CameraPose {
  const coords = finalRouteCoords(route);
  if (!coords || coords.length < 2) return cam ? poseAt(cam, travel) : { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 };
  const mode = route.cameraMode ?? "follow";
  const frameZoom = zoomForBounds(coords);

  if (mode === "frame" || mode === "orbit") {
    // Hold on the whole journey; a gentle push-in as it draws. Centre = bbox mid.
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lo, la] of coords) { if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo; if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
    const zoom = lerp(Math.max(1.4, frameZoom - 0.6), frameZoom, smoothstep(travel));
    // "orbit" sweeps the bearing around the journey for a dramatic reveal.
    const bearing = mode === "orbit" ? (cam?.end.bearing ?? 0) + travel * 60 : (cam?.end.bearing ?? 0);
    const pitch = mode === "orbit" ? Math.max(cam?.end.pitch ?? 0, 45) : (cam?.end.pitch ?? 30);
    return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2, zoom, pitch, bearing };
  }

  const head = pointAlong(coords, clampN(travel + 0.03, 0, 1)); // slight look-ahead
  const travelZoom = clampN(frameZoom + 1.4, 2, 13);
  const settle = clampN(travel * 5, 0, 1);                      // establish (wide) → travel (close)
  const zoom = lerp(Math.max(1.4, frameZoom - 0.6), travelZoom, settle);
  let bearing = cam?.end.bearing ?? 0;
  if (mode === "chase") {
    const behind = pointAlong(coords, clampN(travel - 0.04, 0, 1));
    // Ease the heading in so the map doesn't whip-pan at the very start.
    bearing = geoBearing(behind, head) * settle;
  }
  return { lon: head[0], lat: head[1], zoom, pitch: cam?.end.pitch ?? 40, bearing };
}

/* ── Track (imported GPS flythrough) ───────────────────────────────────────── */

/** Progress 0..1 of the head along the (trimmed) track for THIS frame, scaled by
 *  the layer's speed. Drives the camera AND the drawn line so they lock together. */
function trackTravel(l: TrackLayer, frame: number, fps: number, totalFrames: number): number {
  const startF = Math.round((l.timing?.inSec ?? 0) * fps);
  const span = Math.max(1, totalFrames - startF);
  return clampN(((frame - startF) / span) * (l.speed ?? 1), 0, 1);
}

/** 4 bbox corners for framing the whole track. */
function trackCorners(l: TrackLayer): [number, number][] {
  const [w, s, e, n] = l.stats.bbox;
  return [[w, s], [e, s], [e, n], [w, n]];
}

/** Heading (deg) at fraction t, AVERAGED over a window as a unit-vector mean so
 *  it's wrap-safe (no 359°→1° jump) and doesn't whip-pan on switchbacks. */
function smoothHeading(coords: [number, number][], t: number, win = 0.05, n = 5): number {
  let sx = 0, sy = 0;
  for (let k = 0; k < n; k++) {
    const a = clampN(t - win + (2 * win) * (k / (n - 1)), 0, 1);
    const b = clampN(a + 0.02, 0, 1);
    const br = (geoBearing(pointAlong(coords, a), pointAlong(coords, b)) * Math.PI) / 180;
    sx += Math.cos(br); sy += Math.sin(br);
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI;
}

/** Camera pose for a track, per its `variant`. overview-draw = fixed top-down
 *  frame on the bbox; the others trail the moving head (chase). Editable
 *  pitch/zoom/bearing offsets ride on top. */
function trackPose(l: TrackLayer, frame: number, fps: number, totalFrames: number): CameraPose {
  const corners = trackCorners(l);
  const baseZoom = zoomForBounds(corners) + (l.zoomOffset ?? 0);
  const [cLon, cLat] = l.stats.midpoint;
  const variant = l.variant ?? "overview-draw";

  if (variant === "overview-draw") {
    // Calm, informational: hold the whole route in frame while it draws. Bias a
    // little tighter than the raw fit so the route fills the frame (hero shot).
    return { lon: cLon, lat: cLat, zoom: baseZoom + 0.6, pitch: l.pitch ?? 0, bearing: l.bearingOffset ?? 0 };
  }

  // chase-flyover / terrain-flyover / hybrid-dive → follow the moving head.
  const t = trackTravel(l, frame, fps, totalFrames);
  const coords = l.points.map((p) => [p.lon, p.lat] as [number, number]);
  if (coords.length < 2) return { lon: cLon, lat: cLat, zoom: baseZoom, pitch: l.pitch ?? 60, bearing: l.bearingOffset ?? 0 };
  const head = pointAlong(coords, clampN(t + 0.02, 0, 1));
  const settle = clampN(t * 5, 0, 1); // establish wide → close in
  const travelZoom = clampN(zoomForBounds(corners) + 2.4, 2, 16) + (l.zoomOffset ?? 0);
  const heading = smoothHeading(coords, t);

  if (variant === "hybrid-dive") {
    // overview → dive into chase → pull back to overview.
    const dive = smoothstep(clampN((t - 0.15) / 0.2, 0, 1)) * (1 - smoothstep(clampN((t - 0.75) / 0.2, 0, 1)));
    const zoom = lerp(baseZoom, travelZoom, smoothstep(dive));
    const pitch = lerp(0, l.pitch ?? 55, dive);
    const bearing = heading * dive + (l.bearingOffset ?? 0);
    const lon = lerp(cLon, head[0], dive), lat = lerp(cLat, head[1], dive);
    return { lon, lat, zoom, pitch, bearing };
  }

  // chase / terrain: ease the establish→travel zoom, trail the smoothed heading.
  const zoom = lerp(baseZoom, travelZoom, smoothstep(settle));
  const bearing = heading * settle + (l.bearingOffset ?? 0);
  return { lon: head[0], lat: head[1], zoom, pitch: l.pitch ?? 60, bearing };
}

/** Split the index range [i0..i1] of a track into per-SEGMENT coordinate lines so
 *  the drawn line never bridges a pause gap (returns a MultiLineString's coords). */
function trackLines(l: TrackLayer, i0: number, i1: number): [number, number][][] {
  if (i1 <= i0) return [];
  const breaks = (l.segments ?? []).filter((b) => b > i0 && b <= i1);
  const out: [number, number][][] = [];
  let start = i0;
  for (const b of [...breaks, i1 + 1]) {
    const line: [number, number][] = [];
    for (let i = start; i < Math.min(b, i1 + 1); i++) line.push([l.points[i].lon, l.points[i].lat]);
    if (line.length >= 2) out.push(line);
    start = b;
  }
  return out;
}

/** Camera FRAMES a highlight: ease a zoom-in reveal onto the region centroid.
 *  Used when a highlight is the top-most (priority) animation layer. */
function highlightPose(geojson: any, p: number, cam?: CameraLayer): CameraPose {
  const c = (() => { try { return centroidOf(geojson); } catch { return [0, 20]; } })();
  const wide = cam?.start.zoom ?? 2.4;
  const tight = cam?.end.zoom ?? 4.6;
  return { lon: c[0], lat: c[1], zoom: lerp(wide, tight, clampN(p * 1.15, 0, 1)), pitch: cam?.end.pitch ?? 30, bearing: cam?.end.bearing ?? 0 };
}

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
  const explicit = on.find((l) => (l.type === "route" || l.type === "highlight") && (l as any).framesCamera);
  if (explicit) return explicit;
  // A GPS track IS the shot — it always drives the camera (flythrough).
  const track = on.find((l) => l.type === "track" && (l as TrackLayer).points.length > 1);
  if (track) return track;
  const cam = on.find((l) => l.type === "camera");
  if (cam) return cam;
  return on.find((l) => l.type === "route" || l.type === "highlight");
}

/* ── The composition ──────────────────────────────────────────────────────── */

export const MapComposition: React.FC<{ comp: Composition; watermark?: boolean }> = ({ comp, watermark }) => {
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
  const p = ease(rawP);
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
  const googleKey = useMemo(() => readGoogleKey(), []);
  const photoreal3d = !!(comp.basemap as any).photoreal3d && !!googleKey && !isRendering;
  const [googleCredit, setGoogleCredit] = useState("");
  // EXPORT FALLBACK: the headless render can't stream Google's 3D tiles frame-by-
  // frame, so a photoreal scene EXPORTS as a rich satellite + 3D-terrain +
  // 3D-buildings world (the closest faithful 3D look) instead of a flat map.
  const photorealExportFallback = !!(comp.basemap as any).photoreal3d && isRendering;
  const effStyleUrl = photorealExportFallback ? "mapbox://styles/mapbox/satellite-streets-v12" : comp.basemap.styleUrl;
  const release = useCallback(() => {
    if (released.current || tilesHandle === null) return;
    released.current = true;
    continueRender(tilesHandle);
  }, [tilesHandle]);
  React.useEffect(() => {
    if (tilesHandle === null) return;
    // OpenHistoricalMap tiles are external + heavier — give them longer to load
    // before the safety release fires, so frames aren't captured half-painted.
    const slow = /ohm|openhistorical/i.test(comp.basemap.styleUrl ?? "");
    const t = setTimeout(release, slow ? 12000 : 3500);
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
      else { poll = setTimeout(settle, 60); }
    };
    // Let this frame's jumpTo + style mutations flush, then wait for settle.
    raf1 = requestAnimationFrame(settle);
    const safety = setTimeout(finish, 20000); // never hang the whole render
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
    return () => { map.off?.("styledata", apply); };
  }, [bm.showStreets, bm.showLabels, (bm as any).labelDetail, bm.terrain, bm.buildings3d, bm.styleUrl, (bm as any).terrainStrength, (bm as any).landColor, (bm as any).waterColor, (bm as any).buildingColor, (bm as any).buildingOpacity, (bm as any).buildingHeightMult, (bm as any).buildingGradient, (bm as any).boundaryGlow, (bm as any).photoreal3d, photoreal3d, photorealExportFallback]); // eslint-disable-line react-hooks/exhaustive-deps

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
        mapStyle={resolveMapStyle(effStyleUrl) as any}
        // Camera is driven imperatively via jumpTo each frame (above) — a single
        // transform update per frame, and guaranteed in sync with overlays.
        initialViewState={{ longitude: pose.lon, latitude: pose.lat, zoom: pose.zoom, pitch: pose.pitch, bearing: pose.bearing }}
        interactive={false}
        attributionControl={false}
        // CLEAN RENDER (no artifacts / flicker):
        //  • preserveDrawingBuffer — the headless renderer screenshots the WebGL
        //    canvas; without this the GL back-buffer is cleared after paint and the
        //    capture grabs an empty/garbage frame (the "weird artifacts").
        //  • fadeDuration:0 — kill MapLibre's tile cross-fade so a frame is never
        //    captured with tiles half-faded-in (the flicker between frames).
        // preserveDrawingBuffer is render-only (it costs a little perf, pointless
        // for the live preview which isn't screenshotted).
        preserveDrawingBuffer={isRendering}
        fadeDuration={0}
        onLoad={() => { setMapReady(true); const m = mapRef.current?.getMap(); if (m?.areTilesLoaded?.()) release(); }}
        onIdle={() => { setMapReady(true); release(); }}
        style={{ width: "100%", height: "100%", filter: mapFilterCss(comp.look) }}
      >
        {/* PHOTOREAL 3D (Google Earth) — deck.gl overlay of Google's
            Photorealistic 3D Tiles, preview-only (never in the headless render),
            and only when the user has supplied a Google Maps key. */}
        {photoreal3d && (
          <React.Suspense fallback={null}>
            <LazyGoogle3D apiKey={googleKey} onAttribution={setGoogleCredit} />
          </React.Suspense>
        )}
        {/* Map-drawn layers in STACK ORDER: the editor's layer panel decides
            what draws on top (layers[0] is top-most, Mapbox paints later
            mounts on top → iterate reversed). The index in the key forces a
            re-add when the user reorders, so z-order updates live. */}
        {[...comp.layers].reverse().map((l, ri) => {
          if (!l.enabled) return null;
          if (l.type === "highlight" && l.geojson)
            return <HighlightSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} terrain={!!comp.basemap.terrain || /satellite/i.test(String(comp.basemap.styleUrl ?? ""))} />;
          if (l.type === "route" && l.coordinates.length > 1 && l.showLine !== false)
            return <RouteSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "track" && l.points.length > 1)
            return <TrackSource key={`${l.id}-${ri}`} layer={l} frame={frame} fps={fps} totalFrames={totalFrames} />;
          if (l.type === "choropleth" && (l as ChoroplethLayer).data?.length)
            return <ChoroplethSource key={`${l.id}-${ri}`} layer={l as ChoroplethLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
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
          case "choropleth": return <ChoroplethLegend key={l.id} layer={l as ChoroplethLayer} frame={frame} fps={fps} totalFrames={totalFrames} />;
          case "bubble": return <BubbleView key={l.id} layer={l as BubbleLayer} frame={frame} fps={fps} totalFrames={totalFrames} project={project} />;
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

      {/* Documentary narration caption — shows the beat's voiceover line at bottom. */}
      {(comp as any).narration && (comp.look as any)?.showCaptions && (
        <NarrationCaption text={(comp as any).narration} frame={frame} totalFrames={totalFrames} />
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

/** Documentary-style narration caption — the beat's voiceover line displayed at the
 *  bottom of frame. Fades in at 8% of the scene and out at 88%, so it clears
 *  before the next beat transition. Sits ABOVE the letterbox but BELOW no overlay. */
const NarrationCaption: React.FC<{ text: string; frame: number; totalFrames: number }> = ({ text, frame, totalFrames }) => {
  const inF = Math.round(0.08 * totalFrames);
  const outF = Math.round(0.88 * totalFrames);
  const opacity = frame < inF
    ? frame / Math.max(1, inF)
    : frame > outF
    ? Math.max(0, 1 - (frame - outF) / Math.max(1, totalFrames - outF))
    : 1;
  if (opacity < 0.01) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 8% 5.5%", pointerEvents: "none" }}>
      <div style={{
        opacity,
        background: "rgba(0,0,0,0.58)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderRadius: "0.45em",
        padding: "0.5em 1.15em",
        fontSize: "2.1vh",
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 500,
        color: "rgba(255,255,255,0.94)",
        letterSpacing: "0.01em",
        lineHeight: 1.45,
        maxWidth: "74%",
        textAlign: "center",
        textShadow: "0 1px 5px rgba(0,0,0,0.5)",
      }}>
        {text}
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

/* ── Layer views ──────────────────────────────────────────────────────────── */

type LV<T> = { layer: T; frame: number; fps: number; totalFrames: number; project?: (lon: number, lat: number) => { x: number; y: number } };

/** Build the fine user transform (offset % of frame → px, scale, rotate) that
 *  rides ON TOP of a layer's anchor/timing transform. Empty when untouched. */
/** Layered legibility shadow for text over a busy map — a tight contact shadow
 *  plus a soft spread, scaled 0..1. Keeps titles/labels readable on any basemap. */
function textShadow(strength = 0.55): string {
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0.001) return "none";
  const a1 = (0.55 + 0.4 * s).toFixed(2);
  const a2 = (0.3 + 0.5 * s).toFixed(2);
  return `0 1px 2px rgba(0,0,0,${a1}), 0 ${Math.round(2 + 4 * s)}px ${Math.round(8 + 26 * s)}px rgba(0,0,0,${a2})`;
}

/** Crisp dark stroke around text (paint-order keeps the fill on top). Scaled to
 *  the font size so it reads at any scale — the news-graphic legibility trick. */
function outlineStyle(on: boolean | undefined, size: number): React.CSSProperties {
  return on ? { WebkitTextStroke: `${Math.max(1.5, size * 0.018).toFixed(1)}px rgba(0,0,0,0.92)`, paintOrder: "stroke" } : {};
}

function tfStyle(l: any, w: number, h: number): string {
  const t = l?.transform;
  if (!t) return "";
  const dx = ((t.offsetXPct ?? 0) / 100) * w;
  const dy = ((t.offsetYPct ?? 0) / 100) * h;
  const s = t.scale ?? 1, r = t.rotation ?? 0;
  if (!dx && !dy && s === 1 && r === 0) return "";
  return ` translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s}) rotate(${r}deg)`;
}

/** Convex N-gon approximating a circle at (cx,cy); rx/ry let us keep it round in
 *  lon/lat (lon degrees shrink with latitude). Wound CCW (lat = y, north = up). */
function circleNgon(cx: number, cy: number, rx: number, ry: number, n = 56): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}

/** Sutherland–Hodgman: clip a subject ring by a CONVEX clip polygon (CCW). */
function clipRingByConvex(subject: number[][], clip: number[][]): number[][] {
  let output = subject;
  const inside = (p: number[], a: number[], b: number[]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  const cut = (s: number[], e: number[], a: number[], b: number[]) => {
    const dx = e[0] - s[0], dy = e[1] - s[1], ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) return e;
    const t = ((a[0] - s[0]) * ey - (a[1] - s[1]) * ex) / den;
    return [s[0] + t * dx, s[1] + t * dy];
  };
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = output;
    output = [];
    if (!input.length) break;
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur, a, b), prevIn = inside(prev, a, b);
      if (curIn) { if (!prevIn) output.push(cut(prev, cur, a, b)); output.push(cur); }
      else if (prevIn) output.push(cut(prev, cur, a, b));
    }
  }
  return output;
}

/** Exterior rings ONLY (one per polygon) — never holes. Used for the grow clip so
 *  interior holes can't be promoted to filled polygons by the per-ring clipper. */
function exteriorRings(geo: any): number[][][] {
  const g = geo?.type === "FeatureCollection" ? geo.features?.[0]?.geometry : geo?.type === "Feature" ? geo.geometry : geo;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates?.[0] ? [g.coordinates[0]] : [];
  if (g.type === "MultiPolygon") return (g.coordinates ?? []).map((poly: any) => poly?.[0]).filter(Boolean);
  return [];
}

/** The "expansion" effect: the polygon's filled area as it has spread from
 *  `origin` to a fraction `frac` of its full extent (clip vs a growing circle). */
function growClipGeometry(geo: any, origin: [number, number], frac: number): any {
  const rings = exteriorRings(geo);
  if (!rings.length) return geo;
  const latRad = Math.max(0.15, Math.cos((origin[1] * Math.PI) / 180));
  let maxR = 1e-4;
  for (const ring of rings) for (const p of ring) maxR = Math.max(maxR, Math.hypot((p[0] - origin[0]) * latRad, p[1] - origin[1]));
  const r = maxR * Math.max(0, Math.min(1, frac)) * 1.05 + 1e-4;
  const clip = circleNgon(origin[0], origin[1], r / latRad, r, 56);
  const polys: number[][][][] = [];
  for (const ring of rings) {
    const c = clipRingByConvex(ring, clip);
    if (c.length >= 3) { c.push(c[0]); polys.push([c]); }
  }
  if (polys.length) return { type: "MultiPolygon", coordinates: polys };
  // Valid (if invisible) closed ring while frac≈0 so MapLibre never sees bad geometry.
  const e = 1e-4;
  return { type: "Polygon", coordinates: [[origin, [origin[0] + e, origin[1]], [origin[0] + e, origin[1] + e], origin]] };
}

/** bbox centre of a geometry's rings (the default spread origin). */
function ringsCenter(geo: any): [number, number] {
  const rings = polygonRings(geo);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const p of ring) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  return isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : [0, 0];
}

const HighlightSource: React.FC<LV<HighlightLayer> & { terrain?: boolean }> = ({ layer: l, frame, fps, totalFrames, terrain }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  const a = tr.opacity; // 0→1 enter / 1→0 exit from the unified timing engine
  // Clean once per geojson (mainland + nearby islands, simplified) — keeps the
  // Mapbox source light and the flag clip fast even for legacy full-detail docs.
  const cleanGeo = useMemo(() => cleanCountryGeo(l.geojson), [l.geojson]);
  // STABLE identity across frames — otherwise react-map-gl calls setData() every
  // frame and MapLibre re-tessellates the polygon, which flickers. Only the paint
  // (opacity) should change per frame, never the source data (for non-grow).
  const data = useMemo(() => (
    cleanGeo?.type === "FeatureCollection" || cleanGeo?.type === "Feature"
      ? cleanGeo : { type: "Feature" as const, geometry: cleanGeo, properties: {} }
  ), [cleanGeo]);
  const patterned = l.fillType !== "solid";
  const pulse = 0.5 + 0.5 * Math.sin(frame / 6);

  // ── grow / shrink: the filled area SPREADS from an origin to the borders ──
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
  }, [cleanGeo, (l as any).growOrigin]); // eslint-disable-line react-hooks/exhaustive-deps
  // The FILL geometry: clipped to the growing region for grow/shrink, else full.
  const fillData = useMemo(() => (
    isGrow ? { type: "Feature" as const, properties: {}, geometry: growClipGeometry(cleanGeo, origin, growProg) } : data
  ), [isGrow, cleanGeo, origin, growProg, data]);

  // Per-style border / fill / glow treatment, driven by the timing opacity `a`.
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
      // MapLibre v4 has no `line-trim-offset`; reveal the border by an opacity
      // ramp (the enter progress `a`) instead of a literal trim-draw.
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
      // Border appears FIRST (opacity ramp over ~1s from the layer's start); the
      // fill only arrives after an adjustable delay — driven by frames, not
      // squeezed into the fade ramp. (MapLibre v4 lacks `line-trim-offset`, so
      // the reveal is an opacity ramp rather than a literal draw-around.)
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
      // The SPREADING fill (clipped geometry above) carries the motion; the
      // border + glow trace the full target outline at a steady opacity.
      borderPaint = { "line-opacity": a, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": a * l.fillOpacity };
      glowPaint = { "line-opacity": a * 0.5 };
      break;
    default: // "fade" — steady glow once entered (no perpetual shimmer)
      borderPaint = { "line-opacity": a, "line-width": l.borderWidth };
      fillExtra = { "fill-opacity": a * l.fillOpacity };
      glowPaint = { "line-opacity": a * 0.55 };
  }

  return (
    // Three sources for clean z-order (glow ▸ fill ▸ border). The FILL uses
    // `fillData` so grow/shrink can clip it to the spreading region, while the
    // glow + border always trace the full target outline.
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
      {/* Flag fill — a real GPU layer on the surface (true planar tracking). */}
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

/**
 * Flag fill — TRUE planar surface tracking. The flag is pre-clipped to the
 * country shape in an offscreen canvas (a destination-in polygon mask), then
 * handed to MapLibre as an IMAGE source pinned to the country's 4 geo-bbox
 * corners. The GPU draws it ON the map surface, so it tilts / rotates / scales
 * with full perspective during ANY camera move, shows the map through the
 * transparent outside, and — being a real map layer — sits in the normal z-stack
 * (so a route can be placed over it). Rebuilt only when the country/flag change.
 */
function useFlagSurface(iso: string, geojson: any): { url: string; coordinates: [number, number][] } | null {
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
        ctx.drawImage(bmp, 0, 0, W, H);                  // flag stretched to the geo bbox
        ctx.globalCompositeOperation = "destination-in"; // keep only inside the country
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
  }, [iso, ringsKey, isRendering]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** The flag IMAGE source/layer — a real map layer, drawn on the surface. */
const FlagRasterSource: React.FC<{ layer: HighlightLayer; opacity: number }> = ({ layer: l, opacity }) => {
  const surf = useFlagSurface(flagIsoOf(l), l.geojson);
  if (!surf) return null;
  return (
    <Source id={`${l.id}-flagimg`} type="image" url={surf.url} coordinates={surf.coordinates as any}>
      <MapLayer id={`${l.id}-flagR`} type="raster" paint={{ "raster-opacity": Math.max(0, Math.min(1, opacity)), "raster-fade-duration": 0, "raster-resampling": "linear" } as any} />
    </Source>
  );
};

const ROUTE_EMOJI: Record<string, string> = { car: "🚗", plane: "✈️", boat: "⛵", walk: "🚶", bike: "🚴", train: "🚆", truck: "🚚", rocket: "🚀", heli: "🚁", run: "🏃", ship: "🚢", pin: "📍" };

/** Start + end markers for a route, with the place names underneath. Makes the
 *  journey legible (and shows the user exactly where it begins and ends). */
const RouteEndpoints: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const coords = l.coordinates;
  const ends: { c: [number, number]; name?: string; label: string }[] = [
    { c: coords[0] as [number, number], name: l.from?.name, label: "Start" },
    { c: coords[coords.length - 1] as [number, number], name: l.to?.name, label: "End" },
  ];
  return (
    <>
      {ends.map((e, i) => {
        const p = project(e.c[0], e.c[1]);
        return (
          <div key={i} style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", opacity: tr.opacity, pointerEvents: "none", textAlign: "center" }}>
            <svg width={54} height={54} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
              <circle cx={27} cy={27} r={16} fill="none" stroke={l.color} strokeWidth={2.5} opacity={0.55} />
              <circle cx={27} cy={27} r={7} fill={l.color} />
            </svg>
            {e.name && (
              <div style={{ transform: "translateY(150%)", fontFamily: displayFont(theme), fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: 1, whiteSpace: "nowrap", textShadow: "0 2px 12px rgba(0,0,0,0.85)" }}>{e.name}</div>
            )}
          </div>
        );
      })}
    </>
  );
};

const RouteIconView: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  // Hooks first (before any early return) — rules of hooks.
  const coords = useMemo(() => finalRouteCoords(l), [l.coordinates, l.direction, (l as any).smoothness]); // eslint-disable-line react-hooks/exhaustive-deps
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  // SAME geometry + progress as the line + follow camera → the vehicle rides the head.
  const travel = routeTravel(l, frame, fps, totalFrames);
  const head = pointAlong(coords, travel);
  const p = project(head[0], head[1]);

  // Bank the plane to face the direction of travel (screen-space heading). Cars,
  // boats and people stay upright — rotating them reads as wrong.
  let rot = 0;
  if (l.icon === "plane") {
    const behind = project(...pointAlong(coords, clampN(travel - 0.02, 0, 1)));
    const ang = Math.atan2(p.y - behind.y, p.x - behind.x) * (180 / Math.PI); // 0° = east
    rot = ang + 45; // ✈️ nose points to upper-right (~ -45° from east) → +45 aligns it with travel
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) rotate(${rot}deg)`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", fontSize: 56, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>
      {(l as any).iconEmoji || ROUTE_EMOJI[l.icon] || "📍"}
    </div>
  );
};

/** Trim a polyline to the first `frac` of its (planar) arc-length, interpolating
 *  the final point — the engine-agnostic "draw-on" reveal (MapLibre v4 has no
 *  line-trim-offset). Always returns ≥2 points so the LineString stays valid. */
function trimLineCoords(coords: number[][], frac: number): number[][] {
  if (!coords || coords.length < 2) return coords || [];
  if (frac >= 1) return coords;
  if (frac <= 0) return [coords[0], coords[0]];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    seg.push(d); total += d;
  }
  const target = total * frac;
  const out: number[][] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = seg[i - 1];
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      out.push([coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t]);
      break;
    }
    acc += d; out.push(coords[i]);
  }
  return out.length >= 2 ? out : [coords[0], coords[0]];
}

const RouteSource: React.FC<LV<RouteLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  // Memoise the geometry so Mapbox doesn't re-parse it every frame (only the
  // trim animates). Smoothing (Chaikin) is applied here too.
  const coords = useMemo(() => finalRouteCoords(l), [l.coordinates, l.direction, (l as any).smoothness]); // eslint-disable-line react-hooks/exhaustive-deps
  const travel = routeTravel(l, frame, fps, totalFrames);

  // Reveal animations:
  //  draw  — the vehicle draws the line behind it (trim from start to the head).
  //  grow  — the whole line swells into existence (width 0→full).
  //  fade  — the whole line ramps up in opacity.
  //  pulse — a fully-drawn line breathes (rhythmic opacity).
  //  static— instantly fully drawn.
  // line-trim-offset makes [start,end] transparent, so trimming [drawn,1] reveals
  // [0,drawn] — the head sits exactly under the vehicle.
  const isDraw = l.reveal === "draw" || l.reveal === "dotted";
  const drawn = isDraw ? Math.min(1, Math.max(0, travel)) : 1;
  // MapLibre v4 has no line-trim-offset, so the "draw" reveal trims the line
  // GEOMETRY to the drawn fraction (the head sits exactly under the vehicle).
  const drawnCoords = useMemo(() => (isDraw ? trimLineCoords(coords, drawn) : coords), [coords, isDraw, drawn]);
  const data = useMemo(() => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: drawnCoords } }), [drawnCoords]);
  let op = (l.opacity ?? 1) * tr.opacity;
  if (l.reveal === "fade") op *= smoothstep(travel);
  if (l.reveal === "pulse") op *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(frame / 5));
  const lineWidth = l.reveal === "grow" ? Math.max(0.5, l.width * smoothstep(travel)) : l.width;

  const round = { "line-cap": "round" as const, "line-join": "round" as const };
  const dashKind = (l.dashStyle ?? "solid") === "solid" && l.reveal === "dotted" ? "dotted" : (l.dashStyle ?? "solid");
  const dash = dashKind === "dotted" ? { "line-dasharray": [0.1, 1.8] } : dashKind === "dashed" ? { "line-dasharray": [2, 1.6] } : {};
  // Soft glow underlay for a cinematic, "lit" travel line — intensity adjustable.
  const glowI = l.glow ?? 0.35;
  const glowPaint: any = { "line-color": l.color, "line-width": lineWidth * (2.2 + glowI * 2.2), "line-opacity": op * 0.5 * Math.min(1, glowI), "line-blur": Math.max(4, lineWidth * 1.5) };
  const linePaint: any = { "line-color": l.color, "line-width": lineWidth, "line-opacity": op, ...dash };

  return (
    <Source id={l.id} type="geojson" data={data} lineMetrics>
      {glowI > 0.01 && <MapLayer id={`${l.id}-glow`} type="line" paint={glowPaint} layout={round} />}
      <MapLayer id={`${l.id}-line`} type="line" paint={linePaint} layout={round} />
    </Source>
  );
};

/* ── Track (imported GPS flythrough) — canvas line + moving head ───────────── */

/** Resolve the trimmed index window [i0, i1] for a track. */
function trackWindow(l: TrackLayer): [number, number] {
  const N = l.points.length;
  const i0 = Math.min(N - 1, Math.max(0, Math.round((l.trimStart ?? 0) * (N - 1))));
  const i1 = Math.max(i0 + 1, Math.min(N - 1, Math.round((l.trimEnd ?? 1) * (N - 1))));
  return [i0, i1];
}

const TrackSource: React.FC<LV<TrackLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  const [i0, i1] = trackWindow(l);
  const t = trackTravel(l, frame, fps, totalFrames);
  const headIdx = Math.min(i1, i0 + Math.round(t * (i1 - i0)));

  // The full (trimmed) path drawn faintly, and the travelled portion bright. Both
  // are segment-aware MultiLineStrings so the line never bridges a pause gap.
  const previewData = useMemo(
    () => ({ type: "Feature" as const, properties: {}, geometry: { type: "MultiLineString" as const, coordinates: trackLines(l, i0, i1) } }),
    [l, i0, i1], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const drawnData = useMemo(
    () => ({ type: "Feature" as const, properties: {}, geometry: { type: "MultiLineString" as const, coordinates: trackLines(l, i0, headIdx) } }),
    [l, i0, headIdx], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const headPt = l.points[headIdx] ?? l.points[i0];
  const dotData = { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [headPt.lon, headPt.lat] } };

  if (tr.opacity < 0.01) return null;
  const op = tr.opacity;
  const round = { "line-cap": "round" as const, "line-join": "round" as const };
  const w = l.routeWidth ?? 6;

  return (
    <>
      <Source id={`${l.id}-prev`} type="geojson" data={previewData}>
        <MapLayer id={`${l.id}-prev`} type="line" paint={{ "line-color": l.trailColor, "line-width": Math.max(1, w * 0.7), "line-opacity": op * 0.28 }} layout={round} />
      </Source>
      <Source id={`${l.id}-drawn`} type="geojson" data={drawnData}>
        <MapLayer id={`${l.id}-glow`} type="line" paint={{ "line-color": l.routeGlow, "line-width": w * 3, "line-opacity": op * 0.5, "line-blur": Math.max(4, w * 1.4) }} layout={round} />
        <MapLayer id={`${l.id}-line`} type="line" paint={{ "line-color": l.routeColor, "line-width": w, "line-opacity": op }} layout={round} />
      </Source>
      {l.showDot !== false && (
        <Source id={`${l.id}-dot`} type="geojson" data={dotData}>
          <MapLayer id={`${l.id}-dotglow`} type="circle" paint={{ "circle-radius": w * 2.4, "circle-color": l.routeGlow, "circle-opacity": op * 0.35, "circle-blur": 1 }} />
          <MapLayer id={`${l.id}-dotc`} type="circle" paint={{ "circle-radius": Math.max(3, w * 1.1), "circle-color": l.dotColor, "circle-opacity": op, "circle-stroke-width": 2, "circle-stroke-color": "rgba(255,255,255,0.9)" }} />
        </Source>
      )}
    </>
  );
};

/** Track DOM overlays — start/finish pins + an optional distance/elevation HUD. */
/** Animated elevation profile strip — an area chart of the route's elevation
 *  that fills (traveled portion) as the dot advances, with a moving marker and a
 *  live readout. Points are even arc-spaced after preprocess, so index ≈ distance
 *  → x maps directly to index. preserveAspectRatio="none" stretches the area to
 *  the strip (stroke kept constant; no dot, so nothing distorts). */
const TrackElevationProfile: React.FC<{ l: TrackLayer; i0: number; i1: number; headIdx: number; opacity: number }> = ({ l, i0, i1, headIdx, opacity }) => {
  const theme = useTheme();
  const W = 1000, H = 150, padT = 16, padB = 10;
  const eles: number[] = [];
  for (let i = i0; i <= i1; i++) { const e = l.points[i]?.ele; eles.push(e == null ? NaN : e); }
  const valid = eles.filter((e) => Number.isFinite(e));
  if (valid.length < 2) return null;
  const minE = Math.min(...valid), maxE = Math.max(...valid), span = Math.max(1, maxE - minE);
  const n = eles.length;
  const xAt = (k: number) => (k / (n - 1)) * W;
  const yAt = (e: number) => padT + (H - padT - padB) * (1 - (e - minE) / span);
  let d = `M0,${H} `;
  for (let k = 0; k < n; k++) d += `L${xAt(k).toFixed(1)},${yAt(Number.isFinite(eles[k]) ? eles[k] : minE).toFixed(1)} `;
  d += `L${W},${H} Z`;
  const hk = Math.max(0, headIdx - i0);
  const fillW = xAt(hk);
  const headE = Number.isFinite(eles[hk]) ? eles[hk] : minE;
  return (
    <div style={{ position: "absolute", left: "50%", bottom: "5.5%", transform: "translateX(-50%)", width: "46%", opacity, pointerEvents: "none" }}>
      <div style={{ borderRadius: 12, background: "rgba(8,10,18,0.66)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 44px rgba(0,0,0,0.5)", padding: "6px 11px 7px", fontFamily: displayFont(theme), color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
          <span style={{ opacity: 0.45, letterSpacing: 2, textTransform: "uppercase", fontSize: "1.1vh" }}>Elevation</span>
          <span style={{ fontSize: "1.8vh", fontWeight: 700 }}>{Math.round(headE)}<span style={{ opacity: 0.5 }}> m · ↑{Math.round(l.stats.ascentM)} m</span></span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "7vh", display: "block" }}>
          <defs>
            <linearGradient id={`elg-${l.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={l.routeGlow} stopOpacity="0.55" />
              <stop offset="100%" stopColor={l.routeGlow} stopOpacity="0.04" />
            </linearGradient>
            <clipPath id={`elc-${l.id}`}><rect x="0" y="0" width={Math.max(0.1, fillW)} height={H} /></clipPath>
          </defs>
          <path d={d} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <g clipPath={`url(#elc-${l.id})`}>
            <path d={d} fill={`url(#elg-${l.id})`} stroke={l.routeColor} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          </g>
          <line x1={fillW} y1={0} x2={fillW} y2={H} stroke={l.routeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.75} />
        </svg>
      </div>
    </div>
  );
};

const TrackOverlay: React.FC<LV<TrackLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const [i0, i1] = trackWindow(l);
  const t = trackTravel(l, frame, fps, totalFrames);
  const headIdx = Math.min(i1, i0 + Math.round(t * (i1 - i0)));
  const prog = i1 > i0 ? (headIdx - i0) / (i1 - i0) : 1;
  const font = displayFont(theme);

  const sp = l.points[i0], ep = l.points[i1];
  const s = project(sp.lon, sp.lat), e = project(ep.lon, ep.lat);

  const pin = (xy: { x: number; y: number }, text: string, color: string) => (
    <div style={{ position: "absolute", left: xy.x, top: xy.y, transform: "translate(-50%,-100%)", opacity: tr.opacity, pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap" }}>
      <div style={{ fontFamily: font, fontSize: "2.4vh", fontWeight: 700, color: "#fff", letterSpacing: 1, padding: "0.3em 0.7em", borderRadius: 8, background: "rgba(8,10,18,0.72)", border: `1px solid ${color}`, boxShadow: `0 0 18px ${color}88`, textShadow: textShadow(0.5) }}>{text}</div>
      <div style={{ width: 12, height: 12, margin: "4px auto 0", borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
    </div>
  );

  const distKm = (l.stats.distanceM / 1000) * prog;
  const showProfile = !!l.labels?.elevation && l.hasElevation;

  return (
    <>
      {l.labels?.start && pin(s, l.startLabel || "Start", l.routeGlow)}
      {l.labels?.end && pin(e, l.endLabel || "Finish", l.routeColor)}
      {l.labels?.distance && (
        <div style={{ position: "absolute", left: "4%", bottom: "7%", padding: "1vh 1.6vh", borderRadius: 12, background: "rgba(8,10,18,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 44px rgba(0,0,0,0.5)", fontFamily: font, color: "#fff", opacity: tr.opacity, pointerEvents: "none" }}>
          <div style={{ fontSize: "3.4vh", fontWeight: 800, lineHeight: 1 }}>{distKm.toFixed(1)}<span style={{ fontSize: "1.6vh", opacity: 0.6, marginLeft: 3 }}>km</span></div>
          <div style={{ fontSize: "1.3vh", letterSpacing: 2, textTransform: "uppercase", opacity: 0.45 }}>Distance</div>
        </div>
      )}
      {showProfile && <TrackElevationProfile l={l} i0={i0} i1={i1} headIdx={headIdx} opacity={tr.opacity} />}
    </>
  );
};

function anchorXY(anchor: LabelLayer["anchor"], project: LV<any>["project"], w = 1920, h = 1080) {
  if (anchor.kind === "coord" && project) { const p = project(anchor.lon, anchor.lat); return { x: p.x, y: p.y, screen: false as const }; }
  return { x: 0, y: 0, screen: true as const, pos: anchor.kind === "screen" ? anchor.pos : "bottom" };
}

const LabelView: React.FC<LV<LabelLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  const font = displayFont(theme, l.fontFamily);
  const a = anchorXY(l.anchor, project);
  const utf = tfStyle(l, vw, vh);
  const ts = textShadow((l as any).shadow ?? 0.55);

  // Shared frosted card (used by the coord "card" and the screen lower-third).
  const cardEl = (
    <div style={{ display: "flex", alignItems: "stretch", borderRadius: l.variant === "card" ? 14 : 4, overflow: "hidden", background: "rgba(8,10,18,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 12px 44px rgba(0,0,0,0.5)", fontFamily: font, textAlign: "left" }}>
      <div style={{ width: l.variant === "lower-third" ? 8 : 6, background: l.accent, boxShadow: `0 0 20px ${l.accent}aa` }} />
      <div style={{ padding: "12px 24px" }}>
        <div style={{ fontSize: l.sizePx * 0.6, fontWeight: 700, color: l.color, letterSpacing: 0.5, ...outlineStyle((l as any).outline, l.sizePx * 0.6) }}>{l.text}</div>
        {l.sub && <div style={{ fontSize: l.sizePx * 0.32, color: l.accent, marginTop: 4, letterSpacing: 2, textTransform: "uppercase" }}>{l.sub}</div>}
      </div>
    </div>
  );

  // Lower-third — ALWAYS a screen-fixed broadcast card at the bottom-left,
  // regardless of anchor (that's what a lower-third IS).
  if (l.variant === "lower-third") {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "5.5% 6%", pointerEvents: "none" }}>
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${utf}` }}>{cardEl}</div>
      </AbsoluteFill>
    );
  }

  if (l.variant === "banner" || (a.screen && l.anchor.kind === "screen")) {
    const pos = a.screen ? (a as any).pos : "bottom";
    const vAlign = pos === "top" ? "flex-start" : pos === "center" ? "center" : "flex-end";
    return (
      <AbsoluteFill style={{ justifyContent: vAlign, alignItems: "center", padding: "6%", pointerEvents: "none" }}>
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${utf}`, textAlign: "center", fontFamily: font }}>
          <div style={{ fontSize: l.sizePx, fontWeight: 700, color: l.color, letterSpacing: 2, textShadow: ts, ...outlineStyle((l as any).outline, l.sizePx) }}>{l.text}</div>
          {l.sub && <div style={{ marginTop: 10, fontSize: l.sizePx * 0.4, color: l.accent, textShadow: ts }}>{l.sub}</div>}
        </div>
      </AbsoluteFill>
    );
  }

  // coordinate-anchored: pin / card / lower-third
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${a.x}px, ${a.y}px) translate(-50%,-50%) ${timingTransform(tr)}${utf}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap" }}>
      {l.variant === "pin" && (
        <>
          <svg width={140} height={140} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
            <circle cx={70} cy={70} r={46} fill="none" stroke={l.accent} strokeWidth={3} opacity={0.5} />
            <circle cx={70} cy={70} r={14} fill={l.accent} />
          </svg>
          <div style={{ transform: "translateY(-220%)", fontFamily: font, fontSize: l.sizePx, fontWeight: 300, color: l.color, letterSpacing: 2, textShadow: ts, ...outlineStyle((l as any).outline, l.sizePx) }}>{l.text}</div>
        </>
      )}
      {l.variant === "card" && cardEl}
    </div>
  );
};

const HighlightLabel: React.FC<LV<HighlightLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const text = (l as any).labelText || l.place;
  if (!text || !l.geojson) return null;
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  const c = centroidOf(l.geojson);
  const p = project?.(c[0], c[1]) ?? { x: 0, y: 0 };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) ${timingTransform(tr)}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", fontFamily: displayFont(theme), fontWeight: 600, fontSize: (l as any).labelSize ?? 46, color: (l as any).labelColor ?? "#fff", letterSpacing: 4, textShadow: textShadow(0.65), whiteSpace: "nowrap", textAlign: "center" }}>
      {text}
    </div>
  );
};

const FlagView: React.FC<LV<FlagLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  const p = project?.(l.anchor.lon, l.anchor.lat) ?? { x: 0, y: 0 };
  const iso = l.iso.toLowerCase();
  const w = l.sizePx;
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", display: "flex", alignItems: "center", gap: w * 0.09, padding: `${w * 0.06}px ${w * 0.1}px`, borderRadius: w * 0.07, background: "rgba(6,8,15,0.82)", border: "2px solid #6E7BFF" }}>
      <Img src={`https://flagcdn.com/w320/${iso}.png`} style={{ width: w, height: Math.round(w * 0.66), borderRadius: w * 0.035, objectFit: "cover" }} />
      {l.showCode && <span style={{ fontFamily: "Inter, sans-serif", fontSize: w * 0.26, fontWeight: 700, color: "#fff" }}>{l.iso.toUpperCase()}</span>}
    </div>
  );
};

/** Curated storytelling symbols (id → emoji). `emoji` overrides for anything. */
const MARKER_GLYPH: Record<string, string> = {
  swords: "⚔️", explosion: "💥", fire: "🔥", skull: "💀", alert: "⚠️", radiation: "☢️",
  biohazard: "☣️", crown: "👑", anchor: "⚓", plane: "✈️", tank: "🛡️", ship: "🚢",
  oil: "🛢️", money: "💰", factory: "🏭", landmark: "🏛️", flag: "🚩", pin: "📍",
  dot: "●", target: "🎯", arrow: "➤", star: "⭐", cross: "✝️", heart: "❤️",
};

/** An animated symbol dropped on a single coordinate — the storytelling beat
 *  (⚔️ on a contested border, 💥 on a strike, 🛢️ on an oil field). Tracks the
 *  map, pops/drops/spins in, and carries an optional caption + locator ring. */
const MarkerView: React.FC<LV<MarkerLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const p = project(l.anchor.lon, l.anchor.lat);
  const glyph = l.emoji || MARKER_GLYPH[l.icon] || "📍";

  // Entrance is driven by the unified timing opacity (0→1 in), so the motion and
  // the fade stay perfectly in lock-step. easeOutBack gives a little overshoot.
  const a = tr.opacity;
  const back = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const breathe = 0.5 + 0.5 * Math.sin(frame / 7);

  let scale = 1, dy = 0, rot = 0, iconOpacity = 1;
  switch (l.animation) {
    case "pop":   scale = back(a); break;
    case "drop":  dy = (1 - a) * (-vh * 0.15); scale = a < 1 ? 0.6 + 0.4 * a : 1; break;
    case "spin":  scale = a; rot = (1 - a) * 200; break;
    case "pulse": scale = a; break;
    case "throb": scale = a * (1 + 0.12 * breathe); break;
    case "flash": scale = a; iconOpacity = 0.55 + 0.45 * breathe; break;
    default:      scale = a < 1 ? 0.85 + 0.15 * a : 1; // gentle settle
  }

  const glowI = l.glow ?? 0.6;
  const sz = l.sizePx;
  const utf = tfStyle(l, vw, vh);
  const ringPulse = 0.85 + 0.4 * breathe;

  return (
    <div data-layer-id={l.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) translateY(${dy.toFixed(1)}px) scale(${Math.max(0.01, scale).toFixed(3)}) rotate(${rot.toFixed(1)}deg)${utf}`, willChange: "transform", opacity: tr.opacity * iconOpacity, pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap" }}>
      {l.ring && (
        <svg width={sz * 2.2} height={sz * 2.2} style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${ringPulse.toFixed(3)})`, overflow: "visible" }}>
          <circle cx={sz * 1.1} cy={sz * 1.1} r={sz * 0.72} fill="none" stroke={l.color} strokeWidth={Math.max(2, sz * 0.028)} opacity={0.42 * (1 - 0.45 * breathe)} />
          <circle cx={sz * 1.1} cy={sz * 1.1} r={sz * 0.5} fill={l.color} opacity={0.12} />
        </svg>
      )}
      <div style={{ position: "relative", fontSize: sz, lineHeight: 1, filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.55))${glowI > 0.01 ? ` drop-shadow(0 0 ${Math.round(sz * 0.3 * glowI)}px ${l.color})` : ""}` }}>
        {glyph}
      </div>
      {l.label && (
        <div style={{ position: "relative", marginTop: sz * 0.06, fontFamily: displayFont(theme), fontSize: sz * 0.32, fontWeight: 700, color: l.labelColor, letterSpacing: 2, textShadow: textShadow(0.7) }}>{l.label}</div>
      )}
    </div>
  );
};

/** #rrggbb (or #rgb) + alpha → rgba() string. */
function hexA(hex: string, a: number): string {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/* ── Choropleth (data-bound map fills) ───────────────────────────────────────── */

/** Canvas layer: one MapLibre fill+border per data entry. Pre-coloured at plan
 *  build time (`entry.color`), so the renderer is pure presentation — no re-scale. */
const ChoroplethSource: React.FC<LV<ChoroplethLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  const entries = (l.data ?? []).filter((e: any) => e.geojson);
  if (!entries.length) return null;
  return (
    <>
      {entries.map((e: any, i: number) => {
        const sid = `choro-${l.id}-${i}`;
        const fillId = `choro-fill-${l.id}-${i}`;
        const borderId = `choro-border-${l.id}-${i}`;
        const geoData = {
          type: "FeatureCollection" as const,
          features: [{ type: "Feature" as const, properties: {}, geometry: e.geojson?.type === "Feature" ? e.geojson.geometry : e.geojson?.type === "FeatureCollection" ? e.geojson.features?.[0]?.geometry : e.geojson }],
        };
        return (
          <React.Fragment key={sid}>
            <Source id={sid} type="geojson" data={geoData}>
              <MapLayer id={fillId} type="fill" source={sid} paint={{ "fill-color": e.color ?? "#6E7BFF", "fill-opacity": tr.opacity * 0.65 }} />
              <MapLayer id={borderId} type="line" source={sid} paint={{ "line-color": e.color ?? "#6E7BFF", "line-opacity": tr.opacity * 0.85, "line-width": 1.5 }} />
            </Source>
          </React.Fragment>
        );
      })}
    </>
  );
};

/** DOM overlay: frosted-glass legend bar in the bottom-left corner. */
const ChoroplethLegend: React.FC<LV<ChoroplethLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !l.showLegend) return null;
  const entries = l.data ?? [];
  if (!entries.length) return null;
  const vals = entries.map((e: any) => e.value as number).filter(Number.isFinite);
  const vMin = vals.length ? Math.min(...vals) : 0;
  const vMax = vals.length ? Math.max(...vals) : 1;
  const fmt = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
  const gradientCss = `linear-gradient(to right, ${l.colorLow ?? "#e3f2fd"}, ${l.colorHigh ?? "#0d47a1"})`;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%", pointerEvents: "none" }}>
      <div style={{ opacity: tr.opacity, transform: timingTransform(tr), background: "rgba(6,8,15,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: "1vh", padding: "1.2vh 1.6vh", minWidth: "18vh", maxWidth: "28vh" }}>
        {l.metric && <div style={{ fontSize: "1.3vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.8vh", opacity: 0.9 }}>{l.metric}{l.unit ? ` (${l.unit})` : ""}</div>}
        <div style={{ height: "0.9vh", borderRadius: "0.45vh", background: gradientCss, marginBottom: "0.5vh" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vh", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
          <span>{fmt(vMin)}</span>
          <span>{fmt(vMax)}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Editorial leader-line callout: a dot ON the map point, a line out to a text
 *  box. The line "draws" in and the box fades up — pointing at an exact spot. */
const AnnotationView: React.FC<LV<AnnotationLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const p = project(l.anchor.lon, l.anchor.lat);
  const font = displayFont(theme, l.fontFamily);
  const sz = l.sizePx;
  const d = (l.distance / 100) * vh;
  // 4-quadrant placement: callout goes into the OPPOSITE screen quadrant from the
  // feature, pushing into negative space (Johnny-Harris "point and explain").
  const autoSide = (() => {
    const inLeft = p.x < vw * 0.45, inTop = p.y < vh * 0.45;
    if (inLeft && inTop) return "right";       // feature top-left → callout right
    if (!inLeft && inTop) return "left";       // feature top-right → callout left
    if (inLeft && !inTop) return "top";        // feature bottom-left → callout top
    return "top";                              // feature bottom-right → callout top
  })();
  const side = l.side === "auto" ? autoSide : l.side;
  let bx = p.x, by = p.y;
  if (side === "top") by = p.y - d;
  else if (side === "bottom") by = p.y + d;
  else if (side === "left") bx = p.x - d * (vw / vh);
  else if (side === "right") bx = p.x + d * (vw / vh);
  const drawP = l.draw ? clampN(tr.opacity * 1.25, 0, 1) : 1;
  const lx = p.x + (bx - p.x) * drawP, ly = p.y + (by - p.y) * drawP;
  const pulse = 1.3 + 0.6 * Math.sin(frame / 6);
  const dotR = Math.max(4, sz * 0.13);
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <line x1={p.x} y1={p.y} x2={lx} y2={ly} stroke={l.accent} strokeWidth={Math.max(1.5, sz * 0.05)} strokeOpacity={tr.opacity} strokeLinecap="round" />
        <circle cx={p.x} cy={p.y} r={dotR * pulse} fill="none" stroke={l.accent} strokeWidth={2} opacity={tr.opacity * 0.4} />
        <circle cx={p.x} cy={p.y} r={dotR} fill={l.accent} opacity={tr.opacity} />
      </svg>
      <div style={{ position: "absolute", left: bx, top: by, transform: `translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`, opacity: tr.opacity, textAlign: l.boxStyle === "bracket" ? "left" : "center", whiteSpace: "nowrap", fontFamily: font }}>
        {l.boxStyle === "card" ? (
          <div style={{ display: "inline-block", padding: `${sz * 0.28}px ${sz * 0.5}px`, borderRadius: sz * 0.18, background: "rgba(6,8,15,0.86)", border: `${Math.max(2, sz * 0.045)}px solid ${l.accent}` }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, letterSpacing: 1 }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.12 }}>{l.sub}</div>}
          </div>
        ) : l.boxStyle === "bracket" ? (
          <div style={{ display: "inline-block", padding: `${sz * 0.18}px ${sz * 0.5}px`, borderLeft: `${Math.max(3, sz * 0.08)}px solid ${l.accent}` }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent }}>{l.sub}</div>}
          </div>
        ) : l.boxStyle === "underline" ? (
          <div style={{ display: "inline-block" }}>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            <div style={{ height: Math.max(3, sz * 0.06), background: l.accent, marginTop: sz * 0.1 }} />
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.1 }}>{l.sub}</div>}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: sz, fontWeight: 700, color: l.color, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}>{l.sub}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Bubble map (proportional symbols) ───────────────────────────────────────── */

/** Gapminder-style proportional circles anchored at map coordinates.
 *  Circle AREA encodes value (sqrt-scaled) — perceptually honest.
 *  Entrance: circles grow from 0 → full size, then optionally pulse. */
const BubbleView: React.FC<LV<BubbleLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const entries = (l.data ?? []).filter((e: any) => e.lon !== 0 || e.lat !== 0);
  if (!entries.length) return null;

  // Entrance progress: 0→1 over the first 50% of the scene after inSec.
  const inF = Math.round(l.timing.inSec * fps);
  const growDur = Math.round(totalFrames * 0.5);
  const growP = clampN((frame - inF) / Math.max(1, growDur), 0, 1);
  // Eased grow (ease-out cubic).
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const growScale = ease(growP);

  const fmt = (v: number) => v >= 1e12 ? `${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
  const font = displayFont(theme, null);
  const maxSz = l.maxSizePx ?? 140;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {entries.map((e: any, i: number) => {
        const { x, y } = project(e.lon, e.lat);
        const r = (e.sizePx ?? 40) / 2 * growScale;
        if (r < 1) return null;
        // Pulse: subtle 3% oscillation on grown bubbles.
        const pulse = l.animate === "pulse" && growP >= 1 ? 1 + 0.03 * Math.sin((frame + i * 18) / 8) : 1;
        const rFinal = r * pulse;
        const fontSize = Math.max(10, Math.min(rFinal * 0.38, 22));
        const opacity = tr.opacity * (l.animate === "fade" ? growP : 1);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", width: rFinal * 2, height: rFinal * 2, borderRadius: "50%", background: e.color ?? l.color, opacity: opacity * 0.72, border: `${Math.max(1.5, rFinal * 0.04)}px solid rgba(255,255,255,0.4)`, boxShadow: `0 0 ${rFinal * 0.6}px ${rFinal * 0.15}px ${e.color ?? l.color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", backdropFilter: "none" }}>
            {l.showLabels && growP > 0.4 && rFinal > 18 && (
              <div style={{ opacity: Math.min(1, (growP - 0.4) / 0.3), textAlign: "center", fontFamily: font, userSelect: "none" }}>
                <div style={{ fontSize, fontWeight: 800, color: "#fff", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{fmt(e.value)}{l.unit ? ` ${l.unit}` : ""}</div>
                {e.label && rFinal > 30 && <div style={{ fontSize: fontSize * 0.6, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{e.label}</div>}
              </div>
            )}
          </div>
        );
      })}
      {l.showLegend && entries.length > 1 && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "3.5% 4%" }}>
          <div style={{ opacity: tr.opacity * Math.min(1, growP * 2), background: "rgba(6,8,15,0.8)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "1vh", padding: "1vh 1.4vh" }}>
            {l.metric && <div style={{ fontSize: "1.2vh", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85, marginBottom: "0.5vh", fontFamily: font }}>{l.metric}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: "0.8vh" }}>
              <div style={{ width: maxSz * 0.15, height: maxSz * 0.15, borderRadius: "50%", background: l.color, opacity: 0.7 }} />
              <div style={{ width: maxSz * 0.28, height: maxSz * 0.28, borderRadius: "50%", background: l.color, opacity: 0.85 }} />
              <div style={{ fontSize: "1vh", color: "rgba(255,255,255,0.55)", fontFamily: font }}>∝ area</div>
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/** A network of bowed arcs over the map — hub-and-spoke or an A→B→C chain —
 *  drawn on, staggered, with node dots. Trade lanes, migration, alliances. */
const ConnectionsView: React.FC<LV<ConnectionsLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const pts = l.points.map((pt) => ({ ...project(pt.lon, pt.lat), name: pt.name }));
  if (pts.length < 1) return null;
  let hub = l.hub ? { ...project(l.hub.lon, l.hub.lat), name: l.hub.name } : null;
  let spokes = pts;
  // Hub mode with no explicit hub set → use the FIRST place as the hub (so it
  // never silently renders nothing — it just works).
  if (l.mode === "hub" && !hub && pts.length >= 2) { hub = pts[0]; spokes = pts.slice(1); }
  const weights = l.points.map((p: any) => p.weight ?? 1);
  const maxW = Math.max(1, ...weights.filter(isFinite));
  const edges: { a: { x: number; y: number }; b: { x: number; y: number }; w: number }[] = [];
  if (l.mode === "hub" && hub) for (let i = 0; i < spokes.length; i++) edges.push({ a: hub, b: spokes[i], w: weights[i] ?? 1 });
  else for (let i = 0; i < pts.length - 1; i++) edges.push({ a: pts[i], b: pts[i + 1], w: weights[i] ?? 1 });
  if (edges.length === 0) return null;

  const inF = Math.round(l.timing.inSec * fps);
  const totalProg = clampN((frame - inF) / Math.max(1, (totalFrames - inF) * 0.7), 0, 1);
  const stag = 0.12 + l.stagger * 0.8;
  const glowI = l.glow ?? 0.5;
  const allNodes = hub ? [hub, ...spokes] : pts;
  const dashPat = l.dashStyle === "dotted" ? "1 9" : l.dashStyle === "dashed" ? "13 9" : undefined;

  const arc = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
    const cx = (a.x + b.x) / 2 + (-dy / dist) * l.curve * dist * 0.32;
    const cy = (a.y + b.y) / 2 + (dx / dist) * l.curve * dist * 0.32;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };

  return (
    <svg data-layer-id={l.id} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
      {edges.map((e, i) => {
        const d = arc(e.a, e.b);
        const start = (i / edges.length) * stag;
        const ep = clampN((totalProg - start) / Math.max(0.0001, 1 - start), 0, 1);
        const draw = l.reveal === "draw" ? ep : 1;
        const op = (l.reveal === "fade" ? ep : 1) * tr.opacity;
        // Weight-scaled width: proportional to the flow magnitude.
        const wScale = e.w / maxW;
        const baseW = l.reveal === "grow" ? Math.max(0.5, l.width * ep) : l.width;
        const w = Math.max(1, baseW * (0.3 + 0.7 * wScale));
        const drawDash = draw < 1 ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - draw } : (dashPat ? { strokeDasharray: dashPat } : {});
        // Pulse particles: small circles travelling along the arc.
        const particles = l.pulse && draw > 0.5 ? [0, 0.33, 0.66].map((offset) => {
          const t = ((frame / 35 + offset) % 1) * draw;
          // Quadratic bezier point at t
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, dist = Math.hypot(dx, dy) || 1;
          const cx = (e.a.x + e.b.x) / 2 + (-dy / dist) * l.curve * dist * 0.32;
          const cy = (e.a.y + e.b.y) / 2 + (dx / dist) * l.curve * dist * 0.32;
          const mt = 1 - t;
          const px = mt * mt * e.a.x + 2 * mt * t * cx + t * t * e.b.x;
          const py = mt * mt * e.a.y + 2 * mt * t * cy + t * t * e.b.y;
          return { px, py };
        }) : [];
        return (
          <g key={i} opacity={op}>
            {glowI > 0.01 && <path d={d} fill="none" stroke={l.color} strokeWidth={w * (2.2 + glowI * 2)} strokeOpacity={0.4 * Math.min(1, glowI)} strokeLinecap="round" style={{ filter: `blur(${Math.max(3, w * 1.1)}px)` }} pathLength={draw < 1 ? 1 : undefined} strokeDasharray={draw < 1 ? 1 : undefined} strokeDashoffset={draw < 1 ? 1 - draw : undefined} />}
            <path d={d} fill="none" stroke={l.color} strokeWidth={w} strokeLinecap="round" {...drawDash} />
            {particles.map((p, pi) => (
              <circle key={pi} cx={p.px} cy={p.py} r={Math.max(2.5, w * 0.9)} fill="#fff" opacity={0.85} />
            ))}
          </g>
        );
      })}
      {l.dots && allNodes.map((n, i) => (
        <g key={`n${i}`} opacity={tr.opacity}>
          <circle cx={n.x} cy={n.y} r={l.width * 1.5 * (1.25 + 0.45 * Math.sin(frame / 6))} fill="none" stroke={l.dotColor} strokeWidth={2} opacity={0.4} />
          <circle cx={n.x} cy={n.y} r={l.width * 1.5} fill={l.dotColor} />
        </g>
      ))}
      {l.showLabels && allNodes.map((n, i) => n.name ? (
        <text key={`t${i}`} x={n.x} y={n.y - l.width * 2.6} fill="#fff" fontSize={28} fontFamily={displayFont(theme)} fontWeight={600} textAnchor="middle" opacity={tr.opacity} style={{ paintOrder: "stroke" }} stroke="rgba(0,0,0,0.7)" strokeWidth={4}>{n.name}</text>
      ) : null)}
    </svg>
  );
};

/** Darken the whole frame except a soft circle on the anchor — locks the eye. */
const SpotlightView: React.FC<LV<SpotlightLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !project) return null;
  const p = project(l.anchor.lon, l.anchor.lat);
  const pulse = l.pulse ? 1 + 0.05 * Math.sin(frame / 7) : 1;
  const rPx = (l.radiusPct / 100) * vh * pulse;
  const inner = Math.max(0, 1 - l.feather) * rPx;
  const dim = l.dim * tr.opacity;
  const grad = `radial-gradient(circle ${rPx.toFixed(0)}px at ${p.x.toFixed(0)}px ${p.y.toFixed(0)}px, ${hexA(l.color, 0)} ${inner.toFixed(0)}px, ${hexA(l.color, dim)} ${rPx.toFixed(0)}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: grad }} />
      {l.ring && (
        <div style={{ position: "absolute", left: p.x, top: p.y, width: rPx * 2, height: rPx * 2, transform: "translate(-50%,-50%)", borderRadius: "50%", border: `${Math.max(2, rPx * 0.012)}px solid ${l.ringColor}`, opacity: tr.opacity * 0.7, boxShadow: `0 0 ${rPx * 0.18}px ${l.ringColor}` }} />
      )}
    </AbsoluteFill>
  );
};

const TitleView: React.FC<LV<TitleLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  const vAlign = l.position === "top" ? "flex-start" : l.position === "bottom" ? "flex-end" : "center";
  const hAlign = l.align === "left" ? "flex-start" : l.align === "right" ? "flex-end" : "center";
  const ts = textShadow((l as any).shadow ?? 0.55);
  const tpl = l.template;
  // Four genuinely distinct treatments (not just impact-vs-rest):
  //  impact  — huge bold + accent underline bar.
  //  classic — light, airy, a thin accent rule above the kicker.
  //  kicker  — a bold colour KICKER tag over a medium headline + short rule.
  //  split   — an editorial vertical accent bar beside the headline.
  const headSize = tpl === "impact" ? 160 : tpl === "kicker" ? 116 : 122;
  const headWeight = tpl === "impact" ? 800 : tpl === "split" ? 700 : 300;
  const bar = (w: number, h: number) => <div style={{ height: h, width: w, marginTop: 24, background: l.accent, borderRadius: h / 2, marginLeft: hAlign === "center" ? "auto" : 0, marginRight: hAlign === "center" ? "auto" : 0, boxShadow: `0 0 18px ${l.accent}88` }} />;
  const headline = <div style={{ fontSize: headSize, fontWeight: headWeight, color: l.color, lineHeight: 1.02, letterSpacing: tpl === "impact" ? -2 : -1, textShadow: ts, ...outlineStyle((l as any).outline, headSize) }}>{l.text}</div>;
  const sub = l.sub ? <div style={{ fontSize: tpl === "kicker" ? 48 : 40, fontWeight: tpl === "kicker" ? 800 : 600, letterSpacing: 6, textTransform: "uppercase", color: l.accent, marginBottom: 16, textShadow: ts }}>{l.sub}</div> : null;
  return (
    <AbsoluteFill style={{ justifyContent: vAlign, alignItems: hAlign, padding: "10%", pointerEvents: "none" }}>
      {tpl === "split" ? (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, display: "flex", alignItems: "stretch", gap: 30, textAlign: "left", fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          <div style={{ width: 12, background: l.accent, borderRadius: 6, boxShadow: `0 0 26px ${l.accent}aa` }} />
          <div>
            {headline}
            {l.sub && <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: l.accent, marginTop: 14, textShadow: ts }}>{l.sub}</div>}
          </div>
        </div>
      ) : (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, textAlign: l.align, fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          {tpl === "classic" && bar(70, 3)}
          {sub}
          {headline}
          {tpl === "impact" && bar(160, 8)}
          {tpl === "kicker" && bar(90, 4)}
        </div>
      )}
    </AbsoluteFill>
  );
};

const ChartView: React.FC<LV<ChartLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01) return null;
  // Adjustable count speed + easing (the value tweens over `countSec`).
  const CE: Record<string, (t: number) => number> = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  };
  const inF = Math.round(l.timing.inSec * fps);
  const span = Math.max(1, Math.round(((l as any).countSec ?? 1.5) * fps));
  const rawProg = safeInterpolate(frame, [inF, inF + span], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const prog = (CE[(l as any).countEasing] ?? CE.easeOut)(rawProg);
  const dec = Math.max(0, Math.min(4, (l as any).decimals ?? 0));
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
      <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, fontFamily: displayFont(theme), textAlign: "center" }}>
        {l.variant === "counter" && (
          <div style={{ fontSize: 360, fontWeight: 200, color: l.accent, letterSpacing: -6, textShadow: `${textShadow(0.5)}, 0 0 80px ${l.accent}66` }}>
            {l.prefix}{fmt(l.value * prog)}{l.suffix}
          </div>
        )}
        {l.variant === "bar" && (
          <div style={{ display: "flex", gap: 36, alignItems: "flex-end", height: 600 }}>
            {l.series.map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ color: "#fff", fontSize: 30, fontVariantNumeric: "tabular-nums", textShadow: textShadow(0.5) }}>{fmt(s.value * prog)}</div>
                <div style={{ width: 120, height: Math.max(4, (s.value / Math.max(...l.series.map((x) => x.value), 1)) * 480 * prog), background: `linear-gradient(180deg, ${l.accent}99, ${l.accent})`, boxShadow: `0 0 40px ${l.accent}55` }} />
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 26, letterSpacing: 3, textShadow: textShadow(0.5) }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {l.variant === "line" && (() => {
          if (l.series.length < 2) return null;
          const W = 1500, H = 560;
          const max = Math.max(...l.series.map((p) => p.value), 1);
          const visN = Math.max(2, Math.floor(l.series.length * prog));
          const pts = l.series.slice(0, visN).map((p, i) => ({ x: (i / (l.series.length - 1)) * W, y: H - (p.value / max) * H }));
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <svg width={W} height={H} style={{ overflow: "visible" }}>
              <path d={path} fill="none" stroke={l.accent} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 24px ${l.accent}cc)` }} />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={10} fill={l.accent} />
                  <text x={p.x} y={H + 46} fill="#fff" fontSize={26} textAnchor="middle" opacity={0.85} style={{ paintOrder: "stroke" }} stroke="rgba(0,0,0,0.55)" strokeWidth={3}>{l.series[i].label}</text>
                </g>
              ))}
            </svg>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

const ImageView: React.FC<LV<ImageLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  if (tr.opacity < 0.01 || !l.url) return null;
  const a = anchorXY(l.anchor as any, project);
  const w = l.sizePx;
  const content = (
    <>
      <Img src={l.url} style={{ width: w, height: w, objectFit: "cover", borderRadius: l.rounded ? "50%" : 12, border: "3px solid #fff", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }} />
      {l.caption && <div style={{ marginTop: 8, color: "#fff", fontSize: 22, fontFamily: "Inter, sans-serif" }}>{l.caption}</div>}
    </>
  );
  // Screen-anchored (e.g. a brand logo) → fixed to a frame edge, not a map point.
  if ((a as any).screen) {
    const pos = (a as any).pos as "bottom" | "top" | "center";
    const vAlign = pos === "top" ? "flex-start" : pos === "center" ? "center" : "flex-end";
    return (
      <AbsoluteFill style={{ justifyContent: vAlign, alignItems: "flex-end", padding: "3.5%", pointerEvents: "none" }}>
        <div data-layer-id={l.id} style={{ transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, opacity: tr.opacity, textAlign: "center" }}>{content}</div>
      </AbsoluteFill>
    );
  }
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${a.x}px, ${a.y}px) translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", textAlign: "center" }}>
      {content}
    </div>
  );
};
