import type { Beats } from "./types";

/**
 * Default beats as 0–1 fractions of total duration.
 * Maps to the 3s-at-24fps reference from map-animation-director SKILL.md.
 *
 *   Camera pan (0 → arrive):       multi-waypoint chain, evenly divided
 *   Highlight fade (hold → breathe): polygon fades in here
 *   Cinematic hold (arrive → 1.0):   micro-zoom hold for breathing room
 */
export const DEFAULT_BEATS: Beats = {
  hold: 0.417,
  breathe: 0.639,
  arrive: 0.778,
};

/** Back-compat alias (still imported by some files) */
export const DEFAULT_BEATS_3S = DEFAULT_BEATS;

/**
 * Convert fraction-based beats to absolute frame numbers.
 * If a beat value is > 1 it's treated as a legacy absolute frame number
 * and divided by the duration to recover the fraction.
 */
export function beatsToFrames(
  beats: Beats,
  durationFrames: number,
): { hold: number; breathe: number; arrive: number } {
  const norm = normalizeBeats(beats, durationFrames);
  return {
    hold: Math.round(norm.hold * durationFrames),
    breathe: Math.round(norm.breathe * durationFrames),
    arrive: Math.round(norm.arrive * durationFrames),
  };
}

/**
 * Auto-detect legacy absolute-frame beats and convert to fractions.
 * Detection: any beat value > 1 implies absolute frames.
 */
export function normalizeBeats(beats: Beats, durationFrames: number): Beats {
  const vals = [beats.hold, beats.breathe, beats.arrive].filter(
    (v) => v != null,
  );
  const max = Math.max(...vals);
  if (max <= 1) return beats;
  return {
    hold: beats.hold / durationFrames,
    breathe: beats.breathe / durationFrames,
    arrive: beats.arrive / durationFrames,
  };
}

/** Kept for back-compat with old callers. Now returns same beats regardless of duration. */
export function beatsForDuration(_durationSec: number): Beats {
  return DEFAULT_BEATS;
}
