/**
 * Instant offline coordinates for every place the intent gazetteer can
 * recognise — so the Generate page's living map reacts to typing with ZERO
 * network latency. `z` is the camera zoom that frames that place nicely.
 * Unknown places fall back to the /api/geocode proxy (cached, debounced).
 */

export type GeoStop = { lon: number; lat: number; z: number; label: string };

type Entry = [lon: number, lat: number, z: number];

const C: Record<string, Entry> = {
  // ── continents / establishing regions ──
  "europe": [10, 50, 2.6], "asia": [90, 34, 2.2], "africa": [20, 3, 2.2],
  "north america": [-100, 45, 2.2], "south america": [-60, -15, 2.4], "oceania": [140, -25, 2.4],

  // ── countries ──
  "argentina": [-65.0, -35.0, 3.4], "bolivia": [-64.7, -16.5, 4.6], "brazil": [-51.9, -10.8, 3.2],
  "chile": [-71.0, -35.7, 3.4], "colombia": [-74.3, 4.6, 4.6], "ecuador": [-78.5, -1.5, 5.2],
  "guyana": [-58.9, 4.9, 5.6], "paraguay": [-58.4, -23.4, 5.0], "peru": [-75.0, -9.2, 4.4],
  "suriname": [-56.0, 4.0, 5.8], "uruguay": [-55.8, -32.5, 5.4], "venezuela": [-66.6, 7.0, 4.6],
  "united states": [-98.5, 39.8, 3.2], "canada": [-106.3, 56.1, 2.8], "mexico": [-102.5, 23.6, 4.0],
  "guatemala": [-90.2, 15.8, 5.8], "belize": [-88.5, 17.2, 6.4], "honduras": [-86.6, 14.8, 5.8],
  "el salvador": [-88.9, 13.8, 6.6], "nicaragua": [-85.2, 12.9, 5.8], "costa rica": [-84.1, 9.7, 6.2],
  "panama": [-80.1, 8.5, 6.0], "cuba": [-79.5, 21.5, 5.4], "jamaica": [-77.3, 18.1, 7.0],
  "haiti": [-72.7, 18.9, 6.6], "dominican republic": [-70.2, 18.7, 6.6],
  "france": [2.2, 46.6, 4.6], "germany": [10.4, 51.1, 4.8], "spain": [-3.7, 40.4, 4.6],
  "italy": [12.6, 42.5, 4.6], "portugal": [-8.2, 39.4, 5.4], "united kingdom": [-2.0, 54.0, 4.6],
  "ireland": [-8.0, 53.4, 5.6], "netherlands": [5.3, 52.1, 6.0], "belgium": [4.5, 50.5, 6.4],
  "switzerland": [8.2, 46.8, 6.2], "austria": [14.6, 47.5, 5.8], "poland": [19.1, 52.0, 5.0],
  "czechia": [15.5, 49.8, 6.0], "hungary": [19.5, 47.2, 6.0], "greece": [22.9, 39.1, 5.2],
  "sweden": [16.3, 62.0, 3.8], "norway": [9.0, 61.5, 4.0], "finland": [26.0, 64.0, 4.0],
  "denmark": [9.5, 56.0, 5.8], "romania": [24.9, 45.9, 5.4], "bulgaria": [25.5, 42.7, 5.8],
  "croatia": [15.2, 45.1, 5.8], "serbia": [20.9, 44.0, 5.8], "ukraine": [31.2, 48.4, 4.4],
  "iceland": [-19.0, 65.0, 5.0],
  "egypt": [30.8, 26.8, 4.8], "morocco": [-7.1, 31.8, 4.8], "algeria": [1.7, 28.0, 4.0],
  "tunisia": [9.5, 33.9, 5.6], "libya": [17.2, 26.3, 4.4], "nigeria": [8.7, 9.1, 4.8],
  "ghana": [-1.0, 7.9, 5.6], "kenya": [37.9, 0.0, 5.0], "ethiopia": [40.5, 9.1, 4.6],
  "tanzania": [34.9, -6.4, 4.8], "uganda": [32.3, 1.4, 5.6], "south africa": [22.9, -30.6, 4.2],
  "namibia": [18.5, -22.9, 4.6], "botswana": [24.7, -22.3, 5.0], "zimbabwe": [29.2, -19.0, 5.2],
  "mozambique": [35.5, -18.7, 4.4], "angola": [17.9, -11.2, 4.6], "senegal": [-14.5, 14.5, 5.6],
  "ivory coast": [-5.5, 7.5, 5.4], "cameroon": [12.4, 7.4, 5.0], "sudan": [30.2, 15.5, 4.2],
  "china": [104.2, 35.9, 3.0], "japan": [138.3, 36.2, 4.2], "india": [78.9, 20.6, 3.6],
  "south korea": [127.8, 36.5, 5.6], "north korea": [127.5, 40.3, 5.6], "thailand": [101.0, 15.9, 4.8],
  "vietnam": [106.3, 16.0, 4.6], "indonesia": [113.9, -0.8, 3.4], "malaysia": [102.0, 4.2, 4.8],
  "philippines": [121.8, 12.9, 4.4], "pakistan": [69.3, 30.4, 4.4], "bangladesh": [90.4, 23.7, 5.6],
  "nepal": [84.1, 28.4, 5.8], "sri lanka": [80.8, 7.9, 6.4], "saudi arabia": [45.1, 23.9, 4.0],
  "iran": [53.7, 32.4, 4.2], "iraq": [43.7, 33.2, 5.0], "turkey": [35.2, 39.0, 4.6],
  "israel": [34.9, 31.0, 6.4], "jordan": [36.2, 30.6, 6.0], "kazakhstan": [66.9, 48.0, 3.4],
  "mongolia": [103.8, 46.9, 3.8],
  "australia": [133.8, -25.3, 3.0], "new zealand": [172.5, -42.0, 4.4], "fiji": [178.1, -17.7, 6.0],
  "papua new guinea": [144.0, -6.3, 4.6], "samoa": [-172.1, -13.8, 7.0],
  "cook islands": [-159.78, -21.23, 5.6], "greenland": [-42.6, 71.7, 3.0],

  // ── cities ──
  "berlin": [13.40, 52.52, 8], "munich": [11.58, 48.14, 8], "hamburg": [9.99, 53.55, 8],
  "paris": [2.35, 48.86, 8], "lyon": [4.84, 45.76, 8], "marseille": [5.37, 43.30, 8],
  "london": [-0.13, 51.51, 8], "manchester": [-2.24, 53.48, 8], "madrid": [-3.70, 40.42, 8],
  "barcelona": [2.17, 41.39, 8], "rome": [12.50, 41.90, 8], "milan": [9.19, 45.46, 8],
  "venice": [12.34, 45.44, 9], "lisbon": [-9.14, 38.72, 8], "amsterdam": [4.90, 52.37, 8],
  "brussels": [4.35, 50.85, 8], "vienna": [16.37, 48.21, 8], "zurich": [8.54, 47.37, 8],
  "prague": [14.44, 50.08, 8], "warsaw": [21.01, 52.23, 8], "athens": [23.73, 37.98, 8],
  "istanbul": [28.98, 41.01, 8], "moscow": [37.62, 55.75, 7.5], "kyiv": [30.52, 50.45, 8],
  "stockholm": [18.07, 59.33, 8], "oslo": [10.75, 59.91, 8], "copenhagen": [12.57, 55.68, 8],
  "helsinki": [24.94, 60.17, 8], "dublin": [-6.26, 53.35, 8],
  "new york": [-74.01, 40.71, 8], "los angeles": [-118.24, 34.05, 8], "san francisco": [-122.42, 37.77, 8],
  "chicago": [-87.63, 41.88, 8], "miami": [-80.19, 25.76, 8], "toronto": [-79.38, 43.65, 8],
  "mexico city": [-99.13, 19.43, 8],
  "tokyo": [139.69, 35.69, 8], "osaka": [135.50, 34.69, 8], "kyoto": [135.77, 35.01, 9],
  "seoul": [126.98, 37.57, 8], "beijing": [116.41, 39.90, 8], "shanghai": [121.47, 31.23, 8],
  "hong kong": [114.17, 22.32, 8.5], "bangkok": [100.50, 13.76, 8], "singapore": [103.85, 1.29, 9],
  "mumbai": [72.88, 19.08, 8], "delhi": [77.10, 28.70, 8], "dubai": [55.27, 25.20, 8.5],
  "cairo": [31.24, 30.04, 8], "cape town": [18.42, -33.93, 8], "nairobi": [36.82, -1.29, 8],
  "sydney": [151.21, -33.87, 8], "melbourne": [144.96, -37.81, 8],
  "rio de janeiro": [-43.17, -22.91, 8], "buenos aires": [-58.38, -34.60, 8], "lima": [-77.04, -12.05, 8],

  // ── regions ──
  "bavaria": [11.5, 48.8, 6.4], "patagonia": [-70.0, -45.0, 4.4], "andalusia": [-4.6, 37.5, 6.2],
  "tuscany": [11.3, 43.4, 7.0], "catalonia": [1.9, 41.8, 6.8], "scotland": [-4.2, 56.8, 5.6],
  "wales": [-3.8, 52.3, 6.6], "provence": [5.8, 43.8, 7.0], "normandy": [-0.7, 49.1, 6.8],
  "tibet": [88.0, 31.5, 4.6], "siberia": [100.0, 62.0, 2.8], "kashmir": [75.3, 34.0, 6.0],
  "sicily": [14.1, 37.5, 6.8], "crimea": [34.1, 45.3, 6.4], "galicia": [-8.0, 42.8, 6.6],
  "lapland": [25.0, 67.9, 4.6], "transylvania": [24.5, 46.5, 6.4],

  // ── natural features ──
  "alps": [10.0, 46.5, 5.6], "amazon": [-62.0, -3.5, 4.2], "sahara": [10.0, 23.0, 3.6],
  "himalayas": [84.0, 28.5, 4.8], "andes": [-70.0, -20.0, 3.8], "nile": [31.0, 23.0, 4.6],
  "rockies": [-110.0, 45.0, 4.6], "pyrenees": [0.5, 42.6, 6.4], "gobi": [105.0, 43.0, 4.4],
  "mont blanc": [6.86, 45.83, 8.5], "mount everest": [86.93, 27.99, 8],
  "kilimanjaro": [37.36, -3.07, 8], "grand canyon": [-112.11, 36.11, 8],
  "great barrier reef": [147.7, -18.3, 5.6], "atlas mountains": [-6.0, 31.5, 5.6],
  "danube": [19.0, 45.5, 5.0], "rhine": [7.6, 50.0, 6.0], "mississippi": [-90.1, 32.3, 5.0],

  // ── extra hubs the inspiration rail uses ──
  "reykjavik": [-21.94, 64.15, 8], "kathmandu": [85.32, 27.72, 8.5], "marrakech": [-7.98, 31.63, 8.5],
  "guatemala city": [-90.51, 14.63, 8.5], "honolulu": [-157.86, 21.31, 8], "anchorage": [-149.90, 61.22, 7],
  "santiago": [-70.65, -33.45, 8], "auckland": [174.76, -36.85, 8],
};

