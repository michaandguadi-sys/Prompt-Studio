/**
 * Showcase stories — a hand-authored gallery of FINISHED, polished map films the
 * user can open and play in one click. Each is a deterministic PLAN (no LLM
 * round-trip) resolved by /api/v2/generate into a real project, so what you see
 * is exactly what renders.
 *
 * The set is a spread of genuine creator use-cases, each on a different pro
 * style + motion so the gallery reads like a reel:
 *   · Highlight Nepal        — country highlight · adventure terrain (reverse-
 *                              engineered from the saved "Highlight Nepal" scene)
 *   · Panda Capital          — city portrait orbit of Chengdu (from "Panda Capital")
 *   · Around the World       — multi-leg flight, satellite-cinematic
 *   · Countries I've Visited — a personal travel map, vintage atlas
 *
 * `motion` on each card drives the animated thumbnail so the tile previews the
 * real move (a route drawing itself, a country blooming, an orbit).
 */

export type ShowcaseMotion = "highlight" | "orbit" | "route" | "travelmap";

export type ShowcaseStory = {
  id: string;
  label: string;
  genre: string;
  emoji: string;
  /** Lead accent + dark base for the tile's animated preview. */
  accent: string;
  bg: string;
  /** Which animated motif the thumbnail plays. */
  motion: ShowcaseMotion;
  /** The deterministic plan the generator resolves into a real project. */
  plan: Record<string, unknown>;
};

export const SHOWCASE_STORIES: ShowcaseStory[] = [
  {
    id: "nepal",
    label: "Highlight Nepal",
    genre: "Country highlight",
    emoji: "🏔️",
    accent: "#ffb454",
    bg: "#0c1116",
    motion: "highlight",
    plan: {
      title: "Nepal", durationSec: 9, aspect: "16:9", focus: "Nepal",
      motion: "orbit", priority: "highlight", cameraPitch: 56, terrain: true,
      map3dStyle: "adventure", fontDisplay: "Oswald", fontBody: "Inter",
      layers: [
        { kind: "highlight", place: "Nepal", fill: "hatch",
          style: { fillColor: "#e8933a", fillOpacity: 0.42, borderColor: "#ffffff", borderWidth: 3, glowColor: "#ffb454", glowWidth: 30, animation: "border-first", labelText: "NEPAL", labelSize: 54, labelColor: "#ffffff" } },
        { kind: "label", text: "KATHMANDU", sub: "capital", place: "Kathmandu", variant: "pin", style: { sizePx: 36, accent: "#ffb454" } },
        { kind: "title", text: "NEPAL", sub: "Roof of the world", template: "impact", position: "bottom" },
      ],
    },
  },
  {
    id: "panda",
    label: "Panda Capital",
    genre: "City portrait",
    emoji: "🐼",
    accent: "#4bbf6b",
    bg: "#0a1410",
    motion: "orbit",
    plan: {
      title: "Chengdu", durationSec: 8, aspect: "16:9", focus: "Chengdu",
      motion: "orbit", priority: "camera", cameraPitch: 62, terrain: true, buildings3d: true,
      map3dStyle: "sunrise-terrain", fontDisplay: "Helvetica Now", fontBody: "Inter",
      layers: [
        { kind: "label", text: "CHENGDU", sub: "成都 · panda capital", place: "Chengdu", variant: "pin", style: { sizePx: 56, color: "#ffffff", accent: "#4bbf6b" } },
        { kind: "label", text: "DUJIANGYAN", sub: "panda base", place: "Dujiangyan", variant: "pin", style: { sizePx: 32, accent: "#4bbf6b" } },
        { kind: "title", text: "THE PANDA CAPITAL", sub: "Chengdu, Sichuan", template: "classic", position: "bottom" },
      ],
    },
  },
  {
    id: "world",
    label: "Around the World",
    genre: "Journey · flight",
    emoji: "✈️",
    accent: "#4ab8ff",
    bg: "#060b16",
    motion: "route",
    plan: {
      title: "Around the World", durationSec: 12, aspect: "16:9", focus: "New York",
      motion: "fly-in", priority: "route", map3dStyle: "satellite-cinematic",
      fontDisplay: "Oswald", fontBody: "Inter",
      layers: [
        { kind: "route", from: "New York", to: "London", transport: "aircraft", icon: "plane", cameraMode: "chase",
          style: { color: "#4ab8ff", width: 6, glow: 0.8, dashStyle: "dotted", reveal: "draw", smoothness: 0.3 } },
        { kind: "route", from: "London", to: "Dubai", transport: "aircraft", icon: "none", cameraMode: "chase",
          style: { color: "#4ab8ff", width: 6, glow: 0.7, dashStyle: "dotted", reveal: "draw", smoothness: 0.3 } },
        { kind: "route", from: "Dubai", to: "Tokyo", transport: "aircraft", icon: "plane", cameraMode: "chase",
          style: { color: "#4ab8ff", width: 6, glow: 0.7, dashStyle: "dotted", reveal: "draw", smoothness: 0.3 } },
        { kind: "title", text: "AROUND THE WORLD", sub: "New York → Tokyo", template: "impact", position: "bottom" },
      ],
    },
  },
  {
    id: "visited",
    label: "Countries I've Visited",
    genre: "Travel map",
    emoji: "🌍",
    accent: "#e0533a",
    bg: "#161009",
    motion: "travelmap",
    plan: {
      title: "My Travels", durationSec: 11, aspect: "16:9", focus: "France",
      motion: "zoom-out", priority: "highlight", map3dStyle: "vintage-atlas",
      fontDisplay: "Georgia", fontBody: "Georgia",
      look: { vignette: 0.5, grain: 0.12, texture: "paper", textureOpacity: 0.7, tintColor: "#6b4a1f", tintOpacity: 0.3 },
      layers: [
        { kind: "highlight", place: "France", fill: "solid", style: { fillColor: "#e0533a", fillOpacity: 0.5, borderColor: "#ffffff", borderWidth: 2, glowColor: "#ff6a4a", glowWidth: 20, animation: "grow" } },
        { kind: "highlight", place: "Italy", fill: "solid", style: { fillColor: "#4bbf6b", fillOpacity: 0.5, borderColor: "#ffffff", borderWidth: 2, glowColor: "#5bd67b", glowWidth: 20, animation: "grow" } },
        { kind: "highlight", place: "Japan", fill: "solid", style: { fillColor: "#4ab8ff", fillOpacity: 0.5, borderColor: "#ffffff", borderWidth: 2, glowColor: "#6ac6ff", glowWidth: 20, animation: "grow" } },
        { kind: "highlight", place: "Morocco", fill: "solid", style: { fillColor: "#f4a340", fillOpacity: 0.5, borderColor: "#ffffff", borderWidth: 2, glowColor: "#ffb454", glowWidth: 20, animation: "grow" } },
        { kind: "title", text: "COUNTRIES I'VE VISITED", sub: "France · Italy · Japan · Morocco", template: "kicker", position: "bottom" },
      ],
    },
  },
];
