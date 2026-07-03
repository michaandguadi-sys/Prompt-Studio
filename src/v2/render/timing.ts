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

/** One easing for every entrance/exit — ease-out on the way in (decisive
 *  start, gentle settle), ease-in-out on the way out. Linear ramps read as
 *  mechanical "pops"; this is the unified motion language. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

  // Eased progress through the enter/exit windows (0→1). All masks and
  // transforms derive from these two so opacity and motion always agree.
  const inP = easeOutCubic(clamp01(inEnd > inStart ? (frame - inStart) / (inEnd - inStart) : frame >= inEnd ? 1 : 0));
  const outP = easeInOutCubic(clamp01(outEnd > outStart ? (frame - outStart) / (outEnd - outStart) : frame >= outStart ? 1 : 0));

  // ── Opacity: enter mask × exit mask ──
  const enterMask = t.enter === "none" ? (frame >= inEnd ? 1 : 0) : inP;
  const exitMask = !hasOut ? 1 : t.exit === "none" ? (frame >= outStart ? 0 : 1) : 1 - outP;
  const opacity = enterMask * exitMask;

  // ── Transform: entrance slide/scale, plus exit slide/scale ──
  let translateY = 0;
  let scale = 1;

  if (frame < inEnd) {
    if (t.enter === "slide-up")   translateY += 28 * (1 - inP);
    if (t.enter === "slide-down") translateY += -28 * (1 - inP);
    if (t.enter === "scale")      scale *= 0.82 + 0.18 * inP;
  }
  if (hasOut && frame > outStart) {
    if (t.exit === "slide-down")  translateY += 28 * outP;
    if (t.exit === "scale")       scale *= 1 - 0.1 * outP;
  }

  return { opacity, translateY, scale };
}

/** CSS transform string from a timing result (+ optional extra). */
export function timingTransform(r: TimingResult, extra = ""): string {
  return `translateY(${r.translateY}px) scale(${r.scale}) ${extra}`.trim();
}
