import { safeInterpolate } from "@/lib/interp";
import type { Timing } from "../doc/schema";

/**
 * The ONE timing engine. Every overlay layer's entrance/exit is computed here,
 * so "fade / slide / scale / none, in / out, hold-to-end" behave identically
 * and correctly everywhere — by construction, not by per-component duplication.
 *
 * Returns the opacity + transform to apply for the current frame.
 */
export type TimingResult = { opacity: number; translateY: number; scale: number };

const RAMP_SEC = 0.35;

export function evalTiming(
  t: Timing,
  frame: number,
  fps: number,
  totalFrames: number,
): TimingResult {
  // Per-layer fade DURATIONS (fall back to the legacy 0.35s ramp for old docs).
  const inRamp = Math.max(1, Math.round(((t as any).fadeInSec ?? RAMP_SEC) * fps));
  const outRamp = Math.max(1, Math.round(((t as any).fadeOutSec ?? RAMP_SEC) * fps));
  const inEnd = Math.round(t.inSec * fps);
  const inStart = Math.max(0, inEnd - inRamp);

  const hasOut = t.outSec != null;
  const outStart = hasOut ? Math.round((t.outSec as number) * fps) : totalFrames + 100;
  const outEnd = outStart + outRamp;

  // ── Opacity: enter mask × exit mask ──
  const enterMask =
    t.enter === "none"
      ? frame >= inEnd ? 1 : 0
      : safeInterpolate(frame, [inStart, inEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const exitMask = !hasOut
    ? 1
    : t.exit === "none"
      ? frame >= outStart ? 0 : 1
      : safeInterpolate(frame, [outStart, outEnd], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const opacity = enterMask * exitMask;

  // ── Transform: entrance slide/scale, plus exit slide/scale ──
  let translateY = 0;
  let scale = 1;

  if (frame < inEnd) {
    if (t.enter === "slide-up")   translateY += safeInterpolate(frame, [inStart, inEnd], [28, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (t.enter === "slide-down") translateY += safeInterpolate(frame, [inStart, inEnd], [-28, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (t.enter === "scale")      scale *= safeInterpolate(frame, [inStart, inEnd], [0.82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }
  if (hasOut && frame > outStart) {
    if (t.exit === "slide-down")  translateY += safeInterpolate(frame, [outStart, outEnd], [0, 28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (t.exit === "scale")       scale *= safeInterpolate(frame, [outStart, outEnd], [1, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }

  return { opacity, translateY, scale };
}

/** CSS transform string from a timing result (+ optional extra). */
export function timingTransform(r: TimingResult, extra = ""): string {
  return `translateY(${r.translateY}px) scale(${r.scale}) ${extra}`.trim();
}
