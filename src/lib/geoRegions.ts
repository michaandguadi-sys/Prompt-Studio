/**
 * Region data for the AI director.
 *
 * Lets prompts like "every country in Europe with their flags" resolve WITHOUT
 * 40+ live geocoder calls: bundled country centroids + ISO codes (for flag
 * badges) and a bbox per region (so the camera frames the region, not the whole
 * globe). Centroids are approximate label points — perfect for dropping a flag.
 */
export type RegionCountry = { name: string; iso: string; lon: number; lat: number };

// Mainland-European countries (transcontinental giants like Russia/Turkey left
// out so the camera frames Europe cleanly). ~44 entries.
const EUROPE: RegionCountry[] = [
  { name: "Albania", iso: "AL", lon: 20.0, lat: 41.0 },
  { name: "Andorra", iso: "AD", lon: 1.5, lat: 42.5 },
  { name: "Austria", iso: "AT", lon: 14.5, lat: 47.6 },
  { name: "Belarus", iso: "BY", lon: 27.9, lat: 53.7 },
  { name: "Belgium", iso: "BE", lon: 4.6, lat: 50.6 },
  { name: "Bosnia and Herzegovina", iso: "BA", lon: 17.8, lat: 44.0 },
  { name: "Bulgaria", iso: "BG", lon: 25.2, lat: 42.8 },
  { name: "Croatia", iso: "HR", lon: 15.8, lat: 45.2 },
  { name: "Cyprus", iso: "CY", lon: 33.2, lat: 35.0 },
  { name: "Czechia", iso: "CZ", lon: 15.5, lat: 49.8 },
  { name: "Denmark", iso: "DK", lon: 9.5, lat: 56.0 },
  { name: "Estonia", iso: "EE", lon: 25.8, lat: 58.7 },
  { name: "Finland", iso: "FI", lon: 26.0, lat: 63.0 },
  { name: "France", iso: "FR", lon: 2.3, lat: 46.6 },
  { name: "Germany", iso: "DE", lon: 10.4, lat: 51.2 },
  { name: "Greece", iso: "GR", lon: 22.0, lat: 39.3 },
  { name: "Hungary", iso: "HU", lon: 19.5, lat: 47.2 },
  { name: "Iceland", iso: "IS", lon: -18.6, lat: 64.9 },
  { name: "Ireland", iso: "IE", lon: -8.2, lat: 53.2 },
  { name: "Italy", iso: "IT", lon: 12.6, lat: 42.8 },
  { name: "Kosovo", iso: "XK", lon: 20.9, lat: 42.6 },
  { name: "Latvia", iso: "LV", lon: 24.9, lat: 56.9 },
  { name: "Liechtenstein", iso: "LI", lon: 9.55, lat: 47.16 },
  { name: "Lithuania", iso: "LT", lon: 23.9, lat: 55.2 },
  { name: "Luxembourg", iso: "LU", lon: 6.1, lat: 49.8 },
  { name: "Malta", iso: "MT", lon: 14.4, lat: 35.9 },
  { name: "Moldova", iso: "MD", lon: 28.5, lat: 47.2 },
  { name: "Monaco", iso: "MC", lon: 7.42, lat: 43.74 },
  { name: "Montenegro", iso: "ME", lon: 19.3, lat: 42.8 },
  { name: "Netherlands", iso: "NL", lon: 5.5, lat: 52.2 },
  { name: "North Macedonia", iso: "MK", lon: 21.7, lat: 41.6 },
  { name: "Norway", iso: "NO", lon: 9.0, lat: 61.0 },
  { name: "Poland", iso: "PL", lon: 19.4, lat: 52.1 },
  { name: "Portugal", iso: "PT", lon: -8.2, lat: 39.6 },
  { name: "Romania", iso: "RO", lon: 25.0, lat: 45.9 },
  { name: "San Marino", iso: "SM", lon: 12.46, lat: 43.94 },
  { name: "Serbia", iso: "RS", lon: 20.9, lat: 44.0 },
  { name: "Slovakia", iso: "SK", lon: 19.5, lat: 48.7 },
  { name: "Slovenia", iso: "SI", lon: 14.8, lat: 46.1 },
  { name: "Spain", iso: "ES", lon: -3.7, lat: 40.2 },
  { name: "Sweden", iso: "SE", lon: 15.5, lat: 62.0 },
  { name: "Switzerland", iso: "CH", lon: 8.2, lat: 46.8 },
  { name: "Ukraine", iso: "UA", lon: 31.0, lat: 49.0 },
  { name: "United Kingdom", iso: "GB", lon: -1.5, lat: 52.8 },
];

