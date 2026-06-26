import type {
  StylePreset,
  EasingName,
  RouteStyle,
  SceneLabel,
} from "../types";
import { PALETTES } from "./palettes";

/**
 * Curated "style packages" (#3) — one-click complete looks, like the preset
 * picker in a captions app. Choosing a package swaps EVERYTHING that defines
 * the vibe at once: palette + border colors, font family/weights, label
 * typography, letterbox, base map style, camera easing, terrain, and route
 * line style. The user can still fine-tune any individual control afterward;
 * a package is just a great starting point, not a lock.
 *
 * Three is plenty: a cinematic documentary look, a punchy YouTube-creator
 * look, and a clean explainer look.
 */
export type StylePackage = {
  id: string;
  name: string;
  /** One-line description shown under the name in the picker. */
  description: string;
  /** Swatch color for the picker card. */
  accent: string;
  /** Full visual style — palette, fonts, typography, letterbox. */
  style: StylePreset;
  /** Base Mapbox style URL. */
  mapStyleUrl: string;
  /** Camera easing for phase 1 / subsequent phases. */
  easing: { phase1: EasingName; phase2: EasingName };
  /** Catmull-Rom smoothing through waypoints. */
  smoothCameraPath: boolean;
  /** Terrain default for this look. */
  terrain: { enabled: boolean; exaggeration: number };
  /** Route line styling applied to an existing route (if any). */
  routeStyle: Pick<RouteStyle, "color" | "width" | "glowColor" | "glowWidth" | "casingColor" | "casingWidth" | "dashed">;
  /** Default layout for newly-added labels under this package. */
  defaultLabelLayout: SceneLabel["layout"];
};

const byTone = (tone: string) => PALETTES.find((p) => p.tone === tone) ?? PALETTES[0];

export const STYLE_PACKAGES: StylePackage[] = [
  // ───────────────────────────────────────────────────────────────────────
  {
    id: "cinematic",
    name: "Cinematic Doc",
    description: "Warm, filmic. Thin type, letterbox bars, terrain, slow eased camera. Johnny-Harris energy.",
    accent: "#f4b942",
    style: {
      name: "Cinematic Doc",
      palette: byTone("historical"),
      fonts: {
        primary: { family: "Helvetica Neue", weight: 200, src: null },
        secondary: { family: "Helvetica Neue", weight: 300, src: null },
      },
      labelTypography: {
        titleSize: 96,
        titleWeight: 200,
        titleSpacing: 26,
        subSize: 30,
        subSpacing: 16,
      },
      letterboxHeight: 120,
    },
    mapStyleUrl: "mapbox://styles/mapbox/dark-v11",
    easing: { phase1: "cinematic", phase2: "smooth" },
    smoothCameraPath: true,
    terrain: { enabled: true, exaggeration: 1.5 },
    routeStyle: {
      color: "#f4b942",
      width: 6,
      glowColor: "#ffc266",
      glowWidth: 26,
      casingColor: "#06080f",
      casingWidth: 14,
      dashed: false,
    },
    defaultLabelLayout: "city-projected",
  },

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "yt-simple",
    name: "YouTube Simple",
    description: "Bold, high-contrast, snappy. Heavy Inter, no letterbox, fast camera, bottom-banner labels.",
    accent: "#4ab8ff",
    style: {
      name: "YouTube Simple",
      palette: byTone("cold"),
      fonts: {
        primary: { family: "Inter", weight: 600, src: null },
        secondary: { family: "Inter", weight: 400, src: null },
      },
      labelTypography: {
        titleSize: 104,
        titleWeight: 700,
        titleSpacing: 4,
        subSize: 34,
        subSpacing: 6,
      },
      letterboxHeight: 0,
    },
    mapStyleUrl: "mapbox://styles/mapbox/dark-v11",
    easing: { phase1: "easeInOut", phase2: "easeOut" },
    smoothCameraPath: true,
    terrain: { enabled: false, exaggeration: 1 },
    routeStyle: {
      color: "#ffffff",
      width: 8,
      glowColor: "#4ab8ff",
      glowWidth: 28,
      casingColor: "#06080f",
      casingWidth: 16,
      dashed: false,
    },
    defaultLabelLayout: "bottom-banner",
  },

  // ───────────────────────────────────────────────────────────────────────
  {
    id: "explainer",
    name: "Clean Explainer",
    description: "Light map, calm teal accents, readable Inter, tracked card labels. Great for how-it-works pieces.",
    accent: "#2ec4b6",
    style: {
      name: "Clean Explainer",
      palette: byTone("trade"),
      fonts: {
        primary: { family: "Inter", weight: 400, src: null },
        secondary: { family: "Inter", weight: 300, src: null },
      },
      labelTypography: {
        titleSize: 84,
        titleWeight: 500,
        titleSpacing: 8,
        subSize: 28,
        subSpacing: 8,
      },
      letterboxHeight: 0,
    },
    mapStyleUrl: "mapbox://styles/mapbox/light-v11",
    easing: { phase1: "easeInOut", phase2: "smooth" },
    smoothCameraPath: true,
    terrain: { enabled: false, exaggeration: 1 },
    routeStyle: {
      color: "#2ec4b6",
      width: 6,
      glowColor: "#40c8a0",
      glowWidth: 20,
      casingColor: "#ffffff",
      casingWidth: 12,
      dashed: false,
    },
    defaultLabelLayout: "tracked-card",
  },
];

export const matchStylePackage = (styleName: string): string | null =>
  STYLE_PACKAGES.find((p) => p.style.name === styleName)?.id ?? null;
