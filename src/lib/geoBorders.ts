/**
 * Border geometry for the AI director.
 *
 * Extracts the SHARED border between two country polygons as an ordered
 * polyline — so a "conflict on the India–Pakistan border" can draw the actual
 * frontier (glowing, in its own style) and place crossing-swords ALONG it, not
 * just one symbol at a midpoint. No turf dependency: small planar helpers that
 * are plenty accurate for thresholds and even sampling.
 */
export type LL = [number, number];

function unwrap(geo: any): any {
  if (!geo) return null;
  if (geo.type === "FeatureCollection") return unwrap(geo.features?.[0]);
  if (geo.type === "Feature") return unwrap(geo.geometry);
  return geo;
}

/** Outer rings ([lon,lat][]) of any Polygon / MultiPolygon / LineString geo. */
export function ringsOf(geo: any): LL[][] {
  const g = unwrap(geo);
  if (!g?.coordinates) return [];
  if (g.type === "Polygon") return [g.coordinates[0] as LL[]];
  if (g.type === "MultiPolygon") return (g.coordinates as any[]).map((poly) => poly[0] as LL[]);
  if (g.type === "LineString") return [g.coordinates as LL[]];
  if (g.type === "MultiLineString") return g.coordinates as LL[][];
  return [];
}

const RAD = Math.PI / 180;
/** Squared planar distance in degrees, lon scaled by cos(lat) so it's ~isotropic. */
function dist2(p: LL, q: LL): number {
  const c = Math.cos(((p[1] + q[1]) / 2) * RAD);
  const dx = (p[0] - q[0]) * c, dy = p[1] - q[1];
  return dx * dx + dy * dy;
}
/** Squared distance from point p to segment a–b (scaled degrees). */
function ptSeg2(p: LL, a: LL, b: LL): number {
  const c = Math.cos(((a[1] + b[1]) / 2) * RAD);
  const ax = a[0] * c, ay = a[1], bx = b[0] * c, by = b[1], px = p[0] * c, py = p[1];
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}
function minDistToRings2(p: LL, rings: LL[][]): number {
  let best = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) {
    const d = ptSeg2(p, ring[i], ring[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The shared border between two country polygons, as an ordered polyline.
 * A boundary vertex of A within `thresholdDeg` of B's boundary is "on the
 * border"; we return the longest contiguous run (the main frontier).
 */
export function sharedBorderLine(geoA: any, geoB: any, thresholdDeg = 0.7): LL[] {
  const ringsA = ringsOf(geoA), ringsB = ringsOf(geoB);
  if (!ringsA.length || !ringsB.length) return [];
  const th2 = thresholdDeg * thresholdDeg;
  let best: LL[] = [];
  for (const ring of ringsA) {
    let run: LL[] = [];
    for (const p of ring) {
      if (minDistToRings2(p, ringsB) <= th2) run.push(p);
      else { if (run.length > best.length) best = run; run = []; }
    }
    if (run.length > best.length) best = run;
  }
  return best.length >= 2 ? best : [];
}

/** Evenly sample N points along a polyline (by arc length). */
export function sampleAlong(line: LL[], n: number): LL[] {
  if (line.length === 0 || n <= 0) return [];
  if (line.length === 1) return [line[0]];
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.sqrt(dist2(line[i - 1], line[i])));
  const total = cum[cum.length - 1] || 1;
  const out: LL[] = [];
  for (let k = 0; k < n; k++) {
    const d = total * ((k + 0.5) / n);
    let i = 1;
    while (i < cum.length && cum[i] < d) i++;
    const a = line[i - 1], b = line[Math.min(i, line.length - 1)];
    const t = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Bbox [minLon,minLat,maxLon,maxLat] over several geojson geometries. */
export function bboxOfGeos(geos: any[]): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const geo of geos) for (const ring of ringsOf(geo)) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}
