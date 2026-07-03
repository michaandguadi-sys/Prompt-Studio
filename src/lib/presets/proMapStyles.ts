/**
 * PROFESSIONAL MAP STYLES — the documentary collection.
 *
 * Where map3dStyles.ts holds the CREATIVE invented worlds (holographic, neon…),
 * these are the premium, broadcast-safe looks: balanced palettes, restrained
 * contrast, professional water/terrain colours, cinematic grades. They aim at
 * "premium travel documentary", not "developer map theme".
 *
 * Same Map3DStyle shape, applied the same way (merge basemap + look, set end
 * pitch) — so they work in the style modal, the AI director, and templates.
 */
import type { Map3DStyle } from "./map3dStyles";

const DARK = "mapbox://styles/mapbox/dark-v11";
const LIGHT = "mapbox://styles/mapbox/light-v11";
const STREETS = "mapbox://styles/mapbox/streets-v12";
const OUTDOORS = "mapbox://styles/mapbox/outdoors-v12";
const SAT = "mapbox://styles/mapbox/satellite-streets-v12";

export const PRO_MAP_STYLES: Map3DStyle[] = [
  {
    id: "clean-minimal", name: "Clean Minimal", tagline: "Quiet, precise, all signal",
    swatches: ["#f7f7f4", "#dbe4ea", "#3b4252"],
    basemap: { styleUrl: LIGHT, landColor: "#f7f7f4", waterColor: "#dbe4ea", boundaryGlow: "", terrain: false, buildings3d: false },
    look: { vignette: 0, grain: 0, mapFilter: "none", tintOpacity: 0, bgColor: "#ffffff" },
    pitch: 0,
  },
  {
    id: "apple-light", name: "Cupertino Light", tagline: "Soft paper, calm blue water",
    swatches: ["#f2f1ec", "#9fc5e8", "#8e8e93"],
    basemap: { styleUrl: LIGHT, landColor: "#f2f1ec", waterColor: "#a9cbe8", boundaryGlow: "", terrain: false, buildings3d: false },
    look: { vignette: 0.08, grain: 0, mapFilter: "none", gradeHigh: "#ffffff", gradeHighAmt: 0.06, bgColor: "#f5f5f7" },
    pitch: 12,
  },
  {
    id: "apple-dark", name: "Cupertino Dark", tagline: "Graphite night, deep-sea blue",
    swatches: ["#1c1c1e", "#12283e", "#8e8e93"],
    basemap: { styleUrl: DARK, landColor: "#1c1c1e", waterColor: "#101f30", boundaryGlow: "", terrain: false, buildings3d: false },
    look: { vignette: 0.22, grain: 0, mapFilter: "none", bgColor: "#0b0b0d" },
    pitch: 12,
  },
  {
    id: "earth-documentary", name: "Earth Documentary", tagline: "Golden-hour satellite relief",
    swatches: ["#3f4a33", "#27435c", "#f0d9a8"],
    basemap: { styleUrl: SAT, terrain: true, terrainStrength: 1.7, timeOfDay: 16.5, buildings3d: false },
    look: { vignette: 0.34, grain: 0.05, mapFilter: "none", gradeHigh: "#ffe9c2", gradeHighAmt: 0.14, gradeShadow: "#14212e", gradeShadowAmt: 0.2, bgColor: "#0a0f14" },
    pitch: 48,
  },
  {
    id: "natgeo", name: "Expedition Atlas", tagline: "Cream paper, cartographic classic",
    swatches: ["#f3e8cf", "#b9d4e0", "#c9a24a"],
    basemap: { styleUrl: STREETS, landColor: "#f3e8cf", waterColor: "#b9d4e0", boundaryGlow: "#c9a24a", terrain: true, terrainStrength: 1.2, buildings3d: false },
    look: { vignette: 0.18, grain: 0.04, texture: "paper", textureOpacity: 0.25, mapFilter: "antique", mapFilterAmount: 0.22, bgColor: "#efe6d2" },
    pitch: 8,
  },
  {
    id: "satellite-cinematic", name: "Satellite Cinematic", tagline: "Filmic imagery, deep shadows",
    swatches: ["#22303c", "#101c28", "#c7d8e8"],
    basemap: { styleUrl: SAT, terrain: true, terrainStrength: 1.9, buildings3d: false },
    look: { vignette: 0.5, grain: 0.09, letterbox: 0.07, mapFilter: "none", gradeShadow: "#0a141f", gradeShadowAmt: 0.3, gradeHigh: "#dce9f4", gradeHighAmt: 0.08, bgColor: "#05080c" },
    pitch: 56,
  },
  {
    id: "adventure", name: "Adventure", tagline: "Warm trail light, bold relief",
    swatches: ["#e8dcc0", "#7fb3c8", "#d97a3d"],
    basemap: { styleUrl: OUTDOORS, terrain: true, terrainStrength: 2.2, boundaryGlow: "", buildings3d: false },
    look: { vignette: 0.28, grain: 0.05, mapFilter: "warm", mapFilterAmount: 0.25, gradeHigh: "#ffe3b8", gradeHighAmt: 0.12, bgColor: "#141210" },
    pitch: 50,
  },
  {
    id: "hiking", name: "Hiking", tagline: "Crisp contours, honest terrain",
    swatches: ["#eef0e6", "#9cc0d4", "#4a7a4a"],
    basemap: { styleUrl: OUTDOORS, terrain: true, terrainStrength: 2.6, buildings3d: false },
    look: { vignette: 0.12, grain: 0, mapFilter: "none", bgColor: "#f2f3ee" },
    pitch: 54,
  },
  {
    id: "luxury-travel", name: "Luxury Travel", tagline: "Black velvet & champagne gold",
    swatches: ["#101014", "#0b0e13", "#d4b36a"],
    basemap: { styleUrl: DARK, landColor: "#101014", waterColor: "#0b0e13", boundaryGlow: "#d4b36a", buildings3d: true, buildingColor: "#8a744a", buildingOpacity: 0.55, buildingHeightMult: 1.2, buildingGradient: true, terrain: false },
    look: { vignette: 0.42, grain: 0.04, mapFilter: "none", gradeHigh: "#f0dcae", gradeHighAmt: 0.12, bgColor: "#08080a" },
    pitch: 40,
  },
  {
    id: "editorial", name: "Editorial", tagline: "Newsroom light, ink accents",
    swatches: ["#f4f4f0", "#ccd6da", "#22262e"],
    basemap: { styleUrl: LIGHT, landColor: "#f4f4f0", waterColor: "#ccd6da", boundaryGlow: "#22262e", terrain: false, buildings3d: false },
    look: { vignette: 0.06, grain: 0, mapFilter: "none", bgColor: "#fbfbf9" },
    pitch: 0,
  },
  {
    id: "filmic", name: "Filmic", tagline: "35mm grain, teal & amber",
    swatches: ["#10141a", "#152029", "#ffd9a0"],
    basemap: { styleUrl: DARK, landColor: "#10141a", waterColor: "#131e28", boundaryGlow: "", terrain: false, buildings3d: false },
    look: { vignette: 0.48, grain: 0.14, letterbox: 0.06, mapFilter: "none", gradeShadow: "#0e1a22", gradeShadowAmt: 0.32, gradeHigh: "#ffe4bc", gradeHighAmt: 0.1, bgColor: "#07090c" },
    pitch: 34,
  },
  {
    id: "midnight", name: "Midnight", tagline: "City lights past 2 a.m.",
    swatches: ["#05070c", "#03050a", "#31517a"],
    basemap: { styleUrl: DARK, landColor: "#06080d", waterColor: "#04060a", boundaryGlow: "#31517a", buildings3d: true, buildingColor: "#182338", buildingOpacity: 0.65, buildingHeightMult: 1.3, buildingGradient: true, terrain: false, timeOfDay: 23 },
    look: { vignette: 0.5, grain: 0.06, mapFilter: "none", tintColor: "#0a1430", tintOpacity: 0.1, bgColor: "#030408" },
    pitch: 46,
  },
  {
    id: "desert", name: "Desert", tagline: "Ochre heat, oasis teal",
    swatches: ["#e8d5ae", "#8fbcbb", "#c07b3c"],
    basemap: { styleUrl: LIGHT, landColor: "#ead9b6", waterColor: "#9cc4c2", boundaryGlow: "", terrain: true, terrainStrength: 1.8, buildings3d: false },
    look: { vignette: 0.26, grain: 0.05, mapFilter: "warm", mapFilterAmount: 0.3, gradeHigh: "#ffdf9e", gradeHighAmt: 0.16, bgColor: "#efe2c4" },
    pitch: 42,
  },
  {
    id: "winter", name: "Winter", tagline: "Blue hour over fresh snow",
    swatches: ["#eef2f6", "#a8c0d4", "#5a7a9a"],
    basemap: { styleUrl: LIGHT, landColor: "#eef2f6", waterColor: "#a8c0d4", boundaryGlow: "", terrain: true, terrainStrength: 2.0, buildings3d: false },
    look: { vignette: 0.2, grain: 0.03, mapFilter: "cool", mapFilterAmount: 0.3, gradeHigh: "#e8f2ff", gradeHighAmt: 0.14, bgColor: "#e9eef4" },
    pitch: 42,
  },
  {
    id: "ocean", name: "Ocean", tagline: "Deep-water blues, chart lines",
    swatches: ["#0e2430", "#14506e", "#39b3c9"],
    basemap: { styleUrl: DARK, landColor: "#122a34", waterColor: "#123f58", boundaryGlow: "#39b3c9", terrain: false, buildings3d: false },
    look: { vignette: 0.32, grain: 0.04, mapFilter: "none", tintColor: "#062434", tintOpacity: 0.08, bgColor: "#071820" },
    pitch: 18,
  },
  {
    id: "vintage-atlas", name: "Vintage Atlas", tagline: "1900s plate, foxed paper",
    swatches: ["#efe3c8", "#cdddd3", "#8a6d3b"],
    basemap: { styleUrl: LIGHT, landColor: "#efe3c8", waterColor: "#cdddd3", boundaryGlow: "#8a6d3b", terrain: false, buildings3d: false },
    look: { vignette: 0.4, grain: 0.1, texture: "paper", textureOpacity: 0.55, mapFilter: "antique", mapFilterAmount: 0.75, bgColor: "#e8dcbf" },
    pitch: 0,
  },
  {
    id: "modern-monochrome", name: "Modern Monochrome", tagline: "Gallery grayscale, one voice",
    swatches: ["#ececec", "#d2d2d2", "#2a2a2a"],
    basemap: { styleUrl: LIGHT, landColor: "#ececec", waterColor: "#d4d4d4", boundaryGlow: "#2a2a2a", terrain: false, buildings3d: false },
    look: { vignette: 0.14, grain: 0.02, mapFilter: "noir", mapFilterAmount: 0.85, bgColor: "#f4f4f4" },
    pitch: 0,
  },
];

export const proMapStyleById = (id: string): Map3DStyle | undefined => PRO_MAP_STYLES.find((s) => s.id === id);
