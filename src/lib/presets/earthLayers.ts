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

export type EarthPreset = {
  key: string;
  name: string;
  tagline: string;
  swatches: [string, string, string];
  opacity: number;
  cfg: EarthCfg;
};

const T = "GoogleMapsCompatible_Level";

export const EARTH_PRESETS: EarthPreset[] = [
  { key: "bluemarble", name: "Blue Marble", tagline: "Seamless cloud-free Earth", swatches: ["#0a1b2e", "#1e4d6b", "#2e5f4e"], opacity: 1,
    cfg: { datasetId: "BlueMarble_ShadedRelief_Bathymetry", tileFormat: "jpg", tileMatrix: `${T}8`, maxzoom: 8, staticTime: true, attribution: "NASA Blue Marble / Earthdata", label: "Blue Marble" } },
  { key: "truecolor", name: "Earth today", tagline: "Live daily satellite (real clouds)", swatches: ["#0a1b2e", "#2e5f4e", "#c2b48a"], opacity: 0.94,
    cfg: { datasetId: "VIIRS_SNPP_CorrectedReflectance_TrueColor", tileFormat: "jpg", tileMatrix: `${T}9`, maxzoom: 9, staticTime: false, attribution: "NASA VIIRS / Earthdata GIBS", label: "Earth today — NASA VIIRS" } },
  { key: "night", name: "Earth at night", tagline: "City lights (Black Marble)", swatches: ["#02030a", "#1a1f3a", "#ffd9a0"], opacity: 1,
    cfg: { datasetId: "VIIRS_Black_Marble", tileFormat: "png", tileMatrix: `${T}8`, maxzoom: 8, staticTime: true, attribution: "NASA Black Marble / Earthdata", label: "Night lights — Black Marble" } },
  { key: "vegetation", name: "Living Earth", tagline: "Vegetation index (NDVI)", swatches: ["#08140c", "#1e5a30", "#8fd06a"], opacity: 0.9,
    cfg: { datasetId: "MODIS_Terra_NDVI_8Day", tileFormat: "png", tileMatrix: `${T}9`, maxzoom: 9, staticTime: false, attribution: "NASA MODIS NDVI / Earthdata GIBS", label: "Vegetation — NDVI" } },
  { key: "ocean", name: "Ocean heat", tagline: "Sea-surface temperature", swatches: ["#040a18", "#0c3a6e", "#ff5a44"], opacity: 0.85,
    cfg: { datasetId: "GHRSST_L4_MUR_Sea_Surface_Temperature", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: false, attribution: "NASA GHRSST MUR / Earthdata GIBS", label: "Sea temperature — MUR" } },
  { key: "snow", name: "Snow & ice", tagline: "Live snow cover (NDSI)", swatches: ["#0a1420", "#3c5a78", "#e8f2ff"], opacity: 0.85,
    cfg: { datasetId: "MODIS_Terra_NDSI_Snow_Cover", tileFormat: "png", tileMatrix: `${T}8`, maxzoom: 8, staticTime: false, attribution: "NASA MODIS NDSI / Earthdata GIBS", label: "Snow & ice — NDSI" } },
  { key: "fires", name: "Active fires", tagline: "Thermal hotspots, near-real-time", swatches: ["#140a06", "#7a2410", "#ff7a30"], opacity: 0.95,
    cfg: { datasetId: "MODIS_Terra_Thermal_Anomalies_All", tileFormat: "png", tileMatrix: `${T}7`, maxzoom: 7, staticTime: false, attribution: "NASA MODIS Thermal / Earthdata GIBS", label: "Active fires — MODIS" } },
  { key: "aerosol", name: "Air quality", tagline: "Aerosol / pollution", swatches: ["#12100c", "#5a4a2a", "#d8b46a"], opacity: 0.85,
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
