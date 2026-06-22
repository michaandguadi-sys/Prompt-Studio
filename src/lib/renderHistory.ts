"use client";

/**
 * Render-time history + ETA estimator.
 *
 * Browsers don't expose CPU/RAM, and Remotion's own "time remaining" is wrong
 * during the first 5-10 frames (it averages too few samples). So we keep a
 * rolling history of the last 20 completed renders in localStorage and
 * estimate ETAs based on:
 *   1. Time-per-frame from history, scaled by scene complexity
 *   2. Queue position × average duration of the running job
 *
 * The estimator self-corrects: a user with a fast M3 Pro gets fast estimates,
 * a user on an old MacBook Air gets realistic slow ones — no calibration needed.
 */

const STORAGE_KEY = "promptstudio.renderHistory.v1";
const MAX_ENTRIES = 20;

export type HistoryEntry = {
  /** When this render finished (ms since epoch). */
  at: number;
  /** Total frames rendered. */
  frames: number;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
  /** Resolution scale (0.25–1.0). */
  scale: number;
  /** Complexity score 1.0–5.0. See `complexityOf()`. */
  complexity: number;
};

function load(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {/* quota / private mode */}
}

export function recordRender(entry: Omit<HistoryEntry, "at">) {
  const cur = load();
  cur.push({ ...entry, at: Date.now() });
  save(cur);
}

export function getHistory(): HistoryEntry[] {
  return load();
}

/**
 * Compute a complexity multiplier (~1.0 = simple highlight; ~3.5 = NYC w/
 * terrain + 3D buildings + satellite + route + multiple highlights).
 *
 * Each "heavy" feature multiplies render time by a measured-from-experience
 * factor. The multipliers are empirical — feel free to recalibrate after
 * gathering more history.
 */
export function complexityOf(scene: any): number {
  let c = 1.0;
  // Map style
  const url = scene?.mapStyleUrl ?? "";
  if (url.includes("satellite")) c *= 1.3;
  // 3D terrain (expensive: DEM tile fetches per frame)
  if (scene?.terrain?.enabled) c *= 1.5;
  // 3D buildings (fill-extrusion)
  if (scene?.show3dBuildings) c *= 1.2;
  // Route geometry — more coords = more line-trim work
  const coords = scene?.route?.coordinates?.length ?? 0;
  if (coords > 0) c *= 1 + Math.min(0.3, coords / 1000);
  // Highlight polygons — large multipolygons are slow to tessellate
  const highlights = (scene?.highlights ?? (scene?.highlight ? [scene.highlight] : [])).length;
  c *= 1 + 0.1 * highlights;
  // Labels — counter variants animate per frame
  const labels = scene?.labels?.length ?? 0;
  c *= 1 + 0.03 * labels;
  return Math.min(5.0, c);
}

/**
 * Estimate render duration in seconds based on history.
 *
 * Strategy:
 *  - If we have ≥3 entries: use weighted-recent average of (ms/frame / complexity)
 *    × current complexity × scale-adjustment.
 *  - Else: fall back to a hardcoded baseline (1.5 s/frame at scale 0.5,
 *    complexity 1.0) — calibrated from a real M2 Pro test.
 */
export function estimateRenderSec(
  frames: number,
  scale: number,
  complexity: number,
): number {
  const history = load();

  // Resolution scaling — render time grows roughly with pixel count (∝ scale²)
  // Cap at 4× since GPU bottlenecks differently above that.
  const scaleFactor = Math.min(4, Math.pow(scale / 0.5, 2));

  let msPerFramePerComplexity: number;
  if (history.length >= 3) {
    // Weighted recent average — newer entries weighted higher
    let sum = 0, weight = 0;
    for (let i = 0; i < history.length; i++) {
      const e = history[i];
      const w = i + 1; // most recent gets highest weight
      const per = e.durationMs / e.frames / Math.max(0.1, e.complexity) / Math.max(0.1, Math.pow(e.scale / 0.5, 2));
      sum += per * w;
      weight += w;
    }
    msPerFramePerComplexity = sum / weight;
  } else {
    // Baseline calibration from M2 Pro Mapbox draft renders
    msPerFramePerComplexity = 800;
  }

  const totalMs = msPerFramePerComplexity * frames * complexity * scaleFactor;
  return Math.max(1, Math.round(totalMs / 1000));
}

/** Human-friendly: "3m 24s" or "47s" or "1h 12m". */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
