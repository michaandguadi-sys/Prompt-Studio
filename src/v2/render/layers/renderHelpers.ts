import React from "react";
import { Theme, HighlightLayer, CameraLayer, CameraPose, RouteLayer, TrackLayer, Look } from "../../doc/schema";
import { fontStack } from "../../doc/themes";
import { centroidOf } from "../../../lib/geo";
import { patternImageId } from "../../../lib/mapPatterns";
import { linearChain } from "../../../lib/interp";

/* ── Render State (Module Singletons) ─────────────────────────────────────── */
export let LIVE_ZOOM = 8;
export let LIVE_FRAME = 0;
export let LIVE_TOTAL = 1;

export function updateLiveState(zoom: number, frame: number, total: number) {
  LIVE_ZOOM = zoom;
  LIVE_FRAME = frame;
  LIVE_TOTAL = total;
}

/* ── Theme (fonts) propagation ──────────────────────────────────────────────── */
export const DEFAULT_THEME: Theme = { name: "Default", accent: "#6E7BFF", fill: "#6E7BFF", border: "#6E7BFF", glow: "#6E7BFF", text: "#ffffff", fontDisplay: "Inter", fontBody: "Inter" };
export const ThemeCtx = React.createContext<Theme>(DEFAULT_THEME);
export const useTheme = () => React.useContext(ThemeCtx);
export const displayFont = (theme: Theme, override?: string | null) => fontStack(override || theme.fontDisplay);
export const bodyFont = (theme: Theme, override?: string | null) => fontStack(override || theme.fontBody);

/* ── Flag-fill helpers ────────────────────────────────────────────────────── */
export const flagIsoOf = (l: HighlightLayer): string => (l.flagISO || l.countryISO || "").toLowerCase();
export const flagImageId = (iso: string) => `ps-flag-${iso}`;

export function fillSource(l: HighlightLayer): Record<string, unknown> {
  if (l.fillType !== "solid" && l.fillType !== "flag") return { "fill-pattern": patternImageId(l.fillType as any, l.fillColor) };
  return { "fill-color": l.fillColor };
}

export function polygonRings(geojson: any): number[][][] {
  const g = geojson?.type === "FeatureCollection" ? geojson.features?.[0]?.geometry
    : geojson?.type === "Feature" ? geojson.geometry : geojson;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates ?? [];
  if (g.type === "MultiPolygon") return (g.coordinates ?? []).flatMap((poly: any) => poly);
  return [];
}

export function exteriorRings(geo: any): number[][][] {
  const g = geo?.type === "FeatureCollection" ? geo.features?.[0]?.geometry : geo?.type === "Feature" ? geo.geometry : geo;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates?.[0] ? [g.coordinates[0]] : [];
  if (g.type === "MultiPolygon") return (g.coordinates ?? []).map((poly: any) => poly?.[0]).filter(Boolean);
  return [];
}

export function ringsCenter(geo: any): [number, number] {
  const rings = polygonRings(geo);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const p of ring) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  return isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : [0, 0];
}

/* ── Math / Interpolation ─────────────────────────────────────────────────── */
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (x: number) => { const t = clampN(x, 0, 1); return t * t * (3 - 2 * t); };
const finiteOr = (v: number, d: number) => (Number.isFinite(v) ? v : d);

/* ── Camera Helpers ───────────────────────────────────────────────────────── */
export function sanitizePose(p: CameraPose): CameraPose {
  return {
    lon: clampN(finiteOr(p.lon, 0), -180, 180),
    lat: clampN(finiteOr(p.lat, 20), -85, 85),
    zoom: clampN(finiteOr(p.zoom, 3), 0.5, 22),
    pitch: clampN(finiteOr(p.pitch, 0), 0, 84),
    bearing: finiteOr(p.bearing, 0) % 360,
  };
}

export function zoomForBounds(coords: [number, number][]): number {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLon)) return 4;
  const latRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonSpan = Math.max(0.0005, (maxLon - minLon) * Math.cos(latRad));
  const latSpan = Math.max(0.0005, (maxLat - minLat) * 1.6);
  const span = Math.max(lonSpan, latSpan);
  return clampN(Math.log2(360 / span) - 0.7, 1.2, 12);
}

