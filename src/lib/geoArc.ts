/**
 * Flight arc — a bowed curve between two lon/lat points, the classic "flight
 * path" look you get because the Earth is a sphere (a straight line on a flat
 * map would be wrong). A quadratic-bezier bowed toward the pole, proportional to
 * the distance so short and long hops both read as arcs. Used for aircraft.
 */
export function flightArc(from: [number, number], to: [number, number], n = 64): [number, number][] {
  const [x1, y1] = from, [x2, y2] = to;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return [from, to];
  let px = -dy / dist, py = dx / dist;   // unit perpendicular to the chord
  if (py < 0) { px = -px; py = -py; }    // bow toward the north (the great-circle look)
  const bow = Math.min(dist * 0.2, 16);  // proportional, capped so it never loops
  const cx = (x1 + x2) / 2 + px * bow;
  const cy = (y1 + y2) / 2 + py * bow;
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  return out;
}

/** Chain flight arcs through a list of waypoints (>= 2). */
export function chainedFlightArc(points: [number, number][], perSeg = 48): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = flightArc(points[i], points[i + 1], perSeg);
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}
