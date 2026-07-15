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
    id: "cartograph", name: "Cartograph", tagline: "Hand-drawn survey — 3D terrain, ink borders & a grid",
    swatches: ["#e6d8ba", "#2f6d75", "#a83e2c"],
    basemap: {
      styleUrl: LIGHT,
      landColor: "#e6d8ba",        // warm parchment
      waterColor: "#2f6d75",       // deep muted teal ocean — bold against the paper
      boundaryGlow: "#a83e2c",     // ink-crimson country borders (old-atlas ink)
      terrain: true, terrainStrength: 1.8,
      buildings3d: false,
      graticule: true,             // a lat/long survey grid, drawn over the terrain
      graticuleColor: "rgba(92,67,38,0.34)", // sepia ink
      graticuleStep: 10,
    },
    look: {
      texture: "paper", textureOpacity: 0.55,
      vignette: 0.3, grain: 0.06, mapFilter: "none",
      gradeHigh: "#fff4df", gradeHighAmt: 0.07,
      bgColor: "#e3d5b6",
    },
    pitch: 44,                     // pitched so the 3D relief + grid read
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
  // ── The colour & city expansion (2026-07) — more design characters ─────────
  {
    id: "metro-night", name: "Metro Night", tagline: "City lights, vivid streets",
    swatches: ["#0a0c16", "#1d2440", "#ffb020"],
    basemap: { styleUrl: STREETS, landColor: "#10131f", waterColor: "#070910", buildingColor: "#252c48", buildingOpacity: 0.85, buildings3d: true, boundaryGlow: "#ffb020", terrain: false },
    look: { vignette: 0.3, grain: 0.05, gradeShadow: "#0a0c1a", gradeShadowAmt: 0.4, gradeHigh: "#ffc86e", gradeHighAmt: 0.3, bgColor: "#06070d" },
    pitch: 52,
  },
  {
    id: "pastel-city", name: "Pastel City", tagline: "Soft candy town, friendly",
    swatches: ["#fdf3ee", "#cfe6e3", "#f2a2b8"],
    basemap: { styleUrl: STREETS, landColor: "#fdf3ee", waterColor: "#cfe6e3", buildingColor: "#f2c9d4", buildingOpacity: 0.75, buildings3d: true, terrain: false },
    look: { vignette: 0.08, grain: 0, tintColor: "#ffd9e2", tintOpacity: 0.06, bgColor: "#fbeee8" },
    pitch: 46,
  },
  {
    id: "nordic-light", name: "Nordic Light", tagline: "Cold, calm, Scandinavian",
    swatches: ["#eef2f5", "#c9d9e4", "#4a7fa5"],
    basemap: { styleUrl: LIGHT, landColor: "#eef2f5", waterColor: "#c9d9e4", boundaryGlow: "#4a7fa5", terrain: true, terrainStrength: 1.1, buildings3d: false },
    look: { vignette: 0.1, grain: 0.02, gradeHigh: "#dcebf5", gradeHighAmt: 0.3, bgColor: "#e9eef2" },
    pitch: 30,
  },
  {
    id: "crimson-atlas", name: "Crimson Atlas", tagline: "Bold red editorial statement",
    swatches: ["#f6efe8", "#e2d5c4", "#c0392b"],
    basemap: { styleUrl: LIGHT, landColor: "#f6efe8", waterColor: "#ddd0bd", boundaryGlow: "#c0392b", terrain: false, buildings3d: false },
    look: { vignette: 0.16, grain: 0.05, texture: "paper", textureOpacity: 0.25, gradeShadow: "#5e2a20", gradeShadowAmt: 0.2, bgColor: "#f1e9df" },
    pitch: 0,
  },
  {
    id: "deep-ocean", name: "Deep Ocean", tagline: "Abyssal blues, bioluminescent",
    swatches: ["#03101e", "#0a2c46", "#2fe0ff"],
    basemap: { styleUrl: DARK, landColor: "#0a1826", waterColor: "#03101e", boundaryGlow: "#2fe0ff", terrain: false, buildings3d: false },
    look: { vignette: 0.34, grain: 0.06, tintColor: "#04263c", tintOpacity: 0.14, gradeHigh: "#7fe9ff", gradeHighAmt: 0.25, bgColor: "#020a12" },
    pitch: 24,
  },
  {
    id: "sunrise-terrain", name: "Sunrise Terrain", tagline: "First-light peaks, rose gold",
    swatches: ["#1a1420", "#6e4258", "#ffb27a"],
    basemap: { styleUrl: SAT, terrain: true, terrainStrength: 1.7, buildings3d: false, landColor: "", waterColor: "" },
    look: { vignette: 0.3, grain: 0.08, gradeShadow: "#2a1a30", gradeShadowAmt: 0.4, gradeHigh: "#ffb27a", gradeHighAmt: 0.5, mapFilter: "warm", mapFilterAmount: 0.35, bgColor: "#120d16" },
    pitch: 58,
  },
  // ── Landing-parity looks — the EXACT styles the homepage previews with, so
  //    the film a creator opens matches the preview that sold them on it. ──
  {
    id: "dark-editorial", name: "Dark Editorial", tagline: "Red borders · grey streets — the newsroom look",
    swatches: ["#14161c", "#FF3B4D", "#8A93A6"],
    basemap: { styleUrl: DARK, landColor: "#14161c", waterColor: "#0b0d13", boundaryGlow: "#FF3B4D", terrain: false, buildings3d: false },
    look: { vignette: 0.34, grain: 0.06, gradeShadow: "#160a0d", gradeShadowAmt: 0.22, bgColor: "#0a0b10" },
    pitch: 0,
  },
  // ── More creative looks — bold, distinctive, leaning into the color +
  //    graticule + terrain system. Think posters, not developer themes. ──
  {
    id: "risograph", name: "Risograph", tagline: "Bold two-ink print — poster energy",
    swatches: ["#f4ead2", "#2b3a67", "#ff5a5f"],
    basemap: { styleUrl: LIGHT, landColor: "#f4ead2", waterColor: "#2b3a67", boundaryGlow: "#ff5a5f", terrain: false, buildings3d: false },
    look: { texture: "paper", textureOpacity: 0.4, grain: 0.16, vignette: 0.14, mapFilter: "none", gradeShadow: "#2b3a67", gradeShadowAmt: 0.12, bgColor: "#f4ead2" },
    pitch: 0,
  },
  {
    id: "thermal", name: "Thermal", tagline: "Infrared scan — glowing magma relief",
    swatches: ["#160424", "#3a0a5c", "#ff8a1f"],
    basemap: { styleUrl: DARK, landColor: "#120522", waterColor: "#05010a", boundaryGlow: "#ff8a1f", terrain: true, terrainStrength: 2.6, buildings3d: false },
    look: { vignette: 0.5, grain: 0.06, mapFilter: "none", tintColor: "#3a0a5c", tintOpacity: 0.16, gradeShadow: "#0a0014", gradeShadowAmt: 0.3, gradeHigh: "#ffb020", gradeHighAmt: 0.18, bgColor: "#05010a" },
    pitch: 52,
  },
  {
    id: "drafting", name: "Drafting Table", tagline: "Architect's blueprint — cyan ink on cream, gridded",
    swatches: ["#eef1ea", "#d7e6e8", "#1b7f9e"],
    basemap: { styleUrl: LIGHT, landColor: "#eef1ea", waterColor: "#d7e6e8", boundaryGlow: "#1b7f9e", terrain: false, buildings3d: false, graticule: true, graticuleColor: "rgba(27,127,158,0.28)", graticuleStep: 10 },
    look: { texture: "paper", textureOpacity: 0.3, vignette: 0.12, grain: 0.04, mapFilter: "none", bgColor: "#e9ece5" },
    pitch: 0,
  },
  {
    id: "synthwave", name: "Synthwave", tagline: "80s neon grid — magenta borders, cyan lines",
    swatches: ["#1a0b2e", "#ff2e97", "#2de2e6"],
    basemap: { styleUrl: DARK, landColor: "#1a0b2e", waterColor: "#0d0620", boundaryGlow: "#ff2e97", terrain: true, terrainStrength: 2.4, buildings3d: false, graticule: true, graticuleColor: "rgba(45,226,230,0.30)", graticuleStep: 10 },
    look: { vignette: 0.5, grain: 0.05, mapFilter: "none", tintColor: "#2a0a45", tintOpacity: 0.14, gradeShadow: "#0a0018", gradeShadowAmt: 0.28, gradeHigh: "#ff6ec7", gradeHighAmt: 0.14, bgColor: "#0d0620" },
    pitch: 60,
  },
  {
    id: "copperplate", name: "Copperplate", tagline: "Antique copper engraving — warm metal atlas",
    swatches: ["#241810", "#0e0a06", "#c98a4b"],
    basemap: { styleUrl: DARK, landColor: "#241810", waterColor: "#0e0a06", boundaryGlow: "#c98a4b", terrain: true, terrainStrength: 1.8, buildings3d: false, graticule: true, graticuleColor: "rgba(201,138,75,0.24)", graticuleStep: 15 },
    look: { texture: "paper", textureOpacity: 0.3, vignette: 0.44, grain: 0.08, mapFilter: "sepia", mapFilterAmount: 0.2, gradeHigh: "#e8b878", gradeHighAmt: 0.16, gradeShadow: "#1a0f06", gradeShadowAmt: 0.24, bgColor: "#120b05" },
    pitch: 40,
  },
  {
    id: "satellite-night", name: "Satellite Night", tagline: "The earth-at-night hero — graded real imagery",
    swatches: ["#16241c", "#3d5a3a", "#0e1a2b"],
    basemap: { styleUrl: SAT, terrain: false, buildings3d: false },
    look: { vignette: 0.5, grain: 0.08, tintColor: "#0a1226", tintOpacity: 0.28, gradeShadow: "#04060f", gradeShadowAmt: 0.42, gradeHigh: "#8fa8c8", gradeHighAmt: 0.07, bgColor: "#04060f" },
    pitch: 0,
  },
];

