/**
 * NASA GIBS "Live Earth" presets — the real-world imagery/data you can layer
 * OVER any map style. Every config here is VERIFIED to return imagery in
 * EPSG:3857 (Web Mercator, matching MapLibre) — the previous set silently 400/404'd
 * for night, fires, SST and snow because their TileMatrixSet was wrong.
 *
 * `staticTime` layers (Blue Marble, Black Marble) are time-invariant and
 * seamless (no clouds, no orbital gaps) — the best "fits the whole map" default.
 */
export type EarthCfg = {
  datasetId: string;
  tileFormat: "jpg" | "png";
  tileMatrix: string;
  maxzoom: number;
  staticTime: boolean;
  attribution: string;
  label: string;
};

export type EarthCategory = "Imagery" | "Weather" | "Climate & ocean" | "People & life" | "Air quality";
export const EARTH_CATEGORIES: EarthCategory[] = ["Imagery", "Weather", "Climate & ocean", "People & life", "Air quality"];

export type EarthPreset = {
  key: string;
  name: string;
  tagline: string;
  category: EarthCategory;
  swatches: [string, string, string];
  opacity: number;
  cfg: EarthCfg;
};

const T = "GoogleMapsCompatible_Level";

export const EARTH_PRESETS: EarthPreset[] = [
  // ── Imagery ──
  { key: "bluemarble", name: "Blue Marble", tagline: "Seamless cloud-free Earth", category: "Imagery", swatches: ["#0a1b2e", "#1e4d6b", "#2e5f4e"], opacity: 1,
    cfg: { datasetId: "BlueMarble_ShadedRelief_Bathymetry", tileFormat: "jpg", tileMatrix: `${T}8`, maxzoom: 8, staticTime: true, attribution: "NASA Blue Marble / Earthdata", label: "Blue Marble" } },
  { key: "truecolor", name: "Earth today", tagline: "Live daily satellite (real clouds)", category: "Imagery", swatches: ["#0a1b2e", "#2e5f4e", "#c2b48a"], opacity: 0.94,
    cfg: { datasetId: "VIIRS_SNPP_CorrectedReflectance_TrueColor", tileFormat: "jpg", tileMatrix: `${T}9`, maxzoom: 9, staticTime: false, attribution: "NASA VIIRS / Earthdata GIBS", label: "Earth today — NASA VIIRS" } },
  { key: "night", name: "Earth at night", tagline: "City lights (Black Marble)", category: "Imagery", swatches: ["#02030a", "#1a1f3a", "#ffd9a0"], opacity: 1,
    cfg: { datasetId: "VIIRS_Black_Marble", tileFormat: "png", tileMatrix: `${T}8`, maxzoom: 8, staticTime: true, attribution: "NASA Black Marble / Earthdata", label: "Night lights — Black Marble" } },

  // ── Weather (near-real-time) ──
  { key: "precipitation", name: "Rain & precipitation", tagline: "Live precipitation rate (IMERG)", category: "Weather", swatches: ["#0a1420", "#1e4d8c", "#4fd0ff"], opacity: 0.85,
    cfg: { datasetId: "IMERG_Precipitation_Rate", tileFormat: "png", tileMatrix: `${T}6`, maxzoom: 6, staticTime: false, attribution: "NASA GPM IMERG / Earthdata GIBS", label: "Precipitation — IMERG" } },
  { key: "clouds", name: "Cloud cover", tagline: "Live cloud fraction", category: "Weather", swatches: ["#0a0f18", "#4a5568", "#e8eef5"], opacity: 0.7,
    cfg: { datasetId: "MODIS_Terra_Cloud_Fraction_Day", tileFormat: "png", tileMatrix: `${T}6`, maxzoom: 6, staticTime: false, attribution: "NASA MODIS Cloud / Earthdata GIBS", label: "Cloud fraction — MODIS" } },
  { key: "heat", name: "Land temperature", tagline: "Surface heat (day)", category: "Weather", swatches: ["#160a06", "#7a2a10", "#ff8a3a"], opacity: 0.8,
    cfg: { datasetId: "MODIS_Terra_Land_Surface_Temp_Day", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: false, attribution: "NASA MODIS LST / Earthdata GIBS", label: "Land temperature — MODIS" } },
  { key: "watervapor", name: "Water vapour", tagline: "Atmospheric humidity", category: "Weather", swatches: ["#08161c", "#2a6a7a", "#cfeff5"], opacity: 0.78,
    cfg: { datasetId: "MODIS_Terra_Water_Vapor_5km_Day", tileFormat: "png", tileMatrix: `${T}6`, maxzoom: 6, staticTime: false, attribution: "NASA MODIS Water Vapor / Earthdata GIBS", label: "Water vapour — MODIS" } },

  // ── Climate & ocean ──
  { key: "ocean", name: "Ocean heat", tagline: "Sea-surface temperature", category: "Climate & ocean", swatches: ["#040a18", "#0c3a6e", "#ff5a44"], opacity: 0.85,
    cfg: { datasetId: "GHRSST_L4_MUR_Sea_Surface_Temperature", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: false, attribution: "NASA GHRSST MUR / Earthdata GIBS", label: "Sea temperature — MUR" } },
  { key: "snow", name: "Snow & ice", tagline: "Live snow cover (NDSI)", category: "Climate & ocean", swatches: ["#0a1420", "#3c5a78", "#e8f2ff"], opacity: 0.85,
    cfg: { datasetId: "MODIS_Terra_NDSI_Snow_Cover", tileFormat: "png", tileMatrix: `${T}8`, maxzoom: 8, staticTime: false, attribution: "NASA MODIS NDSI / Earthdata GIBS", label: "Snow & ice — NDSI" } },

  // ── People & life ──
  { key: "population", name: "Population density", tagline: "Where people live (SEDAC)", category: "People & life", swatches: ["#0a0614", "#4a2a6a", "#ffd24a"], opacity: 0.82,
    cfg: { datasetId: "GPW_Population_Density_2020", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: true, attribution: "NASA SEDAC GPWv4 / Earthdata GIBS", label: "Population density — SEDAC" } },
  { key: "vegetation", name: "Living Earth", tagline: "Vegetation index (NDVI)", category: "People & life", swatches: ["#08140c", "#1e5a30", "#8fd06a"], opacity: 0.9,
    cfg: { datasetId: "MODIS_Terra_NDVI_8Day", tileFormat: "png", tileMatrix: `${T}9`, maxzoom: 9, staticTime: false, attribution: "NASA MODIS NDVI / Earthdata GIBS", label: "Vegetation — NDVI" } },

  // ── Air quality ──
  { key: "fires", name: "Active fires", tagline: "Thermal hotspots, near-real-time", category: "Air quality", swatches: ["#140a06", "#7a2410", "#ff7a30"], opacity: 0.95,
    cfg: { datasetId: "MODIS_Terra_Thermal_Anomalies_All", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: false, attribution: "NASA MODIS Thermal / Earthdata GIBS", label: "Active fires — MODIS" } },
  { key: "aerosol", name: "Air quality", tagline: "Aerosol / pollution haze", category: "Air quality", swatches: ["#12100c", "#5a4a2a", "#d8b46a"], opacity: 0.85,
    cfg: { datasetId: "MODIS_Combined_Value_Added_AOD", tileFormat: "png", tileMatrix: `${T}6`, maxzoom: 6, staticTime: false, attribution: "NASA MODIS AOD / Earthdata GIBS", label: "Aerosol — AOD" } },
];

