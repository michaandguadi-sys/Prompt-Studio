/**
 * Signature Styles — complete, opinionated art directions a user picks BEFORE
 * generating. Each one is what a motion designer would hand you as a "look":
 * palette + type pairing + film grade + texture + basemap, applied as one.
 *
 * Used by the Story Builder UI (style cards) and /api/v2/generate (the chosen
 * style overrides the plan's palette/fonts/look so the result is cohesive).
 */
export type SignatureStyle = {
  id: string;
  name: string;
  tagline: string;
  /** UI swatch colours: [backdrop, mid, accent]. */
  swatches: [string, string, string];
  /** Display font (also shown in the card specimen). */
  fontDisplay: string;
  fontBody: string;
  /** THEME_PRESETS palette name this style locks in. */
  palette: string;
  basemapStyle?: "dark" | "light" | "satellite" | "streets" | "outdoors";
  /** Full cinematic look (grade + texture) applied to the composition. */
  look: Record<string, unknown>;
};

export const SIGNATURE_STYLES: SignatureStyle[] = [
  {
    id: "war-room",
    name: "War Room",
    tagline: "Noir grade · film grain · red ops",
    swatches: ["#0a0303", "#7a1410", "#ff5a44"],
    fontDisplay: "Oswald", fontBody: "Inter",
    palette: "Conflict Red", basemapStyle: "dark",
    look: { vignette: 0.62, letterbox: 0.12, grain: 0.26, texture: "noise", textureOpacity: 0.35, mapFilter: "noir", mapFilterAmount: 0.5, tintColor: "#1a0606", tintOpacity: 0.28, bgColor: "#0a0303" },
  },
  {
    id: "expedition-1900",
    name: "Expedition 1900",
    tagline: "Antique map · old paper · sepia",
    swatches: ["#161009", "#c9a35c", "#f3e6c8"],
    fontDisplay: "Georgia", fontBody: "Georgia",
    palette: "Vox Editorial", basemapStyle: "light",
    look: { vignette: 0.55, letterbox: 0.08, grain: 0.15, texture: "paper", textureOpacity: 0.75, mapFilter: "antique", mapFilterAmount: 0.85, tintColor: "#6b4a1f", tintOpacity: 0.3, bgColor: "#161009" },
  },
  {
    id: "editorial",
    name: "Editorial",
    tagline: "Vox-style · serif headlines · clean",
    swatches: ["#05060e", "#ffd24a", "#ffffff"],
    fontDisplay: "Georgia", fontBody: "Inter",
    palette: "Vox Editorial", basemapStyle: "dark",
    look: { vignette: 0.42, letterbox: 0.1, grain: 0.12, texture: "none", textureOpacity: 0.5, mapFilter: "none", mapFilterAmount: 0.85, tintColor: "#0a1030", tintOpacity: 0.12, bgColor: "#05060e" },
  },
  {
    id: "neo-atlas",
    name: "Neo Atlas",
    tagline: "Cool grade · grid · futuristic",
    swatches: ["#02060c", "#1a3a6e", "#4ab8ff"],
    fontDisplay: "Helvetica Now", fontBody: "Inter",
    palette: "Arctic Cold", basemapStyle: "dark",
    look: { vignette: 0.3, letterbox: 0, grain: 0.04, texture: "grid", textureOpacity: 0.35, mapFilter: "cool", mapFilterAmount: 0.6, tintColor: "#08131f", tintOpacity: 0.15, bgColor: "#02060c" },
  },
  {
    id: "noir-dossier",
    name: "Noir Dossier",
    tagline: "B&W · scanlines · typewriter",
    swatches: ["#000000", "#3a3a3a", "#e8e8e8"],
    fontDisplay: "Courier New", fontBody: "Courier New",
    palette: "Classic Mono", basemapStyle: "dark",
    look: { vignette: 0.7, letterbox: 0.13, grain: 0.3, texture: "scanlines", textureOpacity: 0.45, mapFilter: "noir", mapFilterAmount: 0.9, tintColor: "#000814", tintOpacity: 0.25, bgColor: "#000000" },
  },
  {
    id: "terra-verde",
    name: "Terra Verde",
    tagline: "Warm grade · trade green · earthy",
    swatches: ["#03100c", "#0d5c3a", "#2ec4b6"],
    fontDisplay: "Inter", fontBody: "Inter",
    palette: "Trade Green", basemapStyle: "dark",
    look: { vignette: 0.38, letterbox: 0.06, grain: 0.1, texture: "none", textureOpacity: 0.5, mapFilter: "warm", mapFilterAmount: 0.5, tintColor: "#04201a", tintOpacity: 0.18, bgColor: "#03100c" },
  },
];

export function signatureStyleById(id?: string | null): SignatureStyle | null {
  if (!id || id === "auto") return null;
  return SIGNATURE_STYLES.find((s) => s.id === id) ?? null;
}