export const proMapStyleById = (id: string): Map3DStyle | undefined => PRO_MAP_STYLES.find((s) => s.id === id);

/**
 * Map free-text look language → a PRO_MAP_STYLES id. This is what makes the
 * landing preview become the real film even WITHOUT AI: a hero style tap or a
 * BuildFlow "look" answer ("…, dark editorial style") is turned into the exact
 * same pro style the editor would apply. Ordered most-specific first; returns
 * null when nothing clearly matches so the planner's default stands. (The AI
 * path picks map3dStyle itself — this only fills the gap on the heuristic path.)
 */
const STYLE_PHRASE_TO_ID: [RegExp, string][] = [
  // ── Landing hero taps + BuildFlow "look" values — the EXACT previews shown ──
  [/\bdark[- ]?editorial\b|\bnewsroom\b|\bred[- ]?border/i, "dark-editorial"],
  [/\b(satellite|imagery)\b[^.]*\b(night|cinematic|film(ic)?|hero)\b|\b(night|cinematic)\b[^.]*\bsatellite\b/i, "satellite-cinematic"],
  [/\b3d\b[^.]*\bterrain\b|\bterrain\b[^.]*\b3d\b|\bflythrough\b|\bmountain(s)?\b|\bpeaks?\b|\balps\b/i, "satellite-cinematic"],
  [/\bclean\b[^.]*\bsimple\b|\bsimple\b[^.]*\bmap\b|\bminimal(ist)?\b/i, "apple-light"],
  [/\bcartograph|\bhand[- ]?drawn\b|\bsurvey\b|\bold[- ]?world\b|\bink\b/i, "cartograph"],
  [/\brisograph|\briso\b|\bposter\b|\btwo[- ]?ink\b|\bscreen[- ]?print/i, "risograph"],
  [/\bthermal\b|\binfrared\b|\bmagma\b|\bheat vision\b/i, "thermal"],
  [/\bdrafting\b|\barchitect|\btechnical draw|\bblueprint (cream|light)\b/i, "drafting"],
  [/\bsynthwave|\bvaporwave|\bretro[- ]?80s?\b|\bneon grid\b|\boutrun\b/i, "synthwave"],
  [/\bcopperplate|\bcopper\b|\bengrav|\bbronze\b|\bmetal(lic)? atlas\b/i, "copperplate"],
  [/\bsatellite\b/i, "satellite-night"],
  // ── Common pro-style names, typed directly ──
  [/\bnat(ional)? ?geo(graphic)?\b/i, "natgeo"],
  [/\bvintage\b|\bold[- ]?map\b|\bantique\b|\batlas\b/i, "vintage-atlas"],
  [/\bcrimson\b|\bbold red\b/i, "crimson-atlas"],
  [/\bnoir\b|\bmidnight\b/i, "midnight"],
  [/\bluxury\b|\bpremium\b|\belegant\b/i, "luxury-travel"],
  [/\badventure\b|\bexpedition\b|\bhik(e|ing)\b|\btrek\b/i, "adventure"],
  [/\b(deep )?ocean\b|\bnautical\b|\babyss/i, "deep-ocean"],
  [/\bdesert\b|\bsahara\b|\barid\b/i, "desert"],
  [/\bwinter\b|\bsnow\b|\barctic\b|\bpolar\b/i, "winter"],
  [/\bdocumentary\b|\bearth[- ]?doc/i, "earth-documentary"],
  [/\bapple\b|\bcupertino\b/i, "apple-dark"],
  [/\bsunrise\b|\bgolden[- ]?hour\b|\bdawn\b|\bfirst light\b/i, "sunrise-terrain"],
  [/\bnordic\b|\bscandi/i, "nordic-light"],
  [/\bpastel\b/i, "pastel-city"],
  [/\bmonochrome\b|\bblack[- ]?and[- ]?white\b|\bb&w\b/i, "modern-monochrome"],
];

