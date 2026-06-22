import type { RawTrack, RawPoint, NormalizedTrack } from "./types";

/**
 * Deterministic preprocessing pipeline (runs once per import):
 *   clean (drop bad/dupe coords)
 *     → split on time gaps (pauses) into segments
 *     → smooth GPS jitter (segment-aware moving average)
 *     → RDP simplify (strip redundant vertices)
 *     → resample to even arc-length spacing within a point budget
 *     → compute stats
 * Output maps 1:1 onto the `track` layer's data fields.
 */

export interface PreprocessOpts {
  /** Target clean point count (300–800 typical). Lower for live web camera. */
  budget?: number;
  /** Moving-average half-window for jitter smoothing. */
  smoothWindow?: number;
  /** RDP tolerance in metres (redundant-vertex removal). */
  simplifyToleranceM?: number;
  /** Minimum pause length (seconds) that splits the track into a new segment. */
  pauseGapS?: number;
}

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
function haversine(a: RawPoint, b: RawPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 1) Drop non-finite / out-of-range coords and consecutive zero-distance dupes. */
function clean(points: RawPoint[]): RawPoint[] {
  const out: RawPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) continue;
    const prev = out[out.length - 1];
    if (prev && prev.lon === p.lon && prev.lat === p.lat) continue; // exact dupe
    out.push(p);
  }
  return out;
}

/** 2) Split into segments on large time gaps (lunch breaks, pauses). */
function splitSegments(points: RawPoint[], pauseGapS: number): RawPoint[][] {
  const dts: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].t, b = points[i].t;
    if (a != null && b != null) dts.push(b - a);
  }
  if (!dts.length) return [points]; // no timestamps → one segment
  const threshold = Math.max(pauseGapS * 1000, 6 * median(dts.filter((d) => d > 0)));

  const segs: RawPoint[][] = [];
  let cur: RawPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i - 1]?.t, b = points[i].t;
    if (i > 0 && a != null && b != null && b - a > threshold) {
      if (cur.length) segs.push(cur);
      cur = [];
    }
    cur.push(points[i]);
  }
  if (cur.length) segs.push(cur);
  return segs.filter((s) => s.length > 0);
}

/** 3) Moving-average smoothing of lon/lat/ele (within a segment only). */
function smooth(seg: RawPoint[], win: number): RawPoint[] {
  if (seg.length < 3 || win < 1) return seg;
  return seg.map((p, i) => {
    if (i === 0 || i === seg.length - 1) return p; // anchor endpoints so smoothing never shortens the track
    let lon = 0, lat = 0, n = 0, ele = 0, eN = 0;
    for (let k = -win; k <= win; k++) {
      const q = seg[i + k];
      if (!q) continue;
      lon += q.lon; lat += q.lat; n++;
      if (q.ele != null) { ele += q.ele; eN++; }
    }
    return { lon: lon / n, lat: lat / n, ele: eN ? ele / eN : p.ele, t: p.t };
  });
}

