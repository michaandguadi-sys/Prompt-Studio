/**
 * MapLibre GL configuration — the open-source map engine (no Mapbox token).
 *
 * MapLibre styles are open JSON you can fully restyle, which is the whole point:
 * far more customizable than Mapbox's locked styles. Existing projects store
 * legacy `mapbox://styles/...` URLs, so `resolveMapStyle()` translates those to
 * MapLibre equivalents at render time — no data migration, old docs just work.
 *
 * All sources below are free and key-less (CARTO basemaps, OpenFreeMap, ESRI
 * imagery, AWS terrain tiles). The Mapbox token is no longer needed to draw the
 * map (geocoding/directions APIs are a separate concern handled elsewhere).
 */

/** Free, no-key MapLibre styles mapped onto our tone choices. */
export const ML_STYLES = {
  /** Cinematic dark base (CARTO dark-matter) — our default look. */
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  streets: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  outdoors: "https://tiles.openfreemap.org/styles/liberty",
} as const;

export const DEFAULT_ML_STYLE = ML_STYLES.dark;

/** Base-style picker options (mirrors the old MAP_BASE_STYLES shape). */
export const ML_BASE_STYLES: { id: string; label: string; url: string; tone: "dark" | "light" | "satellite" | "outdoors" }[] = [
  { id: "custom", label: "Custom Dark", url: ML_STYLES.dark, tone: "dark" },
  { id: "dark", label: "Dark", url: ML_STYLES.dark, tone: "dark" },
  { id: "light", label: "Light", url: ML_STYLES.light, tone: "light" },
  { id: "streets", label: "Streets", url: ML_STYLES.streets, tone: "light" },
  { id: "satellite", label: "Satellite", url: "satellite", tone: "satellite" },
  { id: "outdoors", label: "Outdoors", url: ML_STYLES.outdoors, tone: "outdoors" },
];

/**
 * Inline raster style for satellite (ESRI World Imagery — free, no key).
 *
 * Tiles are routed through our own `/api/sat/{z}/{x}/{y}` proxy so the headless
 * Remotion render agent always gets proper CORS headers and benefits from Next.js's
 * `force-cache` deduplication. Direct ArcGIS fetches from a headless Chrome can
 * be throttled/blocked in bulk; the proxy is stable and fast.
 *
 * `origin` param: pass `window.location.origin` in the browser, or the server's
 * base URL (e.g. `process.env.NEXT_PUBLIC_APP_URL`) in the render agent.
 * Defaults to relative path (works in any same-origin context).
 */
export function satelliteStyle(origin = ""): Record<string, unknown> {
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      esri: {
        type: "raster",
        // Proxy through our own server — avoids throttle / CORS / user-agent blocks
        // from ArcGIS when a headless Chrome fires 50+ parallel tile requests.
        tiles: [`${origin}/api/sat/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 19,
        // Allow MapLibre to request tiles up to 2 zoom levels beyond what the
        // camera shows — eliminates blurry scaled-up parent tiles at high zoom.
        maxOverzooming: 2,
        maxUnderzooming: 0,
        attribution: "© Esri, Maxar, Earthstar Geographics",
      },
    },
    // raster-fade-duration:0 → tiles don't cross-fade as the camera moves, which
    // is what made overlays (highlights) shimmer over the satellite basemap.
    layers: [{ id: "esri", type: "raster", source: "esri", paint: { "raster-fade-duration": 0 } }],
  };
}

/**
 * Translate any style id / legacy `mapbox://styles/...` URL into a MapLibre
 * style URL or inline spec. Unknown → the dark default.
 */
export function resolveMapStyle(styleUrl?: string, origin = ""): string | Record<string, unknown> {
  const u = (styleUrl || "").toLowerCase();
  if (!u || u === "custom") return DEFAULT_ML_STYLE;
  // Already a MapLibre/OHM style JSON URL — pass through untouched.
  if (u.startsWith("http")) return styleUrl as string;
  if (u === "satellite" || u.includes("satellite")) return satelliteStyle(origin);
  // "grid" → the dark VECTOR base (so we keep real coastlines/boundaries); the
  // blueprint recolour + graticule overlay are added at render time.
  if (u === "grid") return ML_STYLES.dark;
  if (u.includes("light") || u.includes("positron")) return ML_STYLES.light;
  if (u.includes("outdoor") || u.includes("liberty")) return ML_STYLES.outdoors;
  if (u.includes("street") || u.includes("navigation") || u.includes("voyager")) return ML_STYLES.streets;
  // dark-v11, custom dark, or any other mapbox:// → cinematic dark
  return ML_STYLES.dark;
}

/** Whether a style id / URL is one of our dark cinematic looks (gets the noir
 *  deepening pass by default). Light/satellite/outdoors styles are left alone. */
export function isDarkStyle(styleUrl?: string): boolean {
  const u = (styleUrl || "").toLowerCase();
  if (!u || u === "custom") return true; // default IS dark
  if (/light|positron|satellite|outdoor|liberty|voyager|street/.test(u)) return false;
  if (/dark|noir|matter|night|grid/.test(u)) return true;
  if (u.startsWith("mapbox://")) return /dark|navigation-night/.test(u);
  return false;
}

/** The blueprint "Grid" basemap — a dark vector base recoloured to navy + a
 *  glowing lat/long graticule overlay (added at render time). */
export function isGridStyle(styleUrl?: string): boolean {
  return (styleUrl || "").toLowerCase() === "grid";
}
export const GRID = { land: "#0b1c38", water: "#050e1f", line: "rgba(96,170,255,0.22)", boundary: "rgba(96,170,255,0.45)" } as const;

/** A lat/long graticule as a GeoJSON FeatureCollection of LineStrings (meridians
 *  + parallels every `step` degrees, densified so lines curve with the globe). */
export function graticule(step = 10): { type: "FeatureCollection"; features: unknown[] } {
  const features: unknown[] = [];
  for (let lon = -180; lon <= 180; lon += step) {
    const coords: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const coords: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

/** Signature "noir" deepening — applied to the dark basemap by default so every
 *  map reads premium/cinematic out of the box (user land/water colours override). */
export const NOIR = { land: "#090d16", water: "#0c1828", boundary: "#3a4a66" } as const;

/** Free, no-key terrain DEM (AWS Terrain Tiles, Terrarium-encoded). */
export const ML_TERRAIN_SOURCE_ID = "ml-terrain-dem";

/**
 * Raster-DEM source for 3-D mesh terrain. MUST go through our own `/api/dem`
 * proxy: the upstream AWS terrarium tiles send no CORS header, so MapLibre can't
 * read them into a terrain texture directly (the texture taints and terrain
 * silently fails). The proxy re-serves them with `Access-Control-Allow-Origin`.
 * Uses an absolute, same-origin URL so it resolves in both the editor and the
 * headless render bundle.
 */
export function demSource() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    type: "raster-dem" as const,
    tiles: [`${origin}/api/dem/{z}/{x}/{y}`],
    encoding: "terrarium" as const,
    tileSize: 256,
    maxzoom: 15,
  };
}