/** Resolve a display name from the intent engine to coords (case-insensitive). */
export function coordsFor(name: string): GeoStop | null {
  const e = C[name.trim().toLowerCase()];
  return e ? { lon: e[0], lat: e[1], z: e[2], label: name } : null;
}

/* ── Geocode fallback for places outside the table ──────────────────────────
 * STRICTLY VERIFIED: a pin only appears when we're confident the word is a
 * real place. Style words like "playful" must never land on some village
 * that happens to share letters. Three gates:
 *   1. never geocode known style/mood/filler vocabulary
 *   2. only geocode PROPER NOUNS — the word must appear Capitalized in the
 *      user's own prompt (or be multi-word like "san pedro de atacama")
 *   3. only accept geocoder hits whose type IS a place (country/city/peak/…)
 *      and whose name actually matches what the user typed
 */

/** Words the parser sometimes floats as "locations" that are NEVER places. */
const NOT_PLACES = new Set([
  "playful", "colorful", "colourful", "energetic", "cinematic", "epic", "dramatic",
  "moody", "minimal", "vintage", "luxury", "documentary", "adventure", "modern",
  "smooth", "elegant", "golden", "dark", "bright", "serene", "calm", "dawn", "dusk",
  "night", "sunset", "sunrise", "style", "mood", "story", "journey", "trip", "route",
  "animation", "video", "film", "camera", "aerial", "satellite", "terrain", "map",
  "beautiful", "amazing", "stunning", "atlas", "vibrant", "nostalgic", "dreamy",
]);

