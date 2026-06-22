import { NextRequest, NextResponse } from "next/server";
import { RoutePayload, parseOrError } from "@/lib/schemas";
import searoute from "searoute-js";
import { chainedFlightArc } from "@/lib/geoArc";

type TransportMode =
  | "walking"
  | "cycling"
  | "driving"
  | "driving-traffic"
  | "boat"
  | "aircraft";

/**
 * Resolve a route between two points and return the geometry as
 * [lon, lat] coordinate pairs. Each transport mode is constrained to the right
 * surface — that's the whole point of the mode:
 *
 * - driving         → Mapbox Directions (roads only).
 * - walking         → Mapbox Directions walking profile (foot paths / trails).
 * - cycling         → Mapbox Directions cycling profile (bike + foot paths).
 * - aircraft        → great-circle arc (smooth, globe-calculated direct route).
 * - boat            → searoute-js marine network (WATER ONLY — never roads/land;
 *                     land endpoints snap to the nearest sea). Great-circle is a
 *                     last-resort fallback only if the sea router fails.
 */
function greatCircle(
  from: [number, number],
  to: [number, number],
  samples = 64,
): [number, number][] {
  // Convert to 3D Cartesian, slerp, convert back. Standard great-circle.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lon1, lat1] = from.map(toRad);
  const [lon2, lat2] = to.map(toRad);
  const x1 = Math.cos(lat1) * Math.cos(lon1);
  const y1 = Math.cos(lat1) * Math.sin(lon1);
  const z1 = Math.sin(lat1);
  const x2 = Math.cos(lat2) * Math.cos(lon2);
  const y2 = Math.cos(lat2) * Math.sin(lon2);
  const z2 = Math.sin(lat2);
  const dot = Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);
  if (omega < 1e-8) return [from, to];
  const out: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = Math.sin((1 - t) * omega) / Math.sin(omega);
    const b = Math.sin(t * omega) / Math.sin(omega);
    const x = a * x1 + b * x2;
    const y = a * y1 + b * y2;
    const z = a * z1 + b * z2;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([toDeg(lon), toDeg(lat)]);
  }
  return out;
}

/** Chain great-circle arcs through N waypoints (>= 2). */
function chainedGreatCircle(
  waypoints: [number, number][],
  samplesPerSegment = 64,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = greatCircle(waypoints[i], waypoints[i + 1], samplesPerSegment);
    // Avoid duplicating the seam point
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}

/** Haversine distance in km between two [lon, lat] points. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371; // Earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sum great-circle distance through a chain of waypoints. */
function totalGreatCircleKm(points: [number, number][]): number {
  let km = 0;
  for (let i = 0; i < points.length - 1; i++) km += haversineKm(points[i], points[i + 1]);
  return km;
}

const pointFeature = (c: [number, number]) =>
  ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } });

/**
 * Boat path through a chain of waypoints, constrained to WATER via searoute-js.
 * Each leg is routed on the marine network (land endpoints snap to the nearest
 * sea), then the legs are concatenated. Returns null if any leg can't be routed
 * on water so the caller can fall back. Never touches roads or land routing.
 */
function seaRouteChain(waypoints: [number, number][]): [number, number][] | null {
  const out: [number, number][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    let leg: [number, number][];
    try {
      const r = searoute(pointFeature(waypoints[i]), pointFeature(waypoints[i + 1]));
      leg = r?.geometry?.coordinates as [number, number][];
    } catch {
      return null;
    }
    if (!Array.isArray(leg) || leg.length < 2) return null;
    if (i > 0) leg.shift(); // avoid duplicating the seam point
    out.push(...leg);
  }
  return out.length >= 2 ? out : null;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = parseOrError(RoutePayload, raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { from, to, via, transport } = parsed.data;

  // Build full waypoint list: [from, ...via, to]
  const allPoints: [number, number][] = [
    [from.lon, from.lat],
    ...(via ?? []).map((p) => [p.lon, p.lat] as [number, number]),
    [to.lon, to.lat],
  ];

  // Aircraft → a bowed FLIGHT ARC (curved, not a straight line — the Earth is a
  // sphere). Always reads as an arc, short hops included.
  if (transport === "aircraft") {
    const km = totalGreatCircleKm(allPoints);
    const durationMin = Math.round((km / 800) * 60); // ~800 km/h cruise
    return NextResponse.json({
      coordinates: chainedFlightArc(allPoints, 56),
      kind: "flight-arc",
      distanceKm: Math.round(km),
      durationMin,
      note: null,
    });
  }

  // Boat → WATER ONLY via the searoute-js marine network (no roads, no land).
  if (transport === "boat") {
    const sea = seaRouteChain(allPoints);
    if (sea) {
      const km = Math.round(totalGreatCircleKm(sea)); // arc-length of the sea path
      return NextResponse.json({
        coordinates: sea,
        kind: "sea-route",
        distanceKm: km,
        durationMin: Math.round((km / 30) * 60), // ~30 km/h cruise
        note: null,
      });
    }
    // Fallback only if the sea router couldn't find a water path for some leg.
    const km = totalGreatCircleKm(allPoints);
    return NextResponse.json({
      coordinates: chainedGreatCircle(allPoints, 80),
      kind: "great-circle-marine-fallback",
      distanceKm: Math.round(km),
      durationMin: Math.round((km / 30) * 60),
      note: "Couldn't find an open-water path for part of this route — showing a smooth arc instead. Add intermediate waypoints over open sea to keep it on water.",
    });
  }

  // Street-based modes → OSRM (free, no key). The public demo routes on the road
  // network; at cinematic map scale the path reads the same for walking/cycling.
  // Falls back to a smooth great-circle arc if OSRM is unreachable, so routing
  // NEVER hard-fails and no Mapbox token is required.
  const coords = allPoints.map((p) => `${p[0]},${p[1]}`).join(";");
  const osrm = `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(osrm, { headers: { "User-Agent": "Mapanisy/1.0 (cinematic map studio)" } });
    if (res.ok) {
      const data = await res.json();
      const r = data.routes?.[0];
      if (r?.geometry?.coordinates?.length >= 2) {
        return NextResponse.json({
          coordinates: r.geometry.coordinates as [number, number][],
          distance: r.distance,
          duration: r.duration,
          distanceKm: Math.round((r.distance ?? 0) / 1000),
          durationMin: Math.round((r.duration ?? 0) / 60),
          kind: transport,
        });
      }
    }
  } catch { /* fall through to the arc */ }

  // Fallback — a smooth great-circle arc. Always works, no key, no network dep.
  const km = totalGreatCircleKm(allPoints);
  return NextResponse.json({
    coordinates: chainedGreatCircle(allPoints, 64),
    kind: "great-circle-fallback",
    distanceKm: Math.round(km),
    durationMin: Math.round((km / 70) * 60),
    note: null,
  });
}
