import type { Timing, PropKeyframe, KfEase } from "../doc/schema";

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

// ── Property keyframes ──────────────────────────────────────────────────────
// The universal "set a keyframe, move the playhead, set another" animation
// system. A layer's `tracks[prop]` holds keyframes; kfNum() samples the value
// for the current frame, or returns the static fallback when there's no track.

const easeIn = (t: number) => t * t;
const easeOut = (t: number) => t * (2 - t);
const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep = "smooth" (ease-in-out)

export function applyKfEase(ease: KfEase, t: number): number {
  switch (ease) {
    case "linear": return t;
    case "easeIn": return easeIn(t);
    case "easeOut": return easeOut(t);
    case "hold": return 0;      // step: hold this keyframe's value until the next
    default: return smooth(t);  // "smooth"
  }
}

/** Sample a property track at scene-time t (0..1). Returns undefined for an
 *  empty track so callers can fall back to the static value. */
export function sampleTrack(kfs: PropKeyframe[] | undefined, t: number): number | undefined {
  if (!kfs || kfs.length === 0) return undefined;
  if (kfs.length === 1) return kfs[0].value;
  const s = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= s[0].t) return s[0].value;
  if (t >= s[s.length - 1].t) return s[s.length - 1].value;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if (t >= a.t && t < b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const localT = (t - a.t) / span;
      return a.value + (b.value - a.value) * applyKfEase(a.ease, localT);
    }
  }
  return s[s.length - 1].value;
}

/** The keyframed value of `prop` on `layer` for the current frame, or `fallback`
 *  (the layer's static field) when the property isn't keyframed. Drop-in for any
 *  numeric render read: `const op = kfNum(l, "fillOpacity", l.fillOpacity, frame, totalFrames);` */
export function kfNum(layer: any, prop: string, fallback: number, frame: number, totalFrames: number): number {
  const track = layer?.tracks?.[prop] as PropKeyframe[] | undefined;
  if (!track || track.length === 0) return fallback;
  const t = totalFrames > 1 ? frame / (totalFrames - 1) : 0;
  const v = sampleTrack(track, Math.min(1, Math.max(0, t)));
  return v == null ? fallback : v;
}