/** Nominatim addresstypes that are genuinely geographic. Anything else
 *  (shop, amenity, building, road…) is rejected — not a story place. */
const PLACE_TYPES = new Set([
  "country", "state", "region", "province", "county", "city", "town", "village",
  "hamlet", "municipality", "suburb", "island", "archipelago", "peak", "volcano",
  "mountain_range", "ridge", "glacier", "river", "lake", "sea", "ocean", "bay",
  "strait", "desert", "continent", "administrative", "boundary", "place",
  "national_park", "protected_area", "natural", "water", "peninsula", "gorge", "valley",
]);

/** Gate 1+2: is this name even worth asking the geocoder about? */
export function isLikelyPlaceName(name: string, rawPrompt: string): boolean {
  const n = name.trim();
  if (n.length < 3) return false;
  if (NOT_PLACES.has(n.toLowerCase())) return false;
  // Proper-noun check: the user must have typed it Capitalized somewhere
  // (multi-word names pass if ANY word is capitalized mid-sentence).
  const words = n.split(/\s+/);
  const cap = (w: string) => new RegExp(`(^|[^\\p{L}])${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`, "u").test(rawPrompt);
  return words.some((w) => w.length >= 3 && cap(w));
}

const geoCache = new Map<string, GeoStop | null>();
const pending = new Set<string>();

