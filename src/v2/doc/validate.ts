/**
 * Pre-render scene validation — the QA gate every render passes through.
 *
 * Philosophy: FIX what is mechanically fixable (clamped timings, NaN camera
 * poses, overlapping titles, captions with no text), WARN about what needs a
 * human (empty geometry, missing narration), and never block a render on a
 * cosmetic issue. Runs server-side in /api/v2/render before enqueue; the
 * fixed composition is what actually renders.
 */

import type { Composition, Layer, CameraPose } from "./schema";
import { minZoomForAspect } from "./schema";

export type ValidationIssue = {
  level: "fixed" | "warning";
  layer?: string;
  message: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function fixPose(p: CameraPose | undefined, issues: ValidationIssue[], where: string, minZoom = 0.5): CameraPose {
  const fixed: CameraPose = {
    lon: clamp(finiteOr(p?.lon, 0), -180, 180),
    lat: clamp(finiteOr(p?.lat, 20), -85, 85),
    // Floor at the aspect's world-wrap zoom so one world copy always fills the
    // frame — no duplicated landmasses at the widest pull-back.
    zoom: clamp(finiteOr(p?.zoom, 3), minZoom, 22),
    pitch: clamp(finiteOr(p?.pitch, 0), 0, 85),
    bearing: finiteOr(p?.bearing, 0) % 360,
  };
  if (!p || !Number.isFinite(p.lon) || !Number.isFinite(p.lat) || !Number.isFinite(p.zoom)) {
    issues.push({ level: "fixed", message: `Camera ${where} had an invalid position — clamped to a safe pose.` });
  }
  return fixed;
}

function hasRealGeometry(geojson: any): boolean {
  try {
    const g = geojson?.type === "FeatureCollection" ? geojson.features?.[0]?.geometry
      : geojson?.type === "Feature" ? geojson.geometry : geojson;
    if (!g) return false;
    if (g.type === "Polygon") return (g.coordinates?.[0]?.length ?? 0) >= 4;
    if (g.type === "MultiPolygon") return (g.coordinates?.[0]?.[0]?.length ?? 0) >= 4;
    if (g.type === "LineString") return (g.coordinates?.length ?? 0) >= 2;
    return true;
  } catch { return false; }
}

/**
 * Validate + auto-fix ONE composition in place. Returns the issue list —
 * `fixed` entries are informational (already handled), `warning` entries
 * deserve a look but don't block the render.
 */
export function validateComposition(comp: Composition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── Duration ──
  if (!Number.isFinite(comp.durationSec) || comp.durationSec < 1 || comp.durationSec > 300) {
    const fixedDur = clamp(finiteOr(comp.durationSec, 8), 1, 300);
    issues.push({ level: "fixed", message: `Scene duration ${comp.durationSec}s out of range — set to ${fixedDur}s.` });
    comp.durationSec = fixedDur;
  }
  const dur = comp.durationSec;

  // ── Camera ──
  const cam = comp.layers.find((l) => l.type === "camera") as any;
  if (cam) {
    const zoomFloor = minZoomForAspect(comp.aspect);
    cam.start = fixPose(cam.start, issues, "start", zoomFloor);
    cam.end = fixPose(cam.end, issues, "end", zoomFloor);
    if (Array.isArray(cam.waypoints)) cam.waypoints = cam.waypoints.map((w: CameraPose, i: number) => fixPose(w, issues, `waypoint ${i + 1}`, zoomFloor));
    if (typeof cam.moveFraction === "number" && (cam.moveFraction < 0.3 || cam.moveFraction > 1)) {
      cam.moveFraction = clamp(cam.moveFraction, 0.3, 1);
      issues.push({ level: "fixed", message: "Camera move fraction clamped to a readable range." });
    }
  } else {
    issues.push({ level: "warning", message: "No camera layer — the scene renders as a static frame." });
  }

  // ── Per-layer timing sanity ──
  for (const l of comp.layers as any[]) {
    if (l.type === "camera" || !l.timing) continue;
    const t = l.timing;
    const name = l.name || l.type;
    if (typeof t.inSec === "number" && (t.inSec < 0 || t.inSec > dur - 0.2)) {
      t.inSec = clamp(t.inSec, 0, Math.max(0, dur - 0.5));
      issues.push({ level: "fixed", layer: name, message: `"${name}" entered outside the scene — timing clamped.` });
    }
    if (t.outSec != null && (!Number.isFinite(t.outSec) || t.outSec <= (t.inSec ?? 0) + 0.2)) {
      t.outSec = null;
      issues.push({ level: "fixed", layer: name, message: `"${name}" exited before it entered — exit removed (holds to end).` });
    }
  }

  // ── Title overlap (the T1 rule): two titles must never be on screen together ──
  const titles = (comp.layers as any[])
    .filter((l) => l.type === "title" && l.enabled !== false && l.timing)
    .sort((a, b) => (a.timing.inSec ?? 0) - (b.timing.inSec ?? 0));
  for (let i = 0; i < titles.length - 1; i++) {
    const a = titles[i], b = titles[i + 1];
    const aOut = a.timing.outSec ?? dur;
    if (aOut > (b.timing.inSec ?? 0) - 0.1) {
      a.timing.outSec = Math.max((a.timing.inSec ?? 0) + 0.6, (b.timing.inSec ?? 0) - 0.15);
      issues.push({ level: "fixed", layer: a.name || "title", message: `Two titles overlapped on screen — "${(a as any).text ?? a.name}" now exits before the next enters.` });
    }
  }

  // ── Geometry present where geometry is required ──
  for (const l of comp.layers as any[]) {
    if (l.enabled === false) continue;
    const name = l.name || l.type;
    if (l.type === "highlight" && !hasRealGeometry(l.geojson)) {
      issues.push({ level: "warning", layer: name, message: `Highlight "${name}" has no boundary geometry — it won't be visible.` });
    }
    if (l.type === "route" && (!Array.isArray(l.coordinates) || l.coordinates.length < 2)) {
      issues.push({ level: "warning", layer: name, message: `Route "${name}" has fewer than 2 points — it won't draw.` });
    }
  }

  // ── Captions enabled but nothing to say ──
  const lookAny = comp.look as any;
  if (lookAny?.showCaptions && !comp.narration && !(comp as any).narrationLines?.length) {
    lookAny.showCaptions = false;
    issues.push({ level: "fixed", message: "Captions were on with no narration — turned off." });
  }
  if (!comp.narration && !(comp as any).narrationLines?.length && titles.length === 0) {
    issues.push({ level: "warning", message: "Scene has no narration and no titles — consider adding one line of story." });
  }

  return issues;
}

/** Validate every scene of a project (composition + scenes[]). */
export function validateProject(project: { composition: Composition; scenes?: { composition: Composition; name?: string }[] }): ValidationIssue[] {
  const all: ValidationIssue[] = [];
  const seen = new Set<Composition>();
  for (const [label, c] of [["main", project.composition] as const, ...(project.scenes ?? []).map((s, i) => [s.name || `scene ${i + 1}`, s.composition] as const)]) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    for (const issue of validateComposition(c)) {
      all.push(label === "main" ? issue : { ...issue, message: `[${label}] ${issue.message}` });
    }
  }
  return all;
}