/* ── Documentary camera path ──────────────────────────────────────────────────
 * The multi-stop flight scheduler that makes journeys feel like a professional
 * documentary edit instead of a spline tween:
 *   • Travel time is weighted by GEOGRAPHIC DISTANCE (sublinear, with a floor)
 *     so a short hop doesn't teleport and a transatlantic leg doesn't crawl.
 *   • The camera DWELLS at every intermediate stop — it arrives, settles, holds
 *     while that beat's content plays, then departs. Beats are led, not chased.
 *   • Every leg is eased individually (ease-in-out cubic): anticipation on
 *     departure, settling on arrival. No mid-journey speed jumps at waypoints.
 *   • Long hops get a ZOOM BELL (pull out, travel wide, descend) — the classic
 *     Google-Earth flight arc that keeps geography readable — computed with a
 *     quadratic blend that can never overshoot (unlike Catmull-Rom).
 *   • Bearing takes the SHORTEST arc (349°→2° turns 13°, not −347°).
 */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shortestBearingLerp(a: number, b: number, t: number): number {
  let d = (((b - a) % 360) + 540) % 360 - 180;
  return a + d * t;
}

/** Approximate geographic distance between poses in "degree units". */
function poseDistance(a: CameraPose, b: CameraPose): number {
  const latMid = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  return Math.hypot((b.lon - a.lon) * Math.cos(latMid), b.lat - a.lat);
}

/** Interpolate one leg with easing + zoom bell. `t` is raw 0–1 within the leg. */
function legPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const e = easeInOutCubic(clampN(t, 0, 1));
  const dist = poseDistance(a, b);
  // Zoom bell: only when the hop is long enough to need geographic context.
  // Pull-out strength grows with distance, capped so we never leave the planet.
  const pullOut = dist > 3 ? clampN(dist / 25, 0.4, 2.4) : 0;
  const zMid = Math.min(a.zoom, b.zoom) - pullOut;
  // Quadratic Bézier blend — smooth, bounded, no overshoot by construction.
  const zoom = (1 - e) * (1 - e) * a.zoom + 2 * (1 - e) * e * zMid + e * e * b.zoom;
  return {
    lon: lerp(a.lon, b.lon, e),
    lat: lerp(a.lat, b.lat, e),
    zoom,
    pitch: lerp(a.pitch, b.pitch, e),
    bearing: shortestBearingLerp(a.bearing, b.bearing, e),
  };
}

/** Fraction of one average leg's time spent HOLDING at each intermediate stop. */
const DWELL_WEIGHT = 0.55;

function documentaryPath(path: CameraPose[], progress: number): CameraPose {
  const n = path.length;
  if (n === 0) return { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 };
  if (n === 1) return { ...path[0] };
  // Segment weights: leg₀, dwell₁, leg₁, dwell₂, …, legₙ₋₂  (no dwell at the
  // endpoints — the scene's own moveFraction hold covers the final frame).
  const legW: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    // Sublinear distance weighting with a floor: short hops still get real time.
    legW.push(Math.max(0.25, Math.pow(poseDistance(path[i], path[i + 1]), 0.6)));
  }
  const avgLeg = legW.reduce((a, b) => a + b, 0) / legW.length;
  const dwellW = avgLeg * DWELL_WEIGHT;
  const segs: { kind: "leg" | "dwell"; i: number; w: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    segs.push({ kind: "leg", i, w: legW[i] });
    if (i < n - 2) segs.push({ kind: "dwell", i: i + 1, w: dwellW });
  }
  const total = segs.reduce((a, s) => a + s.w, 0) || 1;
  let target = clampN(progress, 0, 1) * total;
  for (const s of segs) {
    if (target <= s.w || s === segs[segs.length - 1]) {
      if (s.kind === "dwell") return { ...path[s.i] };
      return legPose(path[s.i], path[s.i + 1], s.w > 0 ? target / s.w : 1);
    }
    target -= s.w;
  }
  return { ...path[n - 1] };
}

function pathPose(cam: CameraLayer, progress: number, reverse = false): CameraPose {
  const path = reverse ? [cam.end, ...[...cam.waypoints].reverse(), cam.start] : [cam.start, ...cam.waypoints, cam.end];
  // Multi-stop journeys ride the documentary scheduler (distance-weighted travel,
  // dwell at stops, zoom bells, per-leg easing). Simple start→end shots keep the
  // classic single-tween behaviour driven by the scene's own easing curve.
  if (path.length >= 3) return documentaryPath(path, progress);
  const pick = (key: keyof CameraPose) => {
    const vals = path.map((p) => p[key] as number);
    return key === "bearing" && vals.length === 2
      ? shortestBearingLerp(vals[0], vals[1], clampN(progress, 0, 1))
      : linearChain(vals, progress);
  };
  return { lon: pick("lon"), lat: pick("lat"), zoom: pick("zoom"), pitch: pick("pitch"), bearing: pick("bearing") };
}