/** 4) Ramer–Douglas–Peucker on a segment; tolerance in metres. */
function rdp(seg: RawPoint[], tolM: number): RawPoint[] {
  if (seg.length < 3) return seg;
  // Local equirectangular projection (metres) anchored at the first point.
  const lat0 = toRad(seg[0].lat);
  const kx = EARTH_R * Math.cos(lat0), ky = EARTH_R;
  const X = seg.map((p) => toRad(p.lon) * kx);
  const Y = seg.map((p) => toRad(p.lat) * ky);

  const keep = new Uint8Array(seg.length);
  keep[0] = 1; keep[seg.length - 1] = 1;
  const stack: [number, number][] = [[0, seg.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1, idx = -1;
    const xa = X[a], ya = Y[a], xb = X[b], yb = Y[b];
    const dx = xb - xa, dy = yb - ya;
    const len2 = dx * dx + dy * dy || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const tt = ((X[i] - xa) * dx + (Y[i] - ya) * dy) / len2;
      const px = xa + tt * dx, py = ya + tt * dy;
      const d = Math.hypot(X[i] - px, Y[i] - py);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > a) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return seg.filter((_, i) => keep[i]);
}

/** 5) Resample a segment to ~n evenly arc-spaced points (linear interpolation). */
function resample(seg: RawPoint[], n: number): RawPoint[] {
  if (seg.length <= 1 || n <= 1) return seg.slice(0, 1);
  const cum: number[] = [0];
  for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + haversine(seg[i - 1], seg[i]));
  const total = cum[cum.length - 1];
  if (total === 0) return [seg[0]];

  const out: RawPoint[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < seg.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j] || 1e-9;
    const f = Math.min(1, Math.max(0, (target - cum[j]) / span));
    const a = seg[j], b = seg[j + 1];
    out.push({
      lon: a.lon + (b.lon - a.lon) * f,
      lat: a.lat + (b.lat - a.lat) * f,
      ele: a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * f : (a.ele ?? b.ele),
      t: a.t != null && b.t != null ? Math.round(a.t + (b.t - a.t) * f) : (a.t ?? b.t),
    });
  }
  return out;
}

export function preprocess(raw: RawTrack, opts: PreprocessOpts = {}): NormalizedTrack {
  const budget = opts.budget ?? 600;
  const smoothWindow = opts.smoothWindow ?? 2;
  const tolM = opts.simplifyToleranceM ?? 3;
  const pauseGapS = opts.pauseGapS ?? 20;

  const rawCount = raw.points.length;
  const cleaned = clean(raw.points);
  const rawSegments = splitSegments(cleaned, pauseGapS);

  // Smooth + RDP each segment, then resample to a length-proportional share of
  // the global point budget (so the camera/draw move at even speed).
  const prepped = rawSegments.map((s) => rdp(smooth(s, smoothWindow), tolM));
  const segLen = prepped.map((s) => {
    let d = 0; for (let i = 1; i < s.length; i++) d += haversine(s[i - 1], s[i]); return d;
  });
  const totalLen = segLen.reduce((a, b) => a + b, 0) || 1;

  const finalSegs = prepped.map((s, i) => {
    const share = Math.max(2, Math.round((budget * segLen[i]) / totalLen));
    return resample(s, Math.min(share, Math.max(2, s.length * 4)));
  });

  // Flatten + record segment boundary indices.
  const points: RawPoint[] = [];
  const segments: number[] = [];
  finalSegs.forEach((s, i) => {
    if (i > 0) segments.push(points.length); // index where this segment starts
    for (const p of s) points.push(p);
  });

  // ── stats (segment-aware: never measure across a pause) ──
  let distanceM = 0, ascentM = 0, descentM = 0;
  const boundary = new Set(segments);
  for (let i = 1; i < points.length; i++) {
    if (boundary.has(i)) continue; // don't sum across the gap
    distanceM += haversine(points[i - 1], points[i]);
    const ea = points[i - 1].ele, eb = points[i].ele;
    if (ea != null && eb != null) { const d = eb - ea; if (d > 0) ascentM += d; else descentM += -d; }
  }

  const lons = points.map((p) => p.lon), lats = points.map((p) => p.lat);
  const w = Math.min(...lons), e = Math.max(...lons), s = Math.min(...lats), n = Math.max(...lats);
  const bbox: [number, number, number, number] = points.length ? [w, s, e, n] : [0, 0, 0, 0];
  const midpoint: [number, number] = points.length ? [(w + e) / 2, (s + n) / 2] : [0, 0];

  const tVals = points.map((p) => p.t).filter((t): t is number => t != null);
  const hasTime = tVals.length > 1;
  const durationS = hasTime ? Math.round((Math.max(...tVals) - Math.min(...tVals)) / 1000) : null;
  const hasElevation = points.some((p) => p.ele != null) && (ascentM + descentM) > 0;

  return {
    name: raw.name,
    points,
    segments,
    hasElevation,
    hasTime,
    stats: { rawCount, cleanCount: points.length, distanceM, ascentM, descentM, durationS, bbox, midpoint },
  };
}
