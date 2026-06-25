import {
  type Project, type Composition, type Layer, type LayerType, type CameraPose,
  Layer as LayerSchema, SCHEMA_VERSION,
} from "./schema";

/** Stable unique id (browser + node safe). */
export function id(prefix = "l"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

const DEFAULT_ACCENT = "#6E7BFF";

/** A neutral starting camera move (gentle zoom-in on a world view). */
export function defaultCamera(end?: Partial<CameraPose>): Layer {
  const e: CameraPose = { lon: 0, lat: 20, zoom: 4, pitch: 35, bearing: 0, ...end };
  return LayerSchema.parse({
    id: id("cam"),
    type: "camera",
    name: "Camera",
    start: { lon: e.lon, lat: e.lat, zoom: Math.max(1.6, e.zoom - 3), pitch: 0, bearing: 0 },
    end: e,
    waypoints: [],
    moveFraction: 0.85,
    easing: "easeInOut",
    smoothPath: true,
  });
}

/**
 * Create a fully-valid default layer of a given type. Overrides are shallow-
 * merged then validated through Zod, so callers can't produce an invalid layer.
 */
export function createLayer(type: LayerType, overrides: Record<string, unknown> = {}): Layer {
  const base = { id: id(type.slice(0, 3)), enabled: true };
  const timing = { inSec: 0.5, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" };
  const byType: Record<LayerType, Record<string, unknown>> = {
    camera: { type: "camera", name: "Camera", start: { lon: 0, lat: 20, zoom: 1.8, pitch: 0, bearing: 0 }, end: { lon: 0, lat: 20, zoom: 4, pitch: 35, bearing: 0 } },
    highlight: { type: "highlight", name: "Highlight", timing, geojson: null, fillColor: DEFAULT_ACCENT, borderColor: DEFAULT_ACCENT, glowColor: DEFAULT_ACCENT },
    route: { type: "route", name: "Route", timing, from: { lon: 2.35, lat: 48.85 }, to: { lon: 28.97, lat: 41.0 }, color: DEFAULT_ACCENT },
    label: { type: "label", name: "Label", timing, text: "LABEL", anchor: { kind: "coord", lon: 0, lat: 20 }, accent: DEFAULT_ACCENT },
    flag: { type: "flag", name: "Flag", timing, iso: "FR", anchor: { lon: 0, lat: 20 } },
    title: { type: "title", name: "Title", timing, text: "TITLE", accent: DEFAULT_ACCENT },
    chart: { type: "chart", name: "Chart", timing, accent: DEFAULT_ACCENT },
    choropleth: { type: "choropleth", name: "Choropleth", timing, data: [], metric: "", unit: "", colorLow: "#e3f2fd", colorHigh: "#0d47a1", showLegend: true },
    bubble: { type: "bubble", name: "Bubble map", timing, data: [], metric: "", unit: "", maxSizePx: 140, showLabels: true, showLegend: true, animate: "grow" },
    flow: { type: "flow", name: "Flow arcs", timing, data: [], metric: "", unit: "", color: "#2fe0ff", maxWidthPx: 14, curve: 0.3, animate: "draw", showLegend: false },
    heatmap: { type: "heatmap", name: "Heatmap", timing, data: [], metric: "", unit: "", radius: 40, intensity: 1, colorLow: "#1a237e", colorHigh: "#ff3d00", showLegend: false },
    image: { type: "image", name: "Image", timing, url: "", anchor: { kind: "coord", lon: 0, lat: 20 } },
    marker: { type: "marker", name: "Marker", timing, anchor: { lon: 0, lat: 20 }, icon: "pin", color: "#ff5a44" },
    annotation: { type: "annotation", name: "Annotation", timing, anchor: { lon: 0, lat: 20 }, text: "Annotation", accent: DEFAULT_ACCENT },
    connections: { type: "connections", name: "Connections", timing, mode: "hub", hub: null, points: [], color: DEFAULT_ACCENT, dotColor: "#ffffff" },
    spotlight: { type: "spotlight", name: "Spotlight", timing, anchor: { lon: 0, lat: 20 } },
    track: { type: "track", name: "Track", timing, points: [], segments: [] },
  };
  return LayerSchema.parse({ ...base, ...byType[type], ...overrides });
}

/** A fresh blank project: a camera + a single title label, ready to edit. */
export function createDefaultProject(name = "Untitled animation"): Project {
  const composition: Composition = {
    aspect: "16:9",
    fps: 24,
    durationSec: 6,
    basemap: {
      styleUrl: "mapbox://styles/mapbox/dark-v11",
      showStreets: false,
      showLabels: true,
      labelDetail: "cities",
      buildings3d: false,
      terrain: false,
      transparentBg: false,
      mapYear: "",
      mapYearEnd: "",
      terrainStrength: 1.4,
      landColor: "",
      waterColor: "",
      buildingColor: "",
      buildingOpacity: 0.62,
      buildingHeightMult: 1,
      buildingGradient: false,
      boundaryGlow: "",
      skyColor: "",
      style3d: "",
      photoreal3d: false,
      timeOfDay: 13,
      sunDate: "",
    },
    theme: {
      name: "Default",
      accent: DEFAULT_ACCENT, fill: DEFAULT_ACCENT, border: DEFAULT_ACCENT, glow: DEFAULT_ACCENT, text: "#ffffff",
      fontDisplay: "Inter", fontBody: "Inter",
    },
    look: { vignette: 0, letterbox: 0, grain: 0, texture: "none", textureOpacity: 0.5, mapFilter: "none", mapFilterAmount: 0.85, tintColor: "#0a1030", tintOpacity: 0, bgColor: "#05060e", gradeShadow: "", gradeShadowAmt: 0.5, gradeMid: "", gradeMidAmt: 0.5, gradeHigh: "", gradeHighAmt: 0.5, showCaptions: false },
    layers: [
      defaultCamera(),
      createLayer("label", {
        text: "YOUR PLACE",
        sub: "",
        variant: "pin",
        anchor: { kind: "coord", lon: 0, lat: 20 },
      }),
    ],
    narration: "",
    citations: [],
  };
  const now = Date.now();
  return {
    id: id("proj"),
    name,
    schemaVersion: SCHEMA_VERSION,
    composition,
    // Scenes are filled in by the store's ensureScenes() on load (wrapping this
    // single composition into "Scene 1") — keeps a fresh project valid here.
    scenes: [],
    activeSceneId: "",
    shareToken: null,
    createdAt: now,
    updatedAt: now,
  };
}