export function poseAt(cam: CameraLayer, p: number): CameraPose {
  const s = cam.start, e = cam.end;
  switch (cam.style) {
    case "hold": return { ...e };
    case "zoom-out": return pathPose(cam, p, true);
    case "pan": {
      const span = (360 / Math.pow(2, e.zoom)) * 0.7;
      return { lon: e.lon - span / 2 + span * p, lat: e.lat, zoom: e.zoom, pitch: e.pitch, bearing: e.bearing };
    }
    case "orbit": return { lon: e.lon, lat: e.lat, zoom: lerp(s.zoom, e.zoom, Math.min(1, p * 1.3)), pitch: Math.max(e.pitch, 40), bearing: s.bearing + p * 75 };
    case "push-in": {
      const base = pathPose(cam, p);
      return { ...base, pitch: lerp(0, Math.max(e.pitch, 60), p) };
    }
    case "fly-in": default: return pathPose(cam, p);
  }
}

export function highlightPose(geojson: any, p: number, cam?: CameraLayer): CameraPose {
  const c = (() => { try { return centroidOf(geojson); } catch { return [0, 20]; } })();
  const wide = cam?.start.zoom ?? 2.4;
  const tight = cam?.end.zoom ?? 4.6;
  return { lon: c[0], lat: c[1], zoom: lerp(wide, tight, clampN(p * 1.15, 0, 1)), pitch: cam?.end.pitch ?? 30, bearing: cam?.end.bearing ?? 0 };
}

/* ── Route Helpers ────────────────────────────────────────────────────────── */
export function pointAlong(coords: [number, number][], t: number): [number, number] {
  const n = coords.length;
  if (n === 0) return [0, 20];
  if (n === 1) return coords[0];
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

export function routeCoords(l: RouteLayer): [number, number][] {
  const c = (l.coordinates as [number, number][]) ?? [];
  return l.direction === "reverse" ? [...c].reverse() : c;
}

export function chaikin(pts: [number, number][], iters: number): [number, number][] {
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

export function finalRouteCoords(l: RouteLayer): [number, number][] {
  const directed = routeCoords(l);
  const sm = (l as any).smoothness ?? 0;
  if (sm <= 0 || directed.length < 3) return directed;
  return chaikin(directed, Math.round(sm * 3));
}

const _routeStopCache = new WeakMap<object, { at: number; pauseSec: number; weight: number }[]>();
export function routeStops(l: RouteLayer): { at: number; pauseSec: number; weight: number }[] {
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

export function routeTravel(l: RouteLayer, frame: number, fps: number, totalFrames: number): number {
  const start = Math.round((l.timing?.inSec ?? 0) * fps);
  const dur = Math.max(1, Math.round((l.drawFraction ?? 0.6) * totalFrames));
  const e = frame - start;
  if (e <= 0) return 0;
  const stops = routeStops(l);
  if (!stops.length) return smoothstep(e / dur);
  const bounds = [0, ...stops.map((s) => s.at), 1];
  const weights = [...stops.map((s) => s.weight), 1];
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  for (let i = 0; i < weights.length; i++) {
    const legFrames = Math.max(1, Math.round((dur * weights[i]) / wsum));
    if (e < t + legFrames) return lerp(bounds[i], bounds[i + 1], smoothstep((e - t) / legFrames));
    t += legFrames;
    if (i < stops.length) {
      const p = Math.max(0, Math.round((stops[i].pauseSec || 0) * fps));
      if (e < t + p) return bounds[i + 1];
      t += p;
    }
  }
  return 1;
}

export function geoBearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a[1]), φ2 = toRad(b[1]), Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function followRoutePose(route: RouteLayer, travel: number, cam?: CameraLayer): CameraPose {
  const coords = finalRouteCoords(route);
  if (!coords || coords.length < 2) return cam ? poseAt(cam, travel) : { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 };
  const mode = route.cameraMode ?? "follow";
  const frameZoom = zoomForBounds(coords);
  if (mode === "frame" || mode === "orbit") {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lo, la] of coords) { if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo; if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
    const zoom = lerp(Math.max(1.4, frameZoom - 0.6), frameZoom, smoothstep(travel));
    const bearing = mode === "orbit" ? (cam?.end.bearing ?? 0) + travel * 60 : (cam?.end.bearing ?? 0);
    const pitch = mode === "orbit" ? Math.max(cam?.end.pitch ?? 0, 45) : (cam?.end.pitch ?? 30);
    return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2, zoom, pitch, bearing };
  }
  const head = pointAlong(coords, clampN(travel + 0.03, 0, 1));
  const travelZoom = clampN(frameZoom + 1.4, 2, 13);
  const settle = clampN(travel * 5, 0, 1);
  const zoom = lerp(Math.max(1.4, frameZoom - 0.6), travelZoom, settle);
  let bearing = cam?.end.bearing ?? 0;
  if (mode === "chase") {
    const behind = pointAlong(coords, clampN(travel - 0.04, 0, 1));
    bearing = geoBearing(behind, head) * settle;
  }
  return { lon: head[0], lat: head[1], zoom, pitch: cam?.end.pitch ?? 40, bearing };
}

