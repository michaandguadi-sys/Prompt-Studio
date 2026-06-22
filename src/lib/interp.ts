import { interpolate } from "remotion";

/**
 * Force an input range to be strictly monotonically increasing by nudging
 * any duplicate / descending value upward by 1e-3. Remotion's `interpolate`
 * crashes with "inputRange must be strictly monotonically increasing" if two
 * consecutive values are equal — common when the user momentarily has
 * start.zoom === mid.zoom or label.in === label.out.
 */
const fixMonotonic = (arr: readonly number[]): number[] => {
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    out.push(arr[i] <= out[i - 1] ? out[i - 1] + 0.001 : arr[i]);
  }
  return out;
};

/**
 * Drop-in replacement for Remotion's `interpolate` that never throws on
 * degenerate input ranges. Use this everywhere in the studio + emitted code.
 */
export const safeInterpolate = (
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  opts?: Parameters<typeof interpolate>[3],
): number => {
  return interpolate(
    input,
    fixMonotonic(inputRange),
    outputRange as number[],
    opts,
  );
};

// ── Easing functions ───────────────────────────────────────────────────────
export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "smooth"
  | "cinematic";

export const easings: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  smooth: (t) => t * t * (3 - 2 * t),
  cinematic: (t) => t * t * t * (t * (6 * t - 15) + 10), // 5th-order smoothstep
};

export const EASING_LABELS: Record<EasingType, string> = {
  linear: "Linear (constant speed)",
  easeIn: "Ease in (slow start)",
  easeOut: "Ease out (slow end)",
  easeInOut: "Ease in-out (balanced)",
  smooth: "Smoothstep (cubic)",
  cinematic: "Cinematic (5th-order)",
};

// ── Catmull-Rom spline for smooth multi-waypoint camera paths ─────────────

/**
 * Catmull-Rom interpolation between p1 and p2 with neighbors p0 and p3.
 * t ∈ [0, 1]. The spline passes THROUGH p1 and p2 (not approximates),
 * so multi-waypoint cameras stop exactly at each user-specified waypoint
 * but the corners between segments are smooth (no kinks).
 */
export function catmullRom(
  p0: number, p1: number, p2: number, p3: number, t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Interpolate one channel along a chain of N waypoint values.
 * Uses uniform Catmull-Rom — good for lon/lat where smooth curves through
 * the points are desired. Can overshoot — DO NOT use for zoom/pitch where
 * overshoot causes visible camera wobble. Use `linearChain` for those.
 */
export function catmullRomChain(values: number[], progress: number): number {
  const N = values.length;
  if (N === 0) return 0;
  if (N === 1) return values[0];
  if (N === 2) return values[0] + (values[1] - values[0]) * progress;

  const clamped = Math.max(0, Math.min(1, progress));
  const seg = Math.min(N - 2, Math.floor(clamped * (N - 1)));
  const segT = clamped * (N - 1) - seg;

  const p1 = values[seg];
  const p2 = values[seg + 1];
  const p0 = seg === 0 ? 2 * p1 - p2 : values[seg - 1];
  const p3 = seg + 2 >= N ? 2 * p2 - p1 : values[seg + 2];

  return catmullRom(p0, p1, p2, p3, segT);
}

/**
 * Smooth piecewise-linear interpolation through N values with a smoothstep
 * easing applied at each segment transition.
 *
 * Why this instead of Catmull-Rom for ZOOM specifically:
 *   Catmull-Rom can overshoot (the spline can dip below min or above max
 *   of the waypoint values), causing the camera to "wobble" — most visible
 *   when 3D terrain is on, because terrain LOD swaps with the overshoot.
 *
 *   Linear with smoothstep eases each segment (so the velocity is C¹
 *   continuous at waypoints, no jerk) but mathematically CANNOT overshoot.
 *   Visually: looks smooth, never wobbles.
 */
export function linearChain(values: number[], progress: number): number {
  const N = values.length;
  if (N === 0) return 0;
  if (N === 1) return values[0];
  if (N === 2) {
    const t = Math.max(0, Math.min(1, progress));
    const smooth = t * t * (3 - 2 * t);
    return values[0] + (values[1] - values[0]) * smooth;
  }
  const clamped = Math.max(0, Math.min(1, progress));
  const seg = Math.min(N - 2, Math.floor(clamped * (N - 1)));
  const t = clamped * (N - 1) - seg;
  const smooth = t * t * (3 - 2 * t);
  return values[seg] + (values[seg + 1] - values[seg]) * smooth;
}
