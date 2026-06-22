/**
 * Geographic helpers — centroid, bbox, projection-friendly math.
 *
 * The centroid is computed from a polygon's coordinate ring. For political
 * boundaries this gives a sensible "label point" — not always inside the
 * polygon (e.g. crescent-shaped countries like The Gambia) but visually
 * acceptable for >95% of cases. For pixel-perfect labels on weird shapes,
 * the user can override `label.anchor` to specific coordinates.
 */

type LonLat = [number, number];

function centroidOfRing(ring: LonLat[]): LonLat {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  // Skip the last vertex if it duplicates the first (GeoJSON convention)
  const last = ring.length;
  const closed = ring.length > 0 &&
    ring[0][0] === ring[last - 1][0] &&
    ring[0][1] === ring[last - 1][1];
  const upto = closed ? last - 1 : last;
  for (let i = 0; i < upto; i++) {
    sumLon += ring[i][0];
    sumLat += ring[i][1];
    count++;
  }
  return count === 0 ? [0, 0] : [sumLon / count, sumLat / count];
}

function ringArea(ring: LonLat[]): number {
  // Shoelace area in lon-lat (approximate; fine for picking the largest ring).
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

/**
 * Compute a centroid for any GeoJSON Feature / FeatureCollection / Polygon /
 * MultiPolygon. For MultiPolygon picks the centroid of the largest ring
 * (so a country's mainland wins over its offshore islands).
 */
export function centroidOf(geojson: any): LonLat {
  if (!geojson) return [0, 0];
  // Unwrap FeatureCollection → first feature
  if (geojson.type === "FeatureCollection") {
    return centroidOf(geojson.features?.[0]);
  }
  // Unwrap Feature → geometry
  if (geojson.type === "Feature") {
    return centroidOf(geojson.geometry);
  }
  const t = geojson.type;
  const c = geojson.coordinates;
  if (!c) return [0, 0];

  if (t === "Polygon") {
    // First ring is the outer boundary; inner rings are holes
    return centroidOfRing(c[0] as LonLat[]);
  }
  if (t === "MultiPolygon") {
    // Pick the polygon with the largest outer ring (= main landmass)
    let best: LonLat[] = c[0]?.[0] ?? [];
    let bestArea = ringArea(best);
    for (let i = 1; i < c.length; i++) {
      const ring = c[i][0] as LonLat[];
      const area = ringArea(ring);
      if (area > bestArea) {
        bestArea = area;
        best = ring;
      }
    }
    return centroidOfRing(best);
  }
  if (t === "LineString") return centroidOfRing(c as LonLat[]);
  if (t === "MultiLineString") return centroidOfRing(c[0] as LonLat[]);
  if (t === "Point") return c as LonLat;
  return [0, 0];
}

/** Compute bbox: [minLon, minLat, maxLon, maxLat]. */
export function bboxOf(geojson: any): [number, number, number, number] | null {
  const walk = (coords: any): LonLat[] => {
    if (typeof coords[0] === "number") return [coords as LonLat];
    return coords.flatMap(walk);
  };
  let g = geojson;
  if (g?.type === "FeatureCollection") g = g.features?.[0];
  if (g?.type === "Feature") g = g.geometry;
  if (!g?.coordinates) return null;
  const pts = walk(g.coordinates);
  if (pts.length === 0) return null;
  let minLon = pts[0][0], maxLon = minLon, minLat = pts[0][1], maxLat = minLat;
  for (const [lon, lat] of pts) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}
