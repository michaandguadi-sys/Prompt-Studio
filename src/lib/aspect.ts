import type { AspectRatio } from "./types";

/**
 * Single source of truth for output dimensions.
 *
 * All exports are 4K-class on the long edge so every aspect stays
 * broadcast-quality:
 *   16:9 → 3840 × 2160   (landscape, YouTube)
 *   9:16 → 2160 × 3840   (vertical, Shorts/Reels/TikTok)
 *   1:1  → 2160 × 2160   (square, feed posts)
 */
export const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

export const ASPECT_LABELS: Record<AspectRatio, string> = {
  "16:9": "Landscape",
  "9:16": "Vertical",
  "1:1": "Square",
};

export function dimsFor(aspect: AspectRatio | undefined): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "9:16":
      return { width: 2160, height: 3840 };
    case "1:1":
      return { width: 2160, height: 2160 };
    case "16:9":
    default:
      return { width: 3840, height: 2160 };
  }
}

/** Resolve a spec's aspect, defaulting legacy specs (no aspect field) to 16:9. */
export function aspectOf(spec: { aspect?: AspectRatio }): AspectRatio {
  return spec.aspect ?? "16:9";
}