export function trimLineCoords(coords: number[][], frac: number): number[][] {
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


/* ── Track Helpers ────────────────────────────────────────────────────────── */
export function trackTravel(l: TrackLayer, frame: number, fps: number, totalFrames: number): number {
  const startF = Math.round((l.timing?.inSec ?? 0) * fps);
  const span = Math.max(1, totalFrames - startF);
  return clampN(((frame - startF) / span) * (l.speed ?? 1), 0, 1);
}

export function trackCorners(l: TrackLayer): [number, number][] {
  const [w, s, e, n] = l.stats.bbox;
  return [[w, s], [e, s], [e, n], [w, n]];
}

export function smoothHeading(coords: [number, number][], t: number, win = 0.05, n = 5): number {
  let sx = 0, sy = 0;
  for (let k = 0; k < n; k++) {
    const a = clampN(t - win + (2 * win) * (k / (n - 1)), 0, 1);
    const b = clampN(a + 0.02, 0, 1);
    const br = (geoBearing(pointAlong(coords, a), pointAlong(coords, b)) * Math.PI) / 180;
    sx += Math.cos(br); sy += Math.sin(br);
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI;
}

export function trackPose(l: TrackLayer, frame: number, fps: number, totalFrames: number): CameraPose {
  const corners = trackCorners(l);
  const baseZoom = zoomForBounds(corners) + (l.zoomOffset ?? 0);
  const [cLon, cLat] = l.stats.midpoint;
  const variant = l.variant ?? "overview-draw";
  if (variant === "overview-draw") return { lon: cLon, lat: cLat, zoom: baseZoom + 0.6, pitch: l.pitch ?? 0, bearing: l.bearingOffset ?? 0 };
  const t = trackTravel(l, frame, fps, totalFrames);
  const coords = l.points.map((p) => [p.lon, p.lat] as [number, number]);
  if (coords.length < 2) return { lon: cLon, lat: cLat, zoom: baseZoom, pitch: l.pitch ?? 60, bearing: l.bearingOffset ?? 0 };
  const head = pointAlong(coords, clampN(t + 0.02, 0, 1));
  const settle = clampN(t * 5, 0, 1);
  const travelZoom = clampN(zoomForBounds(corners) + 2.4, 2, 16) + (l.zoomOffset ?? 0);
  const heading = smoothHeading(coords, t);
  if (variant === "hybrid-dive") {
    const dive = smoothstep(clampN((t - 0.15) / 0.2, 0, 1)) * (1 - smoothstep(clampN((t - 0.75) / 0.2, 0, 1)));
    const zoom = lerp(baseZoom, travelZoom, smoothstep(dive));
    const pitch = lerp(0, l.pitch ?? 55, dive);
    const bearing = heading * dive + (l.bearingOffset ?? 0);
    const lon = lerp(cLon, head[0], dive), lat = lerp(cLat, head[1], dive);
    return { lon, lat, zoom, pitch, bearing };
  }
  const zoom = lerp(baseZoom, travelZoom, smoothstep(settle));
  const bearing = heading * settle + (l.bearingOffset ?? 0);
  return { lon: head[0], lat: head[1], zoom, pitch: l.pitch ?? 60, bearing };
}

export function trackLines(l: TrackLayer, i0: number, i1: number): [number, number][][] {
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

export function trackWindow(l: TrackLayer): [number, number] {
  const N = l.points.length;
  const i0 = Math.min(N - 1, Math.max(0, Math.round((l.trimStart ?? 0) * (N - 1))));
  const i1 = Math.max(i0 + 1, Math.min(N - 1, Math.round((l.trimEnd ?? 1) * (N - 1))));
  return [i0, i1];
}

/* ── DOM Overlay Styles & Transform Helpers ───────────────────────────────── */
export function textShadow(strength = 0.55): string {
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0.001) return "none";
  const a1 = (0.55 + 0.4 * s).toFixed(2);
  const a2 = (0.3 + 0.5 * s).toFixed(2);
  return `0 1px 2px rgba(0,0,0,${a1}), 0 ${Math.round(2 + 4 * s)}px ${Math.round(8 + 26 * s)}px rgba(0,0,0,${a2})`;
}

export function outlineStyle(on: boolean | undefined, size: number): React.CSSProperties {
  return on ? { WebkitTextStroke: `${Math.max(1.5, size * 0.018).toFixed(1)}px rgba(0,0,0,0.92)`, paintOrder: "stroke" } : {};
}

export function interpKf(kf: any[], p: number) {
  const ks = [...kf].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (p <= (ks[0].t ?? 0)) return ks[0];
  const last = ks[ks.length - 1];
  if (p >= (last.t ?? 1)) return last;
  let a = ks[0], b = last;
  for (let i = 0; i < ks.length - 1; i++) { if (p >= (ks[i].t ?? 0) && p <= (ks[i + 1].t ?? 1)) { a = ks[i]; b = ks[i + 1]; break; } }
  const span = ((b.t ?? 1) - (a.t ?? 0)) || 1;
  const f = (p - (a.t ?? 0)) / span;
  const L = (x: number, y: number) => x + (y - x) * f;
  return { offsetXPct: L(a.offsetXPct ?? 0, b.offsetXPct ?? 0), offsetYPct: L(a.offsetYPct ?? 0, b.offsetYPct ?? 0), scale: L(a.scale ?? 1, b.scale ?? 1), rotation: L(a.rotation ?? 0, b.rotation ?? 0), opacity: L(a.opacity ?? 1, b.opacity ?? 1) };
}

export function kfOpacityMul(l: any): number {
  const kf = l?.kf;
  if (!kf || kf.length < 2) return 1;
  const p = LIVE_TOTAL > 0 ? clampN(LIVE_FRAME / LIVE_TOTAL, 0, 1) : 0;
  return clampN(interpKf(kf, p).opacity ?? 1, 0, 1);
}

export function tfStyle(l: any, w: number, h: number): string {
  const t = l?.transform ?? {};
  let ox = t.offsetXPct ?? 0, oy = t.offsetYPct ?? 0, s = t.scale ?? 1, r = t.rotation ?? 0;
  const kf = l?.kf;
  if (kf && kf.length >= 2) {
    const p = LIVE_TOTAL > 0 ? clampN(LIVE_FRAME / LIVE_TOTAL, 0, 1) : 0;
    const k = interpKf(kf, p);
    ox = k.offsetXPct; oy = k.offsetYPct; s = k.scale; r = k.rotation;
  }
  if (t.scaleWithZoom) {
    const ref = t.anchorZoom || LIVE_ZOOM;
    s *= clampN(Math.pow(2, (LIVE_ZOOM - ref) * 0.8), 0.12, 12);
  }
  const dx = (ox / 100) * w, dy = (oy / 100) * h;
  if (!dx && !dy && s === 1 && r === 0) return "";
  return ` translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)}) rotate(${r}deg)`;
}

export function hexA(hex: string, a: number): string {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

export type LV<T> = { layer: T; frame: number; fps: number; totalFrames: number; project?: (lon: number, lat: number) => { x: number; y: number } };

export function anchorXY(anchor: any, project: LV<any>["project"]) {
  if (anchor.kind === "coord" && project) { const p = project(anchor.lon, anchor.lat); return { x: p.x, y: p.y, screen: false as const }; }
  return { x: 0, y: 0, screen: true as const, pos: anchor.kind === "screen" ? anchor.pos : "bottom" };
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */
export function circleNgon(cx: number, cy: number, rx: number, ry: number, n = 56): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}

export function clipRingByConvex(subject: number[][], clip: number[][]): number[][] {
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

export function growClipGeometry(geo: any, origin: [number, number], frac: number): any {
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
  const e = 1e-4;
  return { type: "Polygon", coordinates: [[origin, [origin[0] + e, origin[1]], [origin[0] + e, origin[1] + e], origin]] };
}