export const earthPresetByDataset = (id: string): EarthPreset | undefined =>
  EARTH_PRESETS.find((p) => p.cfg.datasetId === id);

/** createLayer("earthlayer", overrides) — INSTANT display (no fade-in delay), so
 *  the layer shows the moment it's selected regardless of the playhead position. */
export function earthLayerOverrides(p: EarthPreset): Record<string, unknown> {
  return {
    name: p.name,
    ...p.cfg,
    date: p.cfg.staticTime ? "" : "latest",
    opacity: p.opacity,
    timing: { inSec: 0, outSec: null, enter: "none", exit: "none", easing: "linear" },
  };
}

/** Relative-date options for the (dated) datasets — a clean selector, not a
 *  free-text field. Values resolve to real YYYY-MM-DD at render time via the
 *  helper below; "latest" → the freshest processed tiles. */
export const EARTH_DATE_OPTIONS: { label: string; value: string }[] = [
  { label: "Latest", value: "latest" },
  { label: "1 week ago", value: "-7" },
  { label: "1 month ago", value: "-30" },
  { label: "3 months ago", value: "-90" },
  { label: "6 months ago", value: "-180" },
  { label: "1 year ago", value: "-365" },
];

/** Resolve a stored date value ("latest", "-30", or an absolute YYYY-MM-DD) to a
 *  concrete date. Shared by the render and the inspector preview. */
export function resolveEarthDate(v: string | undefined): string {
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const rel = /^-(\d+)$/.exec(s);
  const daysBack = rel ? Number(rel[1]) : 2; // "latest"/"" → 2 days back (freshest reliable)
  return new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
}
