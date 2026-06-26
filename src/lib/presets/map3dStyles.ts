/**
 * Creative 3D MAP STYLES — invented, art-directed looks that go far beyond a
 * tilted satellite map. Each bundles a base style + land/water recolour + 3D
 * building art-direction (colour · opacity · height · glassy gradient) + a
 * glowing boundary + a cinematic grade + a recommended camera pitch, so one
 * click (or one AI choice) transforms the whole map into a distinctive 3D world.
 *
 * Applied by merging `basemap`/`look` over the composition's current values and
 * setting the camera's end pitch.
 */
export type Map3DStyle = {
  id: string;
  name: string;
  tagline: string;
  /** [land, accent/building, glow] — for the picker swatch. */
  swatches: [string, string, string];
  basemap: Record<string, unknown>;
  look: Record<string, unknown>;
  /** Recommended camera end pitch for this look (deg). */
  pitch: number;
};

const DARK = "mapbox://styles/mapbox/dark-v11";
const LIGHT = "mapbox://styles/mapbox/light-v11";
const SAT = "mapbox://styles/mapbox/satellite-streets-v12";

export const MAP3D_STYLES: Map3DStyle[] = [
  {
    id: "holographic", name: "Holographic", tagline: "Cyan wireframe hologram",
    swatches: ["#06121f", "#2FE0FF", "#2FE0FF"],
    basemap: { styleUrl: DARK, landColor: "#06121f", waterColor: "#04101c", buildings3d: true, buildingColor: "#2FE0FF", buildingOpacity: 0.5, buildingHeightMult: 1.6, buildingGradient: true, boundaryGlow: "#2FE0FF", terrain: false },
    look: { bgColor: "#02060c", tintColor: "#003a4a", tintOpacity: 0.12, vignette: 0.5, grain: 0.05, mapFilter: "none" },
    pitch: 55,
  },
  {
    id: "neon-noir", name: "Neon Noir", tagline: "Synthwave magenta city",
    swatches: ["#14061f", "#ff3df0", "#ff3df0"],
    basemap: { styleUrl: DARK, landColor: "#14061f", waterColor: "#0a0418", buildings3d: true, buildingColor: "#ff3df0", buildingOpacity: 0.55, buildingHeightMult: 1.8, buildingGradient: true, boundaryGlow: "#ff3df0", terrain: false },
    look: { bgColor: "#08020f", tintColor: "#2a0040", tintOpacity: 0.16, vignette: 0.55, grain: 0.06, mapFilter: "none" },
    pitch: 58,
  },
  {
    id: "miniature", name: "Miniature", tagline: "Tilt-shift toy diorama",
    swatches: ["#7fae5a", "#e8c98a", "#ffffff"],
    basemap: { styleUrl: SAT, buildings3d: true, buildingColor: "#e8c98a", buildingOpacity: 0.85, buildingHeightMult: 2.2, buildingGradient: false, terrain: true, terrainStrength: 3, landColor: "", waterColor: "" },
    look: { vignette: 0.66, grain: 0.06, gradeHigh: "#fff0c0", gradeHighAmt: 0.2, mapFilter: "none" },
    pitch: 62,
  },
  {
    id: "blueprint", name: "Blueprint", tagline: "Glowing technical drawing",
    swatches: ["#0a1f4d", "#bcd4ff", "#9fc0ff"],
    basemap: { styleUrl: DARK, landColor: "#0a1f4d", waterColor: "#061638", buildings3d: true, buildingColor: "#bcd4ff", buildingOpacity: 0.35, buildingHeightMult: 1.3, buildingGradient: false, boundaryGlow: "#9fc0ff", terrain: false },
    look: { bgColor: "#061026", tintColor: "#0a2a6a", tintOpacity: 0.12, vignette: 0.4, grain: 0.03, mapFilter: "none" },
    pitch: 46,
  },
  {
    id: "obsidian", name: "Obsidian", tagline: "Black glass & iris glow",
    swatches: ["#07090e", "#1a2230", "#6E7BFF"],
    basemap: { styleUrl: DARK, landColor: "#07090e", waterColor: "#0c1118", buildings3d: true, buildingColor: "#1a2230", buildingOpacity: 0.7, buildingHeightMult: 1.4, buildingGradient: true, boundaryGlow: "#6E7BFF", terrain: false },
    look: { bgColor: "#04050a", vignette: 0.55, grain: 0.05, mapFilter: "none" },
    pitch: 50,
  },
  {
    id: "molten", name: "Molten", tagline: "Ember rivers & lava glow",
    swatches: ["#120806", "#ff6a2a", "#ff8a3a"],
    basemap: { styleUrl: DARK, landColor: "#120806", waterColor: "#1c0a04", buildings3d: true, buildingColor: "#ff6a2a", buildingOpacity: 0.6, buildingHeightMult: 1.4, buildingGradient: true, boundaryGlow: "#ff8a3a", terrain: true, terrainStrength: 2 },
    look: { bgColor: "#0a0402", tintColor: "#3a1000", tintOpacity: 0.18, vignette: 0.52, grain: 0.06, mapFilter: "none" },
    pitch: 52,
  },
  {
    id: "aurora", name: "Aurora", tagline: "Ethereal teal-violet relief",
    swatches: ["#06161a", "#36d39a", "#6E7BFF"],
    basemap: { styleUrl: DARK, landColor: "#06161a", waterColor: "#04121a", buildings3d: true, buildingColor: "#36d39a", buildingOpacity: 0.5, buildingHeightMult: 1.5, buildingGradient: true, boundaryGlow: "#6E7BFF", terrain: true, terrainStrength: 2.2 },
    look: { bgColor: "#03090c", tintColor: "#00203a", tintOpacity: 0.12, vignette: 0.42, grain: 0.05, mapFilter: "none" },
    pitch: 50,
  },
  {
    id: "crystal-ice", name: "Crystal Ice", tagline: "Translucent glacial world",
    swatches: ["#0a1622", "#bfe9ff", "#bfe9ff"],
    basemap: { styleUrl: DARK, landColor: "#0a1622", waterColor: "#0e2030", buildings3d: true, buildingColor: "#bfe9ff", buildingOpacity: 0.45, buildingHeightMult: 1.5, buildingGradient: true, boundaryGlow: "#bfe9ff", terrain: true, terrainStrength: 2.4 },
    look: { bgColor: "#050d16", vignette: 0.35, grain: 0.03, mapFilter: "none" },
    pitch: 52,
  },
  {
    id: "papercraft", name: "Paper-craft", tagline: "Folded-paper miniature",
    swatches: ["#efe7d6", "#d8cdb6", "#b9a98a"],
    basemap: { styleUrl: LIGHT, landColor: "#efe7d6", waterColor: "#cfe0e6", buildings3d: true, buildingColor: "#d8cdb6", buildingOpacity: 0.9, buildingHeightMult: 1.3, buildingGradient: false, boundaryGlow: "#b9a98a", terrain: true, terrainStrength: 1.6 },
    look: { bgColor: "#e8dfc8", texture: "paper", textureOpacity: 0.5, vignette: 0.3, grain: 0.04, mapFilter: "none" },
    pitch: 48,
  },
  {
    id: "war-room", name: "War Room", tagline: "Tactical sand-table",
    swatches: ["#0e1622", "#5a6b86", "#ffb020"],
    basemap: { styleUrl: DARK, landColor: "#0e1622", waterColor: "#0a1018", buildings3d: true, buildingColor: "#5a6b86", buildingOpacity: 0.55, buildingHeightMult: 1.2, buildingGradient: false, boundaryGlow: "#ffb020", terrain: true, terrainStrength: 1.8 },
    look: { bgColor: "#060a12", tintColor: "#1a1000", tintOpacity: 0.1, vignette: 0.6, grain: 0.07, mapFilter: "noir" },
    pitch: 42,
  },
  {
    id: "sakura", name: "Sakura", tagline: "Cherry-blossom dusk",
    swatches: ["#1a0a12", "#ff9ec9", "#ffb3d9"],
    basemap: { styleUrl: DARK, landColor: "#1a0a12", waterColor: "#120814", buildings3d: true, buildingColor: "#ff9ec9", buildingOpacity: 0.55, buildingHeightMult: 1.5, buildingGradient: true, boundaryGlow: "#ffb3d9", terrain: false },
    look: { bgColor: "#0e0610", tintColor: "#3a0a24", tintOpacity: 0.14, vignette: 0.45, grain: 0.05, mapFilter: "none" },
    pitch: 54,
  },
  {
    id: "emerald", name: "Emerald", tagline: "Lush bio-luminescent",
    swatches: ["#04140c", "#2fd98a", "#2fd98a"],
    basemap: { styleUrl: DARK, landColor: "#04140c", waterColor: "#02120e", buildings3d: true, buildingColor: "#2fd98a", buildingOpacity: 0.5, buildingHeightMult: 1.6, buildingGradient: true, boundaryGlow: "#2fd98a", terrain: true, terrainStrength: 2 },
    look: { bgColor: "#020c08", tintColor: "#003020", tintOpacity: 0.12, vignette: 0.42, grain: 0.05, mapFilter: "none" },
    pitch: 50,
  },
  {
    id: "golden-hour", name: "Golden Hour", tagline: "Warm amber dusk reveal",
    swatches: ["#1a1206", "#ffb347", "#ffd27a"],
    basemap: { styleUrl: SAT, buildings3d: true, buildingColor: "#ffce8a", buildingOpacity: 0.8, buildingHeightMult: 1.8, buildingGradient: false, terrain: true, terrainStrength: 2.2, landColor: "", waterColor: "" },
    look: { vignette: 0.5, grain: 0.05, gradeHigh: "#ffdf9e", gradeHighAmt: 0.24, gradeShadow: "#241405", gradeShadowAmt: 0.2, mapFilter: "none" },
    pitch: 60,
  },
  {
    id: "monochrome", name: "Monochrome", tagline: "Stark black & white",
    swatches: ["#0a0a0a", "#e8e8e8", "#ffffff"],
    basemap: { styleUrl: DARK, landColor: "#0a0a0a", waterColor: "#000000", buildings3d: true, buildingColor: "#e8e8e8", buildingOpacity: 0.6, buildingHeightMult: 1.7, buildingGradient: true, boundaryGlow: "#ffffff", terrain: false },
    look: { bgColor: "#000000", vignette: 0.55, grain: 0.08, mapFilter: "noir" },
    pitch: 52,
  },
];

export const map3dStyleById = (id: string): Map3DStyle | undefined => MAP3D_STYLES.find((s) => s.id === id);
