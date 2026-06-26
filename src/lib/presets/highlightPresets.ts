import type { HighlightStyle, HighlightAnimation } from "@/lib/types";

/**
 * Curated one-click highlight looks tuned for history / geopolitics explainers.
 *
 * Each preset bundles a complete fill treatment (texture + colors + opacity +
 * border/glow) and an entrance animation, so a creator can drop the right look
 * in one click and then fine-tune any value. Applying a preset overwrites the
 * highlight's style + animationStyle but leaves its geometry, label, and flag
 * untouched.
 */
export type HighlightPreset = {
  id: string;
  label: string;
  description: string;
  /** Full style overwrite (every field set, so the look is deterministic). */
  style: HighlightStyle;
  animationStyle: HighlightAnimation;
};

export const HIGHLIGHT_PRESETS: HighlightPreset[] = [
  {
    id: "conflict",
    label: "Conflict",
    description: "Red diagonal hatch with a pulsing border — contested / war zones.",
    style: {
      borderColor: "#ff3b30",
      borderWidth: 4,
      glowColor: "#ff3b30",
      glowWidth: 26,
      glowBlur: 12,
      fillColor: "#ff3b30",
      fillOpacity: 0.3,
      fillType: "hatch",
    },
    animationStyle: "pulse-in",
  },
  {
    id: "territory",
    label: "Territory",
    description: "Amber solid glow that draws around the border — claimed land.",
    style: {
      borderColor: "#f5b642",
      borderWidth: 3.5,
      glowColor: "#f5b642",
      glowWidth: 24,
      glowBlur: 10,
      fillColor: "#f5b642",
      fillOpacity: 0.22,
      fillType: "solid",
    },
    animationStyle: "sweep",
  },
  {
    id: "historical",
    label: "Historical",
    description: "Sepia stripes with a soft fade — old empires / period maps.",
    style: {
      borderColor: "#c9a36a",
      borderWidth: 3,
      glowColor: "#8a6d3b",
      glowWidth: 20,
      glowBlur: 12,
      fillColor: "#c9a36a",
      fillOpacity: 0.26,
      fillType: "stripes",
    },
    animationStyle: "fade",
  },
  {
    id: "trade",
    label: "Trade",
    description: "Teal dotted fill, border-first reveal — trade blocs / routes.",
    style: {
      borderColor: "#2dd4bf",
      borderWidth: 3.5,
      glowColor: "#2dd4bf",
      glowWidth: 22,
      glowBlur: 10,
      fillColor: "#2dd4bf",
      fillOpacity: 0.24,
      fillType: "dots",
    },
    animationStyle: "border-first",
  },
  {
    id: "empire",
    label: "Empire",
    description: "Purple crosshatch, always visible — dynasties / spheres of influence.",
    style: {
      borderColor: "#a78bfa",
      borderWidth: 3.5,
      glowColor: "#7c3aed",
      glowWidth: 24,
      glowBlur: 12,
      fillColor: "#a78bfa",
      fillOpacity: 0.26,
      fillType: "crosshatch",
    },
    animationStyle: "fade",
  },
  {
    id: "neutral",
    label: "Neutral",
    description: "Clean white solid tint — neutral / present-day reference.",
    style: {
      borderColor: "#ffffff",
      borderWidth: 3,
      glowColor: "#ffffff",
      glowWidth: 18,
      glowBlur: 10,
      fillColor: "#ffffff",
      fillOpacity: 0.16,
      fillType: "solid",
    },
    animationStyle: "fade",
  },
];
