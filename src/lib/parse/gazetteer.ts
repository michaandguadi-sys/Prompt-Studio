/**
 * Gazetteer — the geographic vocabulary the intent engine resolves against:
 * continents → member countries, plus curated sets of countries, cities,
 * regions and natural features. Names are display-cased; lookups lowercase.
 * Unknown places still flow through (the geocoder resolves them) — this table
 * powers recognition, continent expansion and the spell-fix vocabulary.
 */

export const CONTINENTS: Record<string, string[]> = {
  "south america": ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"],
  "north america": ["United States", "Canada", "Mexico", "Guatemala", "Belize", "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama", "Cuba", "Jamaica", "Haiti", "Dominican Republic"],
  "europe": ["France", "Germany", "Spain", "Italy", "Portugal", "United Kingdom", "Ireland", "Netherlands", "Belgium", "Switzerland", "Austria", "Poland", "Czechia", "Hungary", "Greece", "Sweden", "Norway", "Finland", "Denmark", "Romania", "Bulgaria", "Croatia", "Serbia", "Ukraine", "Iceland"],
  "africa": ["Egypt", "Morocco", "Algeria", "Tunisia", "Libya", "Nigeria", "Ghana", "Kenya", "Ethiopia", "Tanzania", "Uganda", "South Africa", "Namibia", "Botswana", "Zimbabwe", "Mozambique", "Angola", "Senegal", "Ivory Coast", "Cameroon", "Sudan"],
  "asia": ["China", "Japan", "India", "South Korea", "North Korea", "Thailand", "Vietnam", "Indonesia", "Malaysia", "Philippines", "Pakistan", "Bangladesh", "Nepal", "Sri Lanka", "Saudi Arabia", "Iran", "Iraq", "Turkey", "Israel", "Jordan", "Kazakhstan", "Mongolia"],
  "oceania": ["Australia", "New Zealand", "Fiji", "Papua New Guinea", "Samoa"],
};
// Aliases that map onto a continent key.
export const CONTINENT_ALIASES: Record<string, string> = {
  "latin america": "south america",
  "south-america": "south america",
  "north-america": "north america",
};

export const COUNTRIES: string[] = Array.from(new Set(Object.values(CONTINENTS).flat()));

/** Reverse lookup: a country/known place → its continent (display-cased), for
 *  building "World → Continent → Country" establishing beats. */
const _country2cont: Record<string, string> = {};
for (const [cont, list] of Object.entries(CONTINENTS)) {
  const disp = cont.replace(/\b\w/g, (c) => c.toUpperCase());
  for (const c of list) _country2cont[c.toLowerCase()] = disp;
}
/** Cities → their country's continent (curated for common cities). */
const _cityCont: Record<string, string> = {
  berlin: "Europe", munich: "Europe", hamburg: "Europe", paris: "Europe", lyon: "Europe", marseille: "Europe", london: "Europe", manchester: "Europe", madrid: "Europe", barcelona: "Europe", rome: "Europe", milan: "Europe", venice: "Europe", lisbon: "Europe", amsterdam: "Europe", brussels: "Europe", vienna: "Europe", zurich: "Europe", prague: "Europe", warsaw: "Europe", athens: "Europe", istanbul: "Asia", moscow: "Europe", kyiv: "Europe", stockholm: "Europe", oslo: "Europe", copenhagen: "Europe", helsinki: "Europe", dublin: "Europe",
  "new york": "North America", "los angeles": "North America", "san francisco": "North America", chicago: "North America", miami: "North America", toronto: "North America", "mexico city": "North America",
  tokyo: "Asia", osaka: "Asia", kyoto: "Asia", seoul: "Asia", beijing: "Asia", shanghai: "Asia", "hong kong": "Asia", bangkok: "Asia", singapore: "Asia", mumbai: "Asia", delhi: "Asia", dubai: "Asia",
  cairo: "Africa", "cape town": "Africa", nairobi: "Africa", sydney: "Oceania", melbourne: "Oceania", "rio de janeiro": "South America", "buenos aires": "South America", lima: "South America",
};
export function continentOf(place: string): string | null {
  const k = place.toLowerCase();
  return _country2cont[k] ?? _cityCont[k] ?? null;
}