/** First matching pro-style id for a piece of look language, or null. */
export function detectProStyle(text: string): string | null {
  if (!text) return null;
  for (const [re, id] of STYLE_PHRASE_TO_ID) if (re.test(text)) return id;
  return null;
}

/**
 * The overlay-element palette a style implies — so applying a style restyles the
 * WHOLE scene (routes, highlights, markers, labels), not just the basemap.
 * `accent` = the style's signature line/marker colour; `ink` = a readable text
 * colour for its background; `water` for water-hugging elements. Same derivation
 * the landing preview uses, so preview == editor for element colour too.
 */
export function elementPaletteFor(style: Map3DStyle): { accent: string; ink: string; water: string } {
  const sw = (style.swatches as string[] | undefined) ?? [];
  const bm = style.basemap as Record<string, unknown>;
  const bg = String((style.look as Record<string, unknown> | undefined)?.bgColor || sw[0] || "#04060f");
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const light = lum(bg) > 150 || lum(String(bm.landColor || "")) > 150;
  // The accent is the style's border colour when it sets one; otherwise a bright
  // legible default (satellite/imagery styles have no vector border to borrow, and
  // the card swatches are earth-toned — too dark for a route line).
  return {
    accent: String(bm.boundaryGlow || (light ? "#3b4bd8" : "#6E7BFF")),
    ink: light ? "#141428" : "#ffffff",
    water: String(bm.waterColor || sw[1] || "#2fe0ff"),
  };
}