/** Async lookup with an in-memory cache; resolves null when not found or not
 *  verifiably a place. At most one in-flight request per name. */
export async function geocodeStop(name: string): Promise<GeoStop | null> {
  const key = name.trim().toLowerCase();
  if (!key || key.length < 3 || NOT_PLACES.has(key)) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;
  if (pending.has(key)) return null;
  pending.add(key);
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(name)}`);
    const d = await r.json();
    // Gate 3: the hit must BE a place and be NAMED like what the user typed.
    const hit = (d?.results ?? []).find((h: any) => {
      if (!Number.isFinite(h?.lon) || !Number.isFinite(h?.lat)) return false;
      if (!PLACE_TYPES.has(String(h.placeType || "").toLowerCase())) return false;
      const short = String(h.shortName || "").toLowerCase();
      return short.includes(key) || key.includes(short);
    });
    const stop = hit
      ? { lon: hit.lon, lat: hit.lat, z: Math.min(9, hit.zoom ?? 8), label: name }
      : null;
    geoCache.set(key, stop);
    return stop;
  } catch {
    return null; // transient — retry allowed next time (not cached)
  } finally {
    pending.delete(key);
  }
}

export function cachedStop(name: string): GeoStop | null | undefined {
  return geoCache.get(name.trim().toLowerCase());
}