const SCANDINAVIA: RegionCountry[] = EUROPE.filter((c) => ["NO", "SE", "DK", "FI", "IS"].includes(c.iso));
const BALTICS: RegionCountry[] = EUROPE.filter((c) => ["EE", "LV", "LT"].includes(c.iso));
const BALKANS: RegionCountry[] = EUROPE.filter((c) => ["AL", "BA", "BG", "HR", "GR", "XK", "ME", "MK", "RO", "RS", "SI"].includes(c.iso));

export type Region = { key: string; label: string; bbox: [number, number, number, number]; countries: RegionCountry[] };

export const REGIONS: Region[] = [
  { key: "europe", label: "Europe", bbox: [-16, 34, 33, 66], countries: EUROPE },
  { key: "scandinavia", label: "Scandinavia", bbox: [4, 54, 32, 71], countries: SCANDINAVIA },
  { key: "baltics", label: "the Baltics", bbox: [20, 53, 29, 60], countries: BALTICS },
  { key: "balkans", label: "the Balkans", bbox: [13, 38, 30, 47], countries: BALKANS },
  // bbox-only (camera framing) — enumeration not bundled, but framing still works
  { key: "africa", label: "Africa", bbox: [-18, -35, 52, 38], countries: [] },
  { key: "asia", label: "Asia", bbox: [40, 5, 150, 60], countries: [] },
  { key: "south-america", label: "South America", bbox: [-82, -56, -34, 13], countries: [] },
  { key: "north-america", label: "North America", bbox: [-168, 7, -52, 72], countries: [] },
  { key: "middle-east", label: "the Middle East", bbox: [25, 12, 63, 42], countries: [] },
  { key: "oceania", label: "Oceania", bbox: [110, -48, 180, 0], countries: [] },
  { key: "world", label: "the World", bbox: [-170, -55, 180, 72], countries: [] },
];

const ALIASES: Record<string, string> = {
  europe: "europe", european: "europe", eu: "europe", "the eu": "europe",
  scandinavia: "scandinavia", scandinavian: "scandinavia", nordic: "scandinavia", nordics: "scandinavia",
  baltic: "baltics", baltics: "baltics",
  balkan: "balkans", balkans: "balkans",
  africa: "africa", african: "africa",
  asia: "asia", asian: "asia",
  "south america": "south-america", "latin america": "south-america",
  "north america": "north-america",
  "middle east": "middle-east", "the middle east": "middle-east",
  oceania: "oceania", pacific: "oceania",
  world: "world", global: "world", earth: "world", worldwide: "world",
};

/** Match a free-text region name ("Europe", "the Balkans", "African") to a Region. */
export function resolveRegion(name: string): Region | null {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  const key = ALIASES[n] ?? REGIONS.find((r) => r.key === n || r.label.toLowerCase() === n)?.key;
  return key ? REGIONS.find((r) => r.key === key) ?? null : null;
}

/** Find a region mentioned anywhere in a free-text idea (longest alias wins). */
export function detectRegion(idea: string): Region | null {
  const t = (idea || "").toLowerCase();
  const hits = Object.keys(ALIASES)
    .filter((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))
    .sort((a, b) => b.length - a.length);
  return hits.length ? resolveRegion(hits[0]) : null;
}

/** Centre + zoom that frames a bbox in a 16:9-ish viewport. */
export function cameraForBbox(bbox: [number, number, number, number]): { lon: number; lat: number; zoom: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = (minLon + maxLon) / 2, lat = (minLat + maxLat) / 2;
  const lonSpan = Math.max(0.5, maxLon - minLon), latSpan = Math.max(0.5, maxLat - minLat);
  // Width fits a wide frame (+0.6); height is the usual constraint (+0.9). Clamp.
  const zoom = Math.min(Math.log2(360 / lonSpan) + 0.6, Math.log2(180 / latSpan) + 0.9);
  return { lon, lat, zoom: Math.max(1.4, Math.min(7, zoom)) };
}