export const CITIES: string[] = [
  "Berlin", "Munich", "Hamburg", "Paris", "Lyon", "Marseille", "London", "Manchester", "Madrid", "Barcelona",
  "Rome", "Milan", "Venice", "Lisbon", "Porto", "Amsterdam", "Brussels", "Vienna", "Zurich", "Prague", "Warsaw",
  "Athens", "Istanbul", "Moscow", "Kyiv", "Stockholm", "Oslo", "Copenhagen", "Helsinki", "Dublin",
  "New York", "Los Angeles", "San Francisco", "Chicago", "Miami", "Toronto", "Mexico City",
  "Tokyo", "Osaka", "Kyoto", "Seoul", "Beijing", "Shanghai", "Hong Kong", "Bangkok", "Singapore",
  "Mumbai", "Delhi", "Dubai", "Cairo", "Cape Town", "Nairobi", "Sydney", "Melbourne", "Rio de Janeiro", "Buenos Aires", "Lima",
];

export const REGIONS: string[] = [
  "Bavaria", "Patagonia", "Andalusia", "Tuscany", "Catalonia", "Scotland", "Wales", "Provence", "Normandy",
  "Tibet", "Siberia", "Kashmir", "Sicily", "Crimea", "Galicia", "Lapland", "Transylvania",
];

export const FEATURES: string[] = [
  "Alps", "Amazon", "Sahara", "Himalayas", "Andes", "Nile", "Rockies", "Pyrenees", "Alps", "Gobi",
  "Mont Blanc", "Mount Everest", "Kilimanjaro", "Grand Canyon", "Great Barrier Reef", "Atlas Mountains", "Danube", "Rhine", "Mississippi",
];

/** Every known place, lowercased, for fast recognition. */
export const PLACE_SET = new Set(
  [...COUNTRIES, ...CITIES, ...REGIONS, ...FEATURES, ...Object.keys(CONTINENTS)].map((p) => p.toLowerCase()),
);
/** Display-case lookup for a known place (lowercased key → canonical name). */
export const PLACE_DISPLAY: Record<string, string> = {};
for (const p of [...COUNTRIES, ...CITIES, ...REGIONS, ...FEATURES]) PLACE_DISPLAY[p.toLowerCase()] = p;

/** Words the spell-fixer treats as valid (so it never "corrects" them). Built
 *  from place names (incl. their component words) + the action/style lexicon. */
/** Every component word of a known place, lowercased ("new york" → new, york) —
 *  lets the spell-fixer tell a real place typo from a proper noun it shouldn't
 *  snap to a common lexicon word ("Porto" must never become "north"). */
export const PLACE_WORDS = new Set<string>();
for (const p of [...COUNTRIES, ...CITIES, ...REGIONS, ...FEATURES, ...Object.keys(CONTINENTS)]) {
  for (const w of p.toLowerCase().split(/\s+/)) PLACE_WORDS.add(w);
}
export const VOCAB = new Set<string>(PLACE_WORDS);
for (const w of [
  // actions / camera / map verbs + nouns
  "highlight", "mark", "focus", "emphasize", "show", "color", "colour", "fill", "outline", "reveal", "display",
  "zoom", "fly", "move", "go", "travel", "navigate", "pan", "dive", "orbit", "rotate", "tilt", "push", "pull",
  "route", "journey", "trip", "flight", "path", "from", "to", "into", "through", "across", "via", "between",
  "country", "countries", "city", "cities", "region", "regions", "continent", "border", "map", "all", "every",
  // styles / moods
  "cinematic", "epic", "documentary", "vintage", "modern", "news", "luxury", "dynamic", "social", "adventure", "explorer",
  "smooth", "dramatic", "elegant", "minimal", "realistic", "historical", "premium", "fast", "slow", "energetic",
  // common filler
  "create", "make", "animation", "animate", "video", "scene", "story", "and", "the", "a", "an", "of", "in", "my",
]) VOCAB.add(w);
