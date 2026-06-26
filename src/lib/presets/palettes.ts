import type { Palette } from "../types";

/**
 * 5 VOX/Johnny Harris palettes — seeded from map-animation-director skill.
 * Plus the amber/golden palette extracted from Scene02-NanshanMapbox.tsx
 * (historical/empire tone tuned for warm story beats).
 */
export const PALETTES: Palette[] = [
  {
    name: "Warm Amber (Historical)",
    tone: "historical",
    borderColor: "#f4b942",
    glowColor: "#ffc266",
    fillColor: "#f4b942",
    countryStroke: "#3a5878",
    dotColor: "#ffffff",
    ringColor: "#f4b942",
  },
  {
    name: "Cold / Arctic",
    tone: "cold",
    borderColor: "#ffffff",
    glowColor: "#88bbff",
    fillColor: "#1a3a6e",
    countryStroke: "#5a7da6",
    dotColor: "#ffffff",
    ringColor: "#4ab8ff",
  },
  {
    name: "Conflict / Danger",
    tone: "conflict",
    borderColor: "#ffffff",
    glowColor: "#ff4444",
    fillColor: "#3a0a0a",
    countryStroke: "#7a3030",
    dotColor: "#ffffff",
    ringColor: "#ff6644",
  },
  {
    name: "Trade / Economics",
    tone: "trade",
    borderColor: "#ffffff",
    glowColor: "#40c8a0",
    fillColor: "#042a1a",
    countryStroke: "#2a7a5a",
    dotColor: "#ffffff",
    ringColor: "#2ec4b6",
  },
  {
    name: "Political / Election",
    tone: "political",
    borderColor: "#ffffff",
    glowColor: "#8844ff",
    fillColor: "#1a0a3a",
    countryStroke: "#5a3a8a",
    dotColor: "#ffffff",
    ringColor: "#aa66ff",
  },
];
