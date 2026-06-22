import type { TrackStyle, TrackVariant } from "../doc/schema";

/**
 * Style + variant presets. A `style` is a visual token bundle (and a basemap);
 * a `variant` is a camera/flythrough behavior with a recommended base pitch.
 * Selecting either in the inspector re-applies its preset; individual tokens stay
 * overridable afterward. The renderer reads the live layer fields, not these.
 */

export interface StyleBundle {
  routeColor: string;
  routeGlow: string;
  routeWidth: number;
  trailColor: string; // already-travelled portion
  dotColor: string;
  /** Composition basemap styleUrl this look applies (resolveMapStyle understands these). */
  baseStyleUrl: string;
  bgColor: string;
}

export const STYLE_PRESETS: Record<TrackStyle, StyleBundle> = {
  "vox-dark":  { routeColor: "#ffffff", routeGlow: "#6E7BFF", routeWidth: 6, trailColor: "#6E7BFF", dotColor: "#ffffff", baseStyleUrl: "mapbox://styles/mapbox/dark-v11", bgColor: "#05060e" },
  topo:        { routeColor: "#ff5a3c", routeGlow: "#ff8a5c", routeWidth: 6, trailColor: "#ffb37a", dotColor: "#ffffff", baseStyleUrl: "outdoors", bgColor: "#0d1411" },
  satellite:   { routeColor: "#00e5ff", routeGlow: "#00e5ff", routeWidth: 7, trailColor: "#7cffea", dotColor: "#ffffff", baseStyleUrl: "satellite", bgColor: "#05060e" },
  minimal:     { routeColor: "#111827", routeGlow: "#94a3b8", routeWidth: 4, trailColor: "#6E7BFF", dotColor: "#111827", baseStyleUrl: "light", bgColor: "#f5f6f8" },
};

export interface VariantPreset {
  /** Recommended base pitch (degrees) applied when this variant is chosen. */
  pitch: number;
  /** Whether the variant turns on 3-D DEM terrain. */
  terrain: boolean;
  label: string;
  blurb: string;
}

export const VARIANT_PRESETS: Record<TrackVariant, VariantPreset> = {
  "overview-draw":  { pitch: 0,  terrain: false, label: "Overview draw",  blurb: "Top-down frame, line draws on. Calm + informational." },
  "chase-flyover":  { pitch: 60, terrain: false, label: "Chase flyover",  blurb: "Follow-cam trailing the moving point. Strava-style." },
  "hybrid-dive":    { pitch: 55, terrain: false, label: "Hybrid dive",    blurb: "Open wide → dive into chase → pull back. Documentary beat." },
  "terrain-flyover":{ pitch: 62, terrain: true,  label: "Terrain flyover", blurb: "Chase + 3-D relief so ridges/valleys pop. Most cinematic." },
};
