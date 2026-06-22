export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Custom user style (from .env.local) is the dark cinematic one used by Scene01. */
export const CUSTOM_MAPBOX_STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ??
  "mapbox://styles/mapbox/dark-v11";

export const DEFAULT_MAPBOX_STYLE = CUSTOM_MAPBOX_STYLE;

/**
 * Base map styles — the user picks ONE of these, then toggles streets +
 * labels independently. We always pick the "plain" version of each style;
 * layer toggles control whether streets/labels actually render.
 */
export const MAP_BASE_STYLES: {
  id: string;
  label: string;
  url: string;
  tone: "dark" | "light" | "satellite" | "outdoors";
}[] = [
  { id: "custom",    label: "Custom Dark", url: CUSTOM_MAPBOX_STYLE,                     tone: "dark" },
  { id: "dark",      label: "Dark",        url: "mapbox://styles/mapbox/dark-v11",       tone: "dark" },
  { id: "light",     label: "Light",       url: "mapbox://styles/mapbox/light-v11",      tone: "light" },
  { id: "satellite", label: "Satellite",   url: "mapbox://styles/mapbox/satellite-v9",   tone: "satellite" },
  { id: "outdoors",  label: "Outdoors",    url: "mapbox://styles/mapbox/outdoors-v12",   tone: "outdoors" },
];

export const matchBaseStyle = (url: string) =>
  MAP_BASE_STYLES.find((p) => p.url === url)?.id ?? "custom";
