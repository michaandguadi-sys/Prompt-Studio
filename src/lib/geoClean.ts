/**
 * Clean a country/region polygon for animation:
 *   1. keep only the mainland + nearby islands (drop far-flung overseas
 *      territories that otherwise spread the highlight across the globe), and
 *   2. simplify every ring (Douglas–Peucker) so we project ~hundreds of points
 *      per frame instead of thousands — the single biggest preview-perf win.
 *
 * Pure functions (no DOM), so the AI route and the client both use it.
 */
type Ring = [number, number][];

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}
function ringCentroid(r: Ring): [number, number] {
  let x = 0, y = 0;
  for (const [a, b] of r) { x += a; y += b; }
  return [x / r.length, y / r.length];
}
function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
/** Iterative Douglas–Peucker, tolerance in degrees. Keeps the ring closed. */
function simplifyRing(pts: Ring, tol: number): Ring {
  if (pts.length <= 6) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
  return out.length >= 4 ? out : pts;
}

function geometryOf(geojson: any): any {
  return geojson?.type === "FeatureCollection" ? geojson.features?.[0]?.geometry
    : geojson?.type === "Feature" ? geojson.geometry : geojson;
}

export function cleanCountryGeo(
  geojson: any,
  opts: { maxDistDeg?: number; tol?: number; areaFrac?: number } = {},
): any {
  const maxDist = opts.maxDistDeg ?? 14;   // ~1500km from the main landmass
  const tol = opts.tol ?? 0.02;            // ~2km simplification at the equator
  const areaFrac = opts.areaFrac ?? 0.02;  // keep islands ≥ 2% of mainland area
  const g = geometryOf(geojson);
  if (!g) return geojson;

  let polys: Ring[][];
  if (g.type === "Polygon") polys = [g.coordinates];
  else if (g.type === "MultiPolygon") polys = g.coordinates;
  else return geojson;
  if (!polys?.length) return geojson;

  const withMeta = polys
    .filter((p) => p?.[0]?.length >= 4)
    .map((p) => ({ p, area: ringArea(p[0]), c: ringCentroid(p[0]) }));
  if (!withMeta.length) return geojson;
  withMeta.sort((a, b) => b.area - a.area);
  const main = withMeta[0];

  // Keep the mainland + islands that are BOTH near it AND not negligibly small.
  const kept = withMeta.filter((w) =>
    w === main ||
    (Math.hypot(w.c[0] - main.c[0], w.c[1] - main.c[1]) <= maxDist && w.area >= main.area * areaFrac),
  );

  const simplified = kept.map((w) => w.p.map((ring) => simplifyRing(ring, tol)));
  return simplified.length === 1
    ? { type: "Polygon", coordinates: simplified[0] }
    : { type: "MultiPolygon", coordinates: simplified };
}
