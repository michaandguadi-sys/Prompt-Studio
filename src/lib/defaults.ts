import type { SceneSpec } from "./types";
import { DEFAULT_STYLE } from "./presets/styles";
import { DEFAULT_BEATS } from "./beats";
import { DEFAULT_MAPBOX_STYLE } from "./mapbox";

export const DEFAULT_MAP_SCENE: SceneSpec = {
  kind: "map",
  name: "Scene-Untitled",
  durationSec: 3,
  fps: 24,
  aspect: "16:9",
  width: 3840,
  height: 2160,
  style: DEFAULT_STYLE,
  scene: {
    start: { lon: 108.0, lat: 28.0, zoom: 2.6 },
    mid: { lon: 113.95, lat: 22.95, zoom: 7.4 },
    end: {
      lon: 113.945,
      lat: 22.555,
      zoom: 11.2,
      pitch: 0,
      bearing: 0,
    },
    beats: DEFAULT_BEATS,
    easing: { phase1: "easeInOut", phase2: "smooth" },
    highlight: null,
    transparentBg: false,
    showStreets: true,
    showLabels: true,
    route: null,
    labels: [
      {
        primary: "SHENZHEN",
        secondary: "GUANGDONG · CHINA",
        primaryInFrame: 18,
        primaryOutFrame: 44,
        secondaryInFrame: 18,
        layout: "city-projected",
        projectLon: 114.066,
        projectLat: 22.5431,
      },
      {
        primary: "NANSHAN DISTRICT",
        secondary: "南山区 · 113.93° E   22.53° N",
        primaryInFrame: 44,
        primaryOutFrame: 72,
        secondaryInFrame: 44,
        layout: "bottom-banner",
      },
    ],
    mapStyleUrl: DEFAULT_MAPBOX_STYLE,
  },
};

export const DEFAULT_TITLE_SCENE: SceneSpec = {
  kind: "title",
  name: "Title-Untitled",
  durationSec: 3,
  fps: 24,
  aspect: "16:9",
  width: 3840,
  height: 2160,
  style: DEFAULT_STYLE,
  scene: {
    variant: "centered",
    title: "EPISODE TITLE",
    subtitle: "A documentary by Guada & Micha",
    kicker: "CHAPTER 01",
    background: "solid",
    reveal: { inFrame: 0, holdFrame: 30, outFrame: 72 },
  },
};

export const DEFAULT_LOWERTHIRD_SCENE: SceneSpec = {
  kind: "lowerthird",
  name: "LT-Untitled",
  durationSec: 4,
  fps: 24,
  aspect: "16:9",
  width: 3840,
  height: 2160,
  style: DEFAULT_STYLE,
  scene: {
    position: "left",
    name: "GUADA",
    role: "HOST · TRAVEL JOURNALIST",
    accentBar: true,
    reveal: { inFrame: 6, holdFrame: 36, outFrame: 96 },
  },
};

export const DEFAULT_QUOTE_SCENE: SceneSpec = {
  kind: "quote",
  name: "Quote-Untitled",
  durationSec: 5,
  fps: 24,
  aspect: "16:9",
  width: 3840,
  height: 2160,
  style: DEFAULT_STYLE,
  scene: {
    quote: "The map is not the territory. But sometimes it's the closest thing we have.",
    attribution: "ALFRED KORZYBSKI",
    context: "Polish-American philosopher · 1933",
    variant: "centered",
    showQuoteMarks: true,
    background: "solid",
    reveal: { inFrame: 0, holdFrame: 30, outFrame: 120 },
  },
};

export const DEFAULT_DATAVIZ_SCENE: SceneSpec = {
  kind: "dataviz",
  name: "Stat-Untitled",
  durationSec: 4,
  fps: 24,
  aspect: "16:9",
  width: 3840,
  height: 2160,
  style: DEFAULT_STYLE,
  scene: {
    variant: "counter",
    data: { value: 1400000, prefix: "", suffix: " people" },
    labels: {
      title: "POPULATION GROWTH",
      subtitle: "SHENZHEN · 1980–2024",
    },
    reveal: { inFrame: 12, holdFrame: 60, outFrame: 96 },
  },
};
