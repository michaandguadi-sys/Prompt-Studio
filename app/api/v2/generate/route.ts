/**
 * POST /api/v2/generate  → { project: Project, plan?, usedLLM }
 *
 * The comprehension engine. Claude (Anthropic API) reads the idea and DESIGNS a
 * complete map animation — a layer plan referencing places by name (camera
 * focus, highlights with fills/flags, routes, labels, titles, charts, timing).
 * We then resolve all geography server-side (geocode → coords, Nominatim →
 * polygons, great-circle → routes), assemble a valid v2 Project, and validate
 * it with Zod. Degrades to a richer heuristic when no API key is present.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rateLimit";
import { createDefaultProject, createLayer, defaultCamera, id as newId } from "@/v2/doc/factory";
import { Project as ProjectSchema, type Project, type Layer, type Theme } from "@/v2/doc/schema";
import { HIGHLIGHT_PRESETS } from "@/lib/presets/highlightPresets";
import { THEME_PRESETS, recolorLayer } from "@/v2/doc/themes";
import { cleanCountryGeo } from "@/lib/geoClean";
import { flightArc } from "@/lib/geoArc";
import { centroidOf } from "@/lib/geo";
import { sharedBorderLine, sampleAlong, bboxOfGeos } from "@/lib/geoBorders";
import { resolveRegion, detectRegion, cameraForBbox } from "@/lib/geoRegions";
import { signatureStyleById } from "@/lib/presets/signatureStyles";
import { map3dStyleById } from "@/lib/presets/map3dStyles";
import { detectProStyle } from "@/lib/presets/proMapStyles";
import { aiComplete, resolveAIConfig, configFromUser, type AIConfig } from "@/lib/ai/providers";
import { _registerPlanBuilder } from "@/lib/planBuilder";
import { DIRECTOR_PRINCIPLES, SOURCE_AND_VERIFY, COHESION_LAW, ARCHETYPES, matchArchetype } from "@/lib/ai/directorDoctrine";
import { interpret, planStory, buildFramework, frameworkInstruction, type ArcContext } from "@/lib/parse";
import { normalizeAddon } from "@/lib/addons";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const DEFAULT_ACCENT = "#6E7BFF";

const MOOD_PRESET: Record<string, string> = {
  conflict: "conflict", war: "conflict", historical: "historical", history: "historical",
  empire: "empire", trade: "trade", economy: "trade", neutral: "neutral",
};

/** Mood → a cohesive palette+font preset (by THEME_PRESETS name). */
const MOOD_THEME: Record<string, string> = {
  conflict: "Conflict Red", war: "Conflict Red",
  historical: "Vox Editorial", history: "Vox Editorial", empire: "Vox Editorial",
  trade: "Trade Green", economy: "Trade Green",
  political: "Political Violet", election: "Political Violet",
  arctic: "Arctic Cold", cold: "Arctic Cold", climate: "Arctic Cold",
  neutral: "Default",
};

/** Resolve the project theme: an explicit palette name wins, else the mood. */
function resolveTheme(palette?: string, mood?: string): Theme {
  const byName = (n?: string) => (n ? THEME_PRESETS.find((t) => t.name.toLowerCase() === n.toLowerCase()) : undefined);
  return byName(palette) ?? byName(MOOD_THEME[(mood || "neutral").toLowerCase()]) ?? THEME_PRESETS[0];
}

/**
 * Remove redundant on-screen TEXT so the same words never appear two or three
 * times (a title + a label + a highlight all spelling out the same place). The
 * most prominent element wins: a Title claims its text; any Label or highlight
 * centroid-label that merely repeats it is dropped / suppressed.
 */
function dedupeText(layers: Layer[]): Layer[] {
  const norm = (s?: string) => (s || "").trim().toUpperCase();
  const shown = new Set<string>();
  // Titles are the headline — they claim their text first.
  for (const l of layers) if (l.type === "title" && (l as any).text) shown.add(norm((l as any).text));
  const out: Layer[] = [];
  for (const l of layers) {
    if (l.type === "label") {
      const k = norm((l as any).text);
      if (k && shown.has(k)) continue;          // drop a label that just repeats a title/earlier label
      if (k) shown.add(k);
    } else if (l.type === "highlight") {
      const k = norm((l as any).place);
      if (k && shown.has(k)) { (l as any).place = ""; }   // suppress duplicate centroid label
      else if (k) shown.add(k);
    } else if (l.type === "title") {
      const k = norm((l as any).text);
      if (k && [...shown].filter((x) => x === k).length > 1) continue; // guard against twin titles
    }
    out.push(l);
  }
  return out;
}

/* ── The plan Claude returns ─────────────────────────────────────────────── */
// `style` is an optional raw passthrough of ANY valid layer field (dashStyle,
// glow, smoothness, reveal, extrude, labelText, borderDash, transform, …) —
// curated templates use it to art-direct every detail; Zod strips anything bad.
type Styled = { style?: Record<string, unknown> };
// Timing fields the AI can set directly on any layer — builder trusts these over heuristics.
type Timed = { inSec?: number; outSec?: number | null; enter?: string; exit?: string };
type PlanLayer =
  | ({ kind: "highlight"; place: string; fill?: "solid" | "flag" | "hatch" | "crosshatch" | "stripes" | "dots"; mood?: string; label?: string } & Styled & Timed)
  | ({ kind: "label"; text: string; sub?: string; place: string; variant?: "pin" | "card" | "banner" | "lower-third" } & Styled & Timed)
  | ({ kind: "route"; from: string; to: string; transport?: string; icon?: string; cameraMode?: "follow" | "frame" | "chase" | "orbit" } & Styled & Timed)
  | ({ kind: "flag"; place: string } & Styled & Timed)
  | ({ kind: "title"; text: string; sub?: string; template?: string; position?: string } & Styled & Timed)
  | ({ kind: "chart"; variant?: "counter" | "bar" | "line"; value?: number; prefix?: string; suffix?: string; label?: string } & Styled & Timed)
  // A symbol dropped on a spot — `between:[A,B]` sits it on the contested border
  // between two places (midpoint); else `place` names where it lands.
  | ({ kind: "marker"; place?: string; between?: [string, string]; icon?: string; emoji?: string; label?: string } & Styled & Timed)
  // An editorial leader-line callout pointing at a place.
  | ({ kind: "annotation"; place: string; text: string; sub?: string; side?: "top" | "bottom" | "left" | "right" | "auto" } & Styled & Timed)
  // A network of arcs: hub-and-spoke (hub → places) or a chain (places in order).
  | ({ kind: "connections"; hub?: string; places: string[]; mode?: "hub" | "chain" } & Styled & Timed)
  // Darken everything except a circle on `place` to force the eye there.
  | ({ kind: "spotlight"; place: string } & Styled & Timed)
  // COMPOSITE: a clash between two countries — auto-highlights BOTH (opposing
  // colours), draws the real shared border (glowing, its own style) and places
  // crossing-swords ALONG that border. Camera frames both. One word does it all.
  | ({ kind: "conflict"; a: string; b: string; icon?: string; swords?: number; colorA?: string; colorB?: string; border?: string } & Styled & Timed)
  // COMPOSITE: drop every country in a region as a flag badge (staggered pop-in)
  // and frame the camera on that region. "every country in Europe with flags".
  | ({ kind: "regionFlags"; region: string } & Styled & Timed)
  // DATA-BOUND choropleth: fill countries/regions with a proportional colour
  // scale driven by real figures from the brief (GDP, population, etc.).
  | ({ kind: "choropleth"; places: string[]; values: number[]; metric?: string; unit?: string; labels?: string[] } & Styled)
  // SCALE METAPHOR: overlay the source polygon on the target location so the
  // viewer grasps the true relative size (classic "Texas vs France" technique).
  | ({ kind: "truesize"; source: string; target: string; label?: string } & Styled)
  // CHARACTER THREAD: follows a named person's journey (expedition, biography,
  // migration) as an animated chain of stops. Each stop gets a staggered marker.
  | ({ kind: "character"; name: string; places: string[]; icon?: string } & Styled)
  // PROPORTIONAL SYMBOL MAP: circles sized by value at each location. The classic
  // Gapminder / Hans Rosling visual for population, GDP, cases, deaths, etc.
  // stagger: seconds between each bubble appearing for a cinematic one-by-one reveal.
  | ({ kind: "bubbles"; places: string[]; values: number[]; labels?: string[]; metric?: string; unit?: string; color?: string; stagger?: number } & Styled)
  // WEIGHTED FLOW: like connections but arc width = volume (trade, migration, data).
  | ({ kind: "flows"; hub?: string; places: string[]; weights: number[]; mode?: "hub" | "chain"; color?: string } & Styled)
  // EARTH OBSERVATION (NASA GIBS / satellite): overlays a real satellite raster on
  // the map — vegetation (NDVI), nighttime lights, wildfires, true-color imagery.
  // Use for environmental-change, deforestation, glacier, wildfire, urban-sprawl stories.
  // Optional compareDatasetId+compareDate shows a second layer for before/after contrast.
  | ({ kind: "earthlayer"; dataset: "true-color" | "ndvi" | "nightlights" | "fire" | "sea-temp" | "snow" | "aerosol"; date?: string; opacity?: number; label?: string; compareDataset?: "true-color" | "ndvi" | "nightlights" | "fire" | "sea-temp" | "snow" | "aerosol"; compareDate?: string } & Styled & Timed)
  // GEODESIC RANGE RINGS: true distance circles on the sphere — "within 500 km",
  // missile/radar range, blast radius, earthquake epicenter, coverage area.
  | ({ kind: "radius"; place: string; radiusKm: number; rings?: number; mode?: "grow" | "ripple" | "static"; color?: string; unit?: "km" | "mi" } & Styled & Timed)
  // ANIMATED TIMESTAMP: a date (or day counter) that ADVANCES across the scene —
  // the documentary ticker ("SEP 1939 → MAY 1945", "DAY 1 → DAY 872").
  | ({ kind: "timestamp"; start?: string; end?: string; format?: "year" | "month-year" | "full"; dayStart?: number; dayEnd?: number; prefix?: string; text?: string; position?: string } & Styled & Timed)
  // CINEMATIC WEATHER: deterministic particles over the whole frame.
  | ({ kind: "atmosphere"; effect: "snow" | "rain" | "embers" | "dust" | "fog"; density?: number; wind?: number } & Styled & Timed)
  // AI-DRAWN STICKER: the model authors ORIGINAL inline-SVG art (b-roll) —
  // rendered via <img src=data:>, so scripts can never execute by construction.
  | ({ kind: "sticker"; svg: string; place?: string; sizePx?: number; label?: string } & Styled & Timed);
export type Plan = {
  title: string; subtitle?: string; durationSec: number; aspect?: "16:9" | "9:16" | "1:1";
  basemapStyle?: string; terrain?: boolean; buildings3d?: boolean; focus: string; mood?: string; motion?: string;
  /** A creative 3D map style id (holographic / neon-noir / miniature / blueprint /
   *  obsidian / molten / aurora / crystal-ice / papercraft / war-room / sakura /
   *  emerald / golden-hour / monochrome). */
  map3dStyle?: string;
  /** INVENT a bespoke 3D world (when no preset fits the vibe) — the AI art-directs
   *  the exact colours/relief. Any field optional; clamped by the schema. */
  map3dCustom?: {
    landColor?: string; waterColor?: string; buildingColor?: string;
    buildingOpacity?: number; buildingHeightMult?: number; buildingGradient?: boolean;
    boundaryGlow?: string; terrain?: boolean; terrainStrength?: number;
    bgColor?: string; tintColor?: string; tintOpacity?: number; vignette?: number; pitch?: number;
  };
  /** OpenHistoricalMap year — with basemapStyle:"historical", renders the world as of this year. */
  mapYear?: string | number;
  /** When set, the displayed year ANIMATES from `mapYear` → `mapYearEnd` across the scene. */
  mapYearEnd?: string | number;
  /** A palette+font preset name that art-directs the whole animation. */
  palette?: string;
  /** Per-template font overrides (win over the palette's fonts) so each curated
   *  template can have a genuinely distinct typographic voice. */
  fontDisplay?: string; fontBody?: string;
  /** Which layer drives the camera (the "director"). Defaults to the camera. */
  priority?: "camera" | "route" | "highlight";
  /** Camera framing overrides for the ending shot. */
  cameraPitch?: number; cameraBearing?: number;
  /** Cinematic look passthrough (vignette / letterbox / grain / texture / tint). */
  look?: Record<string, unknown>;
  /** Ordered places the camera flies THROUGH for a journey (ends at focus). */
  cameraStops?: string[];
  /** Full per-beat camera poses (AI-authored). When present, overrides heuristic framing. */
  cameraPoses?: Array<{ place: string; zoom?: number; pitch?: number; bearing?: number; motion?: string }>;
  /** STORY MODE: one voiceover line per beat, in order (suggested narration). */
  narration?: string[];
  /** OPTIONAL: reusable feature add-ons the AI invented for this story. */
  addons?: unknown[];
  layers: PlanLayer[];
};
const MOTIONS = ["fly-in", "zoom-out", "orbit", "push-in", "pan", "hold"];

const SYSTEM = `You are the director of "Mapanisy", a cinematic MAP-animation studio (Vox / Johnny Harris style). Translate the user's idea into ONE finished, well-composed, art-directed map animation. Think like an editor: what is the single visual story, where does the eye go, what's the one focal point?

Output ONLY minified JSON (no prose, no markdown) of EXACTLY this shape:
{"title":str(≤30),"subtitle":str(≤48),"durationSec":num(5-12),"aspect":"16:9"|"9:16"|"1:1","basemapStyle":"dark"|"light"|"satellite"|"streets"|"outdoors"|"historical","mapYear":"1880 (start era, historical only)","mapYearEnd":"1920 (end era — animates year sweep + on-screen counter; historical only)","terrain":bool,"focus":str,"motion":"fly-in"|"zoom-out"|"orbit"|"push-in"|"pan"|"hold","cameraStops":[str],"mood":"conflict"|"historical"|"trade"|"empire"|"political"|"arctic"|"neutral","palette":"Default"|"Vox Editorial"|"Arctic Cold"|"Conflict Red"|"Trade Green"|"Political Violet"|"Classic Mono","priority":"camera"|"route"|"highlight","map3dStyle":"(optional look) PRO: cartograph|apple-light|apple-dark|earth-documentary|natgeo|satellite-cinematic|adventure|hiking|luxury-travel|editorial|filmic|midnight|desert|winter|ocean|vintage-atlas|modern-monochrome|metro-night|pastel-city|nordic-light|crimson-atlas|deep-ocean|sunrise-terrain|dark-editorial|satellite-night|risograph|thermal|drafting|synthwave|copperplate · CREATIVE: holographic|neon-noir|miniature|blueprint|obsidian|molten|aurora|crystal-ice|papercraft|war-room|sakura|emerald|golden-hour|monochrome","map3dCustom":{"(optional — INVENT a bespoke 3D world when no preset fits)":"","landColor":"#hex","waterColor":"#hex","buildingColor":"#hex","buildingOpacity":0-1,"buildingHeightMult":0.2-8,"buildingGradient":bool,"boundaryGlow":"#hex","terrain":bool,"terrainStrength":0-5,"bgColor":"#hex","tintColor":"#hex","tintOpacity":0-1,"vignette":0-0.7,"pitch":0-85},"look":{"vignette":0-0.7,"grain":0-0.3,"texture":"none"|"paper","mapFilter":"none"|"antique"|"noir"|"sepia"},"layers":[...]}

layer kinds (refer to places by NAME — coords are resolved for you):
 {"kind":"highlight","place":"France","fill":"flag"|"solid"|"hatch"|"crosshatch"|"stripes"|"dots","mood":"conflict","label":"optional ON-MAP text"}
 {"kind":"label","text":"PARIS","sub":"capital","place":"Paris","variant":"pin"|"card"|"lower-third"}
 {"kind":"route","from":"Paris","to":"Istanbul","transport":"driving"|"walking"|"boat"|"aircraft","icon":"car"|"plane"|"boat","cameraMode":"follow"|"frame"|"chase"|"orbit"}
 {"kind":"flag","place":"France"}
 {"kind":"title","text":"THE FALL","sub":"1989","template":"impact"|"classic","position":"center"|"bottom"}
 {"kind":"chart","variant":"counter","value":67000000,"suffix":" people","label":"population"}
 {"kind":"marker","place":"Pearl Harbor" OR "between":["India","Pakistan"],"icon":"swords"|"explosion"|"fire"|"skull"|"alert"|"radiation"|"oil"|"money"|"anchor"|"crown"|"target"|"landmark","label":"optional","emoji":"optional override"}
 {"kind":"annotation","place":"Suez Canal","text":"CHOKEPOINT","sub":"optional","side":"top"|"bottom"|"left"|"right"|"auto"}
 {"kind":"connections","hub":"London","places":["New York","Cairo","Mumbai"],"mode":"hub"|"chain"}
 {"kind":"spotlight","place":"Berlin"}
 {"kind":"conflict","a":"India","b":"Pakistan","swords":4}  ← AUTO: highlights BOTH countries in opposing colours, draws the REAL shared border glowing, and places crossing-swords ALONG it. Use for ANY clash/war/dispute/tension between two countries.
 {"kind":"regionFlags","region":"Europe"}  ← AUTO: drops EVERY country in the region as a flag, popped in one-by-one, camera framed on the region. Regions with flags: Europe, Scandinavia, Baltics, Balkans.
 {"kind":"choropleth","places":["United States","China","Germany"],"values":[25000,18000,4000],"metric":"GDP","unit":"billion USD"}  ← DATA MAP: fills each country/region with a proportional colour (light→dark scale). ALWAYS use when the brief contains a ranked list of countries by any figure (GDP, population, CO₂, poverty rate, military spending, etc.). Pairs perfectly with a "chart" counter for the top figure.
 {"kind":"truesize","source":"France","target":"Texas, USA","label":"France fits inside Texas"}  ← SCALE METAPHOR: overlays France's exact shape on Texas to show true relative size. Use for "how big is X vs Y", empire-scale context, country comparisons. The label becomes an on-map annotation.
 {"kind":"character","name":"Marco Polo","places":["Venice, Italy","Baghdad, Iraq","Samarkand, Uzbekistan","Beijing, China"],"icon":"pin"}  ← CHARACTER THREAD: animates a named person's journey as a traced chain of stops. Use for biographies, expeditions, migrations, invasions. Each stop gets a marker; the whole path draws in order.
 {"kind":"bubbles","places":["China","USA","India","Indonesia"],"values":[1400000000,330000000,1380000000,270000000],"metric":"Population","unit":"people","stagger":0}  ← PROPORTIONAL SYMBOLS: circles sized by sqrt-scaled value. STAGGERED REVEAL: when "stagger":N is set (N = seconds between bubbles, e.g. 0.9), each bubble pops in one-by-one — ALWAYS order smallest→largest so the largest appears last as a dramatic climax. Use stagger:0.7–1.1 for multi-entity reveal stories ("six centers", "top-ten cities"). The final hero entity should also get a camera push-in in the next beat.
 {"kind":"flows","hub":"London, UK","places":["New York","Mumbai","Sydney"],"weights":[450,320,180],"mode":"hub"}  ← WEIGHTED FLOWS: arc thickness = volume. Use when quantities differ significantly (trade $450B vs $180B). Shows MAGNITUDE not just connection. Add "pulse":true style for live-trade feel.
 {"kind":"radius","place":"Pyongyang, North Korea","radiusKm":1500,"rings":3,"mode":"grow","color":"#ff5a44"}  ← GEODESIC RANGE RINGS: true distance circles ("within 500 km"). ALWAYS use for: missile/radar/weapon range, blast radius, evacuation zone, earthquake epicenter (mode:"ripple" = endless sonar pulses), airport/port coverage, "everything within X km/hours". The most journalistic way to show REACH and PROXIMITY. Labels show real distances on each ring.
 {"kind":"timestamp","start":"1939-09-01","end":"1945-05-08","format":"month-year","position":"top-right"}  ← ANIMATED DATE TICKER: the date ADVANCES with the film — the documentary time-passing device. ALWAYS add for: wars, pandemics, expeditions, empire rise/fall, any story spanning months/years. Day-counter variant: {"kind":"timestamp","dayStart":1,"dayEnd":872,"prefix":"DAY"} for sieges/disasters ("DAY 872 of the siege"). One per composition.
 {"kind":"sticker","svg":"<svg viewBox='0 0 100 100'>…</svg>","place":"Lisbon","sizePx":150,"label":"caravel"}  ← DRAW YOUR OWN B-ROLL: when NO existing primitive captures the story's soul, you may AUTHOR original flat vector art as inline SVG (≤1800 chars, viewBox required, flat 2-4 colour shapes, no text) and place it on the map — a caravel for an age-of-discovery story, a compass rose, a mammoth, an oil derrick, a paper plane. This is your creative free will: invent the perfect visual instead of settling. Use AT MOST one per composition, and only when it genuinely elevates the story.
 {"kind":"atmosphere","effect":"snow","density":0.5,"wind":0.3}  ← CINEMATIC WEATHER over the frame: "snow" (winter campaigns, arctic), "rain" (monsoon, storms), "embers" (war zones, wildfires — pairs with marker icon:"fire"), "dust" (deserts, drought), "fog" (mystery, dawn battles). Sets MOOD instantly; use ONE, subtle (density 0.3-0.6), when the story has a strong environmental character.
 {"kind":"earthlayer","dataset":"ndvi","date":"2024-01-01","opacity":0.75,"label":"Vegetation 2024"}  ← EARTH OBSERVATION: overlays real NASA satellite data on the map. ALWAYS use for: deforestation, glaciers melting, wildfires, urban sprawl, drought, sea-level, biodiversity, land cover change. Datasets: "true-color" (daily satellite imagery), "ndvi" (vegetation index — green=healthy forest, brown=lost/dry), "nightlights" (city light growth, urbanization), "fire" (thermal hotspots), "sea-temp" (ocean warming), "snow" (ice/snow extent), "aerosol" (pollution/smoke). For before/after change detection add compareDataset+compareDate (different year). Date format: YYYY-MM-DD. Pairs with basemapStyle:"satellite" and terrain:true for maximum realism. This makes environmental map journalism genuinely data-driven, not illustrative.
ANY layer may add "style":{...} to art-direct exact fields — e.g. highlight {"fillColor":"#c0392b","extrude":18,"glowColor":"#ff4030"}, route {"color":"#e67e22","dashStyle":"dashed","glow":0.8}, marker {"color":"#ff3030","sizePx":150}.

VISUAL VOCABULARY — translate the user's WORDS into VISUALS (show, don't write):
 • conflict / war / invasion / clash / tension / fighting / civil war / frontline / dispute / standoff (between two countries) → kind:"conflict". A one-sided strike/attack/battle at a spot → marker icon:"swords"|"explosion". palette:"Conflict Red".
 • growing / booming / rising / surging economy·GDP·population·exports → chart variant:"line" (trends UP) or a counter. decline / crash / collapse / recession → chart "line" (reads as falling). palette:"Trade Green".
 • trade / exports / shipping / supply-chain / silk road → connections (or a boat/truck route). migration / refugees / diaspora / spread / empire reach / alliances (NATO, EU) → connections hub→many.
 • earthquake / disaster / nuclear / meltdown / bomb / strike → marker icon:"explosion"|"radiation"|"fire" on the spot. oil / gas / energy / drilling → marker icon:"oil". money / finance / wealth → marker icon:"money" or a counter.
 • "every / all countries in <region>" → kind:"regionFlags". one country → highlight fill:"flag".
 • ranked countries by a figure (GDP / population / CO₂ / military / poverty / exports) → kind:"choropleth" with the REAL numbers you verified. The colour gradient tells the whole story at a glance — data journalism grade.
 • "how big is X compared to Y" / "X is the size of Y" / scale context → kind:"truesize". The polygon overlay is the most visceral way to convey geographic scale.
 • range / reach / "within X km" / blast radius / fallout / missile range / radar coverage / evacuation zone / epicenter / shockwave → kind:"radius" (epicenter/shockwave = mode:"ripple"). Distance IS the story — show it as rings, not text.
 • a story spanning months or years (war, pandemic, expedition, empire) → ADD kind:"timestamp" with the real dates. A siege/blockade/disaster counted in days → the day-counter variant. Time passing is half the drama.
 • winter campaign / blizzard / arctic → atmosphere "snow" · monsoon / hurricane → "rain" · war zone / wildfire → "embers" · desert / drought → "dust" · dawn / mystery → "fog". Subtle (density≤0.6).
 • country-by-country quantities (population / deaths / infections / GDP per country) → kind:"bubbles". Circle area = value. Use INSTEAD of choropleth when there are fewer places (2-10) and the story is about the MAGNITUDE of each individual place.
 • trade volumes / investment flows / migration corridors with known volumes → kind:"flows" with weights. Arc WIDTH encodes the magnitude. Much more informative than plain connections when the quantities vary widely.
 • biography / expedition / migration / journey of a named person → kind:"character". Traces their stops as an animated chain. Use alongside "title" beats naming each chapter.
 • deforestation / Amazon / rainforest / glacier / wildfire / wildfire season / urban sprawl / drought / flood / sea level / habitat loss / land cover / NDVI / vegetation / climate change / carbon / coral / biodiversity → kind:"earthlayer" with the appropriate dataset ("ndvi" for forests, "fire" for wildfires, "nightlights" for urbanization, "snow" for glaciers/ice). This is MANDATORY for any environmental-change story — a real satellite layer is the journalism, not just a highlight.
 • any citation/source in brief.facts (World Bank, UN, census, etc.) → the renderer auto-shows them as in-frame source credits — no extra layer needed. Just verify your facts and cite them in the brief.
 • historical / ancient / medieval / empire / BCE / "in 1850" → look.mapFilter:"antique" (+ basemapStyle:"historical"+mapYear when the exact era is the point).

DIRECTING RULES — make it look intentional, not generic:
0. VISUAL-FIRST. Tell the story with the MAP and SYMBOLS, not sentences. Map EVERY key word in the idea to a visual using the vocabulary above, THEN add at most one short title. Never describe in text what a highlight, route, marker, connection or chart can show.
1. Pick the story type, then the layers:
   • One country/region → highlight (fill:"flag" for a nation) + a title. priority:"highlight". motion:"push-in" or "zoom-out".
   • A journey / invasion / trade / migration → a route (priority:"route"), with from+to (+intermediate via cameraStops on the camera). Pick transport+icon+cameraMode (chase for flights, follow for ground). NO title repeating the city names — the route already labels them.
   • A single city → motion:"push-in"/"fly-in", ONE label pin, terrain:true if mountainous. basemapStyle:"satellite" for a skyline.
   • A stat / comparison → a chart (counter) + a place label.
   • A clash / war / conflict / dispute / tension between two countries → kind:"conflict" — it auto-draws both country highlights (opposing colours), the REAL shared border glowing, and swords along it. palette:"Conflict Red". Add ONE title naming the conflict, never the countries.
   • "Every / all countries in <region>" (with flags) → kind:"regionFlags" (auto-frames the region). The flags ARE the story — no title needed.
   • An event at one spot (battle, disaster, strike, discovery, oil/resource) → a marker with a fitting icon (explosion/fire/skull/oil/radiation/alert) + a title.
   • A spread / network / trade / migration / empire-reach / alliances story → a connections layer (hub = the origin, places = the destinations; or mode:"chain" for a step-by-step spread). priority:"highlight" or "camera".
   • To call out ONE specific feature/chokepoint/site by name → an annotation pointing at it. To force the eye onto a single place → a spotlight.
2. ALWAYS set "palette" to match the mood (war→Conflict Red, history/empire→Vox Editorial, trade→Trade Green, politics→Political Violet, climate/arctic→Arctic Cold, else Default). It styles colours AND fonts.
3. NEVER print the same place name more than once across title/label/highlight. One clear reference.
4. 2-5 layers. Tasteful and legible beats crowded. Always include a title OR a clear label.
5. Choose motion + duration that fit the energy: dramatic reveals zoom-out, journeys fly-in, single places push-in, regions orbit.
6. For HISTORICAL / ancient / old-world stories set look.mapFilter:"antique" + look.texture:"paper" + look.vignette~0.6 so the map reads like an aged historical map. Use look.mapFilter:"noir" for stark war pieces. Otherwise keep look subtle or omit it.
7. For a story tied to a SPECIFIC YEAR where period-accurate borders matter (empires, pre-modern history) you MAY set basemapStyle:"historical" + mapYear (e.g. "1880"). Coverage is uneven — only use it when the era is the point; otherwise prefer a normal basemap + the antique look.

FRAMING & STYLE DISCIPLINE — pick the move + style that SUIT the content (the system auto-frames the camera to each place's TRUE on-the-ground size, so focus on intent, not exact zoom):
 • DATA stories (choropleth / bubbles / weighted flows / ranked countries) → top-down, FLAT. motion:"hold" or "zoom-out", NEVER orbit/push-in (tilt distorts the data). basemapStyle:"dark" (or "light" for a bright editorial look) — NEVER satellite/streets under data colours.
 • A CITY / skyline / landmark / neighbourhood → basemapStyle:"satellite", motion:"push-in" or "fly-in", terrain:true if mountainous. The tilt + imagery is the wow.
 • NATURE / mountains / parks / expeditions / coastline → basemapStyle:"outdoors", terrain:true, motion:"orbit" or "fly-in".
 • A COUNTRY / region reveal → basemapStyle:"dark", motion:"push-in" (intimate) or "zoom-out" (epic), a gentle 3D lean.
 • A JOURNEY / route → basemapStyle:"dark", motion:"fly-in" through cameraStops, moderate tilt.
 • HISTORICAL → basemapStyle:"historical" or the antique look; keep the camera flatter (old maps read top-down).
 Match basemapStyle to the subject EVERY time — a wrong style (satellite under data, flat dark for a skyline) is the #1 thing that makes it look amateur.
 • MAP STYLE via "map3dStyle" — PREFER the PROFESSIONAL collection for most stories (they read like premium travel documentaries): "earth-documentary"/"satellite-cinematic" for landscapes+terrain, "natgeo"/"vintage-atlas" for history/exploration, "editorial" for news/data, "cartograph" for adventure/expedition/history with a hand-drawn survey-atlas feel (parchment + 3D terrain + a lat/long grid + ink borders), "dark-editorial" for hard news / geopolitics / conflict (red country borders, grey streets — the newsroom look), "satellite-night" for a dramatic earth-at-night global opener or a space-view reveal, "apple-light"/"apple-dark" for modern product-grade looks, "adventure"/"hiking" for outdoor journeys, "luxury-travel"/"filmic"/"midnight" for mood pieces, "desert"/"winter"/"ocean" when the geography matches, "modern-monochrome" for stark editorial, "risograph" for a bold poster/zine two-ink print, "thermal" for a dramatic infrared magma-relief reveal, "drafting" for an architect's cyan-blueprint-on-cream gridded look. The CREATIVE worlds (holographic, neon-noir, miniature, blueprint, molten, aurora, war-room, sakura, …) are for deliberately stylised pieces — use only when the brief calls for that energy; best on a CITY reveal, pairs with motion:"orbit"/"push-in".
 • INVENT A 3D WORLD: when the story has a strong colour identity that no preset nails (e.g. "a toxic green wasteland", "a royal purple empire", "a frozen crimson tundra"), set "map3dCustom" with your own hexes — landColor, waterColor, buildingColor (+ buildingHeightMult/Gradient), boundaryGlow, terrain, bgColor/tintColor, pitch. Be bold and cohesive; the schema clamps anything out of range. Use a preset OR map3dCustom, not both.

8. PLACE ACCURACY (critical — the map MUST land on the right spot). Every place name you emit is geocoded literally, so be UNAMBIGUOUS:
   • Use the canonical, full name and ADD the disambiguating parent for anything ambiguous: "Tbilisi, Georgia" (not "Georgia"), "Cordoba, Spain", "Springfield, Illinois, USA", "Naga City, Philippines". A bare ambiguous name will geocode to the wrong place.
   • For a COUNTRY, use the country's common English name alone ("Japan", "Georgia (country)"). For a CITY, prefer "City, Country". For a region/feature, name it precisely ("Sichuan, China", "Strait of Hormuz").
   • Highlights/pins/markers must reference the EXACT feature the story is about. If unsure between two readings, pick the one the idea clearly means and qualify it.
   • Never invent a place that doesn't exist; if a beat has no real location, omit the pin rather than guessing.
   • For Chinese places: always append ", China" (e.g. "Dujiangyan, Sichuan, China", not "Dujiangyan"). For research centers / POIs, use the full official English name + city + province + China so the geocoder finds them.
   • When you receive RESEARCHED ENTITIES from the Director script (marked with ⚑), copy those place names VERBATIM — the Director verified them; any substitution will break geocoding.

9. HISTORICAL TIME-SWEEP: when the ERA ITSELF CHANGES (empire growing 100 BCE→476 CE, Black Death 1347→1353, WWI border redraw 1914→1918) set basemapStyle:"historical" + mapYear (start year, e.g. "-100") + mapYearEnd (end year, e.g. "476"). The map date animates and an on-screen year counter auto-appears. Set durationSec:14-22. Only when the date-change IS the visual drama — not just for every historical story.

SPATIAL COMPOSITION — think like a film editor framing a 16:9 canvas:
• Place titles in NEGATIVE SPACE: focal country left-of-center → title RIGHT; country fills frame → title BOTTOM; open ocean → title TOP. Never cover the feature you just revealed.
• Use "annotation" (leader-line callout) to POINT at a feature and state the JOURNALISM FACT ("controls 20% of world oil", "where the advance stalled Nov 1941"). Annotations are more powerful than plain labels.
• AT MOST one title + one label or annotation visible at any moment. Use outSec to EXIT a title before the next ENTERS. A crowded frame is a failed visualization.

CHOREOGRAPHY:
• Features appear FIRST (highlight grows, route draws, marker pops) → text confirmation appears ~0.8-1.2s LATER. Stagger within each beat — never text and feature simultaneously.
• In story mode: layers for a geographic beat should appear AS the camera arrives there, not all at once at the start.
• Use outSec on every chapter title: previous title must EXIT before next title ENTERS. Overlapping chapter titles are amateur.

DATA BINDING — when your brief cites a real number, SHOW IT on the map:
• Population / deaths / GDP / km → {"kind":"chart","variant":"counter","value":67000000,"suffix":" people","label":"France"}
• Trend over time → {"kind":"chart","variant":"line","series":[{"label":"2000","value":100},{"label":"2024","value":340}]}
• Numbers make the story credible and specific. If you quote a figure, chart it.

TIMING — YOU control when each layer appears. Add these fields DIRECTLY on every layer object (not inside "style"):
• "inSec":N — exactly when this layer appears (seconds from composition start). Beat 1 layers: 0.3–1.5. Beat 2 layers: [dur×(1/n)]–[dur×(1/n)+1.5]. Stagger same-beat layers by 0.25s each.
• "outSec":N or null — when to exit. null = stays to end. Chapter titles: set outSec = next title's inSec − 0.35.
• "enter":"fade"|"slide-up"|"scale"|"border-first" — how it enters. Highlights/routes: "border-first". Titles: "slide-up". Labels/markers: "fade" or "scale".
Example: {"kind":"title","text":"THE FALL","inSec":1.2,"outSec":5.8,"enter":"slide-up"}

CAMERA POSES — for multi-beat stories, add "cameraPoses" to the top-level plan (one per beat, in story order):
{"cameraPoses":[{"place":"Europe","zoom":3,"pitch":8,"bearing":0,"motion":"zoom-out"},{"place":"Berlin, Germany","zoom":6,"pitch":45,"bearing":-15,"motion":"push-in"}]}
zoom 2–4 = continental, 5–6 = country, 7–9 = region, 10–14 = city. pitch 0–12 = data/flat, 30–50 = dramatic lean, 55–65 = skyline.

Be decisive and specific to THIS idea.`;

/* ── STORY MODE: a narrative/script → a sequenced, chaptered fly-through ─────── */
const STORY_SYSTEM = `${SYSTEM}

STORY MODE — the input is a NARRATIVE or script, not a single idea. Turn it into ONE cinematic map STORY that plays as a sequenced fly-through:
S1. Read the WHOLE story and find its 3-6 KEY GEOGRAPHIC BEATS in chronological/narrative order.
S2. Set durationSec to 15-45 (longer — it's a story; budget ~6-8s per beat). Fill "cameraStops" with the beats' places IN ORDER (the camera journeys through them); "focus" is the final/climactic place.
S3. For EACH beat add its visuals (highlight / route / marker icon:swords|fire|… / connections) AND ONE short chapter "title" naming that beat (≤ 24 chars). Put layers in STORY ORDER — they are sequenced automatically so each chapter title appears as the camera arrives, then yields to the next.
S4. Add "narration": an array with ONE vivid voiceover sentence per beat (same order, same count as the beats) — what a documentary narrator would say.
S5. ≤ 14 layers total. The MAP + the journey carry the story; titles are short chapter markers, never paragraphs. Keep one cohesive palette + look for the whole piece (antique for history, noir for war).
S6. MAKE IT VISUAL, not just titles: when the beats form a journey, add ONE {"kind":"connections","places":[beats in order],"mode":"chain"} as the visual spine; give the climactic beat a marker (swords/explosion/fire/skull/oil) or highlight. Every beat should leave something ON the map.

══ VISUAL STORYTELLING — how the best map-explainers (Vox, Johnny Harris, Kurzgesagt, Bloomberg) actually do it ══
• ONE IDEA PER BEAT. The viewer can read ONE thing at a time. Never stack two competing messages in the same moment.
• PROGRESSIVE REVEAL: establish the world (wide) → zoom to the subject → add the single key detail → land the payoff. Information enters one layer at a time, never all at once.
• NEGATIVE SPACE: leave the map breathing room. Fewer labels, fewer simultaneous elements. Clarity beats density.
• MOTION CARRIES MEANING: the camera move IS narration — push in on what matters, pull back to show scale, follow to show a journey. Don't move without a reason.
• TEXT IS A CHAPTER MARKER, never a paragraph. Short, declarative, one line.

══ TEXT SAFETY — CRITICAL, never violate (this is what separates pro from amateur) ══
T1. NEVER show two text elements (titles/labels) on screen at the SAME TIME if they could overlap. Each chapter title must fully EXIT (fade/slide out) BEFORE the next chapter title ENTERS. Give every title an explicit timing window {inSec, outSec} that does NOT overlap the next title's window.
T2. Text must not sit ON TOP of a busy feature in the same instant (a route head arriving, a highlight growing, a marker popping). Stagger them: feature animates, settles, THEN its label/title appears — or place the text in clear negative space (opposite side of the focal element).
T3. Keep on-screen text to AT MOST ONE title + minimal map labels at any moment. If a beat needs more words than one short line, cut words — never cram.
T4. THE WHOLE STORY IS ONE CONTINUOUS TIMELINE — a single uninterrupted shot where the camera flows from beat to beat (there are NO scene cuts). Design every beat's window on that one timeline: give each beat's layers explicit {inSec, outSec} so beat i's title has fully exited before beat i+1's title enters, and each beat's visuals appear as the camera ARRIVES at that beat's place. Think of it as one take by a documentary drone — establish, travel, reveal, land.`;

/* ── The Director Doctrine, woven into the planner so it researches + fact-checks
 * the story FIRST and tells the RIGHT one, cohesively, like a journalist ─────── */
const ARCHETYPE_GUIDE = ARCHETYPES.map((a) => `• ${a.name} (when: ${a.triggers.slice(0, 5).join(", ")}) → ${a.recipe}`).join("\n");

const DOCTRINE = `\n\n══ DIRECTOR DOCTRINE — follow it ══\n${DIRECTOR_PRINCIPLES}\n\nMATCH THE STORY ARCHETYPE, then use its recipe (these map to real layers — e.g. "expansion" = a highlight with style.animation:"grow"):\n${ARCHETYPE_GUIDE}\n\n${SOURCE_AND_VERIFY}\n\n${COHESION_LAW}`;

/** The planner ALSO returns a fact-checked "brief" so the user sees the journalism
 *  (thesis, the facts used + confidence + source, caveats) before scenes build. */
const BRIEF_INSTRUCTION = `\n\nAlso add a top-level "brief" object: {"thesis":"the ONE sentence the map proves","angle":"the lead angle","archetype":"the matched archetype name","facts":[{"claim":"a specific fact you used","confidence":"high"|"medium"|"low","source":"the TYPE of trusted source, e.g. 'UN/World Bank', 'national census', 'academic atlas', 'Encyclopaedia Britannica'"}](3-6 of the most load-bearing facts),"caveats":["any uncertainty, estimate, or date-sensitivity"],"disputed":["how any contested border/territory is handled, neutrally — '' if none"]}. RESEARCH + VERIFY these facts FIRST using only trusted sources; assign HONEST confidence; never fabricate dates/figures/borders — mark them low or omit. THEN design the plan so it tells that ONE story visually and cohesively.`;

/** Lets a strong model EXTEND the toolkit: invent a reusable composite feature
 *  the first time a story needs one, which we save permanently as an add-on. */
const ADDON_INSTRUCTION = `\n\n══ OPTIONAL — INVENT A REUSABLE FEATURE (add-on) ══\nIf this story needs a DISTINCTIVE COMPOSITE that no single primitive provides AND that would be reusable on other subjects (e.g. "Siege" = city highlight + encircling arrows + pulsing marker; "Blockade", "Epicenter" = spotlight + concentric rings + marker, "Supply line", "Frontline push"), you MAY define ONE add-on so the user can reuse it forever. Add a top-level "addons":[{"name":str(≤40),"description":str,"icon":(optional lucide-react icon name),"params":[{"key":"place","label":"City","type":"place"|"text"|"color"|"number"}],"layers":[<plan layers, using {{key}} tokens wherever a param goes — e.g. {"kind":"highlight","place":"{{place}}","fillColor":"#ff3030"} and {"kind":"connections","hub":"{{place}}","places":["..."],"mode":"hub"}],"look":{optional},"motion":optional}]. Use {{token}} ONLY for parameterised values; everything else is concrete. Define AT MOST ONE genuinely-novel add-on, or omit "addons" entirely. NEVER make an add-on for a plain single highlight/route/marker.`;

const withDoctrine = (base: string) => `${base}${DOCTRINE}${BRIEF_INSTRUCTION}${ADDON_INSTRUCTION}`;

/** SIMPLE REQUEST MODE — the lightweight default for direct, non-story prompts.
 *  No documentary expansion, no deep research, no invented context: the user
 *  already knows what they want. Deep research is reserved for prompts that ask
 *  for it (or genuinely need factual grounding). */
const SIMPLE_MODE = `\n\n══ SIMPLE REQUEST — keep it light ══\nThis is a direct, simple request: the user already knows exactly what they want. Do NOT expand it into a documentary. No research beyond resolving the named places, no extra "context" layers, no invented statistics, dates, or backstory. Produce exactly the requested visual: AT MOST 4 layers, ONE clean intentional camera move, a cohesive look, and at most one short title (only if a heading genuinely helps). Elegant simplicity wins. Include only a one-line "brief": {"thesis":"<what this shows>","angle":"","archetype":"","facts":[],"caveats":[],"disputed":[]}.`;

/** True when a prompt should get the lightweight path: short, direct, ≤2 places,
 *  and no signal that the user wants a researched story. */
function isSimpleIntent(idea: string, locationCount: number): boolean {
  if (idea.length >= 140) return false;
  if (locationCount > 2) return false;
  const RESEARCHY = /documentar|research|story|history|histor|explain|why\s|how\s|war|battle|empire|evolution|crisis|conflict|migra|trade|econom|gdp|population|statistic|data|timeline|deep|fact|journal/i;
  return !RESEARCHY.test(idea);
}

/* ── Phase 1: Story Director ─────────────────────────────────────────────────
 * A focused, fast call that translates the user's idea into a structured story
 * script — what to show per beat and HOW to animate it. The Composer (Phase 2)
 * receives this script as context and outputs the complete technical Plan JSON.
 * Separation of concerns: Director = editorial/story decisions; Composer = technical animation. */

type DirectorBeat = {
  title: string;           // ≤20 chars, chapter heading
  narration: string;       // one powerful narrator sentence
  focus: string;           // unambiguous place name for camera
  energy?: "calm" | "building" | "tension" | "reveal" | "payoff";
  pacing?: "slow" | "medium" | "fast";
  cameraIntent?: "establish" | "explore" | "focus" | "reveal" | "hero";
  zoom?: number;           // 2–14
  pitch?: number;          // 0–85 degrees (85 = maplibre 4.x max — near-horizon look-ahead)
  bearing?: number;        // -30–30
  motion?: string;         // fly-in | zoom-out | push-in | orbit | hold
  layers: string[];        // plain English layer descriptions in geography→emphasis→text order
  /** Researched entities for data-driven layers — Director fills these in when input says
   *  "N [unnamed things]". Composer reads them verbatim → kind:"bubbles". */
  entities?: {
    place: string;    // fully geocodeable, country-qualified
    value: number;    // the data value (visitors/year, population, GDP, etc.)
    label?: string;   // short display label (≤15 chars)
  }[];
  entityMetric?: string;   // "Annual Visitors", "Population 2024", "GDP billion USD"
  entityUnit?: string;     // "visitors/yr", "M people", "billion USD"
  entityStagger?: number;  // seconds between each bubble appearing (0.6-1.2)
};

type DirectorScript = {
  inputType?: "voiceover" | "idea" | "brief";
  arc?: "journey" | "reveal" | "contrast" | "scale" | "data" | "conflict";
  thesis: string;
  totalSec?: number;
  palette?: string;
  mapStyle?: string;
  look?: Record<string, unknown>;
  beats: DirectorBeat[];
};

const DIRECTOR_SYSTEM = `You are the Editorial Mind of Mapanisy — a Vox / Johnny Harris / Bloomberg Visual Studio-grade cinematic map studio.

You think. You research. You design. You don't fill templates — you make editorial decisions like the best documentary editors alive.

When a user gives you input, your job is NOT to parse it mechanically. Your job is to understand what they're ACTUALLY trying to show — the subtext, the implicit facts, the emotional arc — and then design the perfect visual sequence to prove it.

━━━ READING THE INPUT ━━━

Detect type (encode as "inputType"):
• "voiceover" — narrator lines. Read between them. Extract every implicit fact requirement.
  "six research centers near Chengdu" → you know which six. Name them. The user doesn't know — that's why they're using this tool.
  "the most visited is right in the city center" → that's the Chengdu Research Base (~2M/yr). It's the contrast entity.
  "we chose Dujiangyan because it's quieter" → Dujiangyan Panda Base is the hero. Camera ends there.
  Honor the narrator's EXACT arc. Visualize their words. Don't rewrite their story.
• "brief" — structured paragraphs. Extract faithfully: who, where, what changed, why it matters.
• "idea" — keywords or short phrase. Invent the strongest editorial angle yourself.

━━━ FIND THE STORY ━━━

Ask: what does the audience need to FEEL? What is the single visual that PROVES the thesis?
• "thesis" — ONE punchy sentence (≤20 words)
• "arc" — "journey"|"reveal"|"contrast"|"scale"|"data"|"conflict"

━━━ RESEARCH — YOUR CORE OBLIGATION ━━━

When input mentions "N [unnamed things]" — you NAME them. All of them. You have the knowledge. Use it.
A vague description like "show 6 research centers as bubbles" is worthless — the animator cannot geocode unnamed places.

For unnamed entity groups:
→ Name every entity with full, geocodeable, country-qualified names
→ Include real quantitative data (visitors/yr, population, GDP, area, deaths — whatever is relevant)
→ Sort ASCENDING by value — smallest first, largest LAST (= cinematic climax, the eye lands there)
→ Output on the relevant beat: "entities", "entityMetric", "entityUnit", "entityStagger" (0.7–1.1s)

WORKED EXAMPLE — voiceover: "there are six panda research centers near Chengdu. The most visited is right in the city center, but we chose Dujiangyan for reintroduction":

Beat 2 (DATA REVEAL — all 6 bubble up in staggered order):
"entities": [
  {"place":"Hetaoping Research and Conservation Center, Wolong, Sichuan, China","value":65000,"label":"Hetaoping"},
  {"place":"Wolong Shenshuping Giant Panda Center, Wolong, Sichuan, China","value":95000,"label":"Shenshuping"},
  {"place":"Panda Valley, Dujiangyan, Sichuan, China","value":150000,"label":"Panda Valley"},
  {"place":"Dujiangyan Giant Panda Base, Dujiangyan, Sichuan, China","value":280000,"label":"Dujiangyan Base"},
  {"place":"Bifengxia Giant Panda Base, Ya'an, Sichuan, China","value":480000,"label":"Bifengxia"},
  {"place":"Chengdu Research Base of Giant Panda Breeding, Chengdu, Sichuan, China","value":2000000,"label":"Chengdu Base"}
],
"entityMetric":"Annual Visitors","entityUnit":"visitors/yr","entityStagger":0.9

Beat 3 (HERO — camera pushes to Dujiangyan):
focus: "Dujiangyan, Sichuan, China", energy:"payoff", cameraIntent:"hero", zoom:11, pitch:65
layers: ["spotlight on Dujiangyan, Sichuan, China", "annotation at Dujiangyan, Sichuan, China text:REINTRODUCTION FOCUS side:right"]

━━━ BEAT DESIGN ━━━

2-6 beats. Each beat = one camera position + one emotional moment + one core visual.
Beat 1: ALWAYS wide (zoom 2-5, pitch 0-15°), energy:"calm" — establish context.
Beat N: ALWAYS the payoff — close, emotional, unmistakable proof of the thesis, energy:"payoff".

ENERGY (emotional charge → camera language):
• "calm"     → wide, contemplative. pitch 0-20°. 6-10s.
• "building" → momentum rising. pitch 15-35°, push-in. 4-7s.
• "tension"  → tight, urgent. pitch 30-50°. 3-5s.
• "reveal"   → the key moment. Punch close OR sudden wide. 3-6s.
• "payoff"   → hero shot. pitch 50-85°, slow hold or orbit; 75-85° only for sweeping mountain/city look-ahead reveals. 5-10s.

PACING (duration rhythm):
• "slow" → 6-10s. Layers stagger 0.5s apart.
• "medium" → 4-7s. Layers 0.3s apart.
• "fast" → 2-4s. Layers 0.15s. Punchy.

CAMERA INTENT:
• "establish" → zoom 2-5, pitch 0-15°.
• "explore"   → zoom 4-7, pitch 15-35°.
• "focus"     → zoom 7-10, pitch 30-50°.
• "reveal"    → zoom 9-12 or sudden zoom 2-4.
• "hero"      → zoom 10-14, pitch 60-80°. Slow hold.

ZOOM: 2-4=continental · 4-6=country/region · 6-8=metro · 8-11=city · 11-14=landmark

VISUALIZATION CHOICE:
• N specific entities with quantities → entities[] array + bubbles (stagger reveal, ascending order)
• Countries ranked by one metric → choropleth
• A journey between named places → route or character
• Two-country conflict/tension → conflict (auto: both highlights + shared border glowing)
• Environmental change / satellite imagery → earthlayer (ndvi/fire/nightlights/etc.)
• Scale comparison → truesize

LAYER ORDER — SACRED. Within every beat:
  1. GEOGRAPHY: highlight / route / connections / earthlayer — the map speaks first
  2. EMPHASIS: marker / spotlight / annotation — draw attention
  3. TEXT: title / sub — arrives LAST, after the map has spoken
Never put a title before geography in the same beat.

━━━ OUTPUT — JSON only, no prose ━━━
{"inputType":"voiceover|idea|brief","arc":"journey|reveal|contrast|scale|data|conflict","thesis":"≤20 words","totalSec":8-30,"palette":"Default|Vox Editorial|Arctic Cold|Conflict Red|Trade Green|Political Violet|Classic Mono","mapStyle":"dark|light|satellite|outdoors|historical","look":{"mapFilter":"none|antique|noir","vignette":0.3-0.6},"beats":[{"title":"≤20 CHARS","narration":"exact voiceover line or vivid invented narrator sentence","focus":"Precise, Country-qualified place name","energy":"calm|building|tension|reveal|payoff","pacing":"slow|medium|fast","cameraIntent":"establish|explore|focus|reveal|hero","zoom":3-14,"pitch":0-85,"bearing":-30-30,"motion":"fly-in|zoom-out|push-in|orbit|hold","layers":["GEOGRAPHY first","EMPHASIS second","TEXT last"],"entities":[{"place":"Full Name, City, Region, Country","value":NUMBER,"label":"≤15 chars"}],"entityMetric":"Annual Visitors","entityUnit":"visitors/yr","entityStagger":0.9}]}

LAYER DESCRIPTION EXAMPLES (animator reads these LITERALLY — be precise):
  "highlight Sichuan province, China subtle blue border-first"
  "spotlight on Dujiangyan, Sichuan, China"
  "marker at Chengdu, Sichuan, China icon:pin glow:green"
  "annotation at Dujiangyan, Sichuan, China text:REINTRODUCTION side:right"
  "title GIANT PANDAS sub:Sichuan, China enter:slide-up"  ← always last

QUALITY CONTRACT:
• Voiceover: visualize the narrator's words exactly — don't rewrite the story
• Places: always country-qualified. "Dujiangyan, Sichuan, China" never "Dujiangyan"
• Unnamed entities: research and name ALL of them — incomplete = broken animation
• palette + mapStyle + look must match mood cohesively (antique for history, noir for war, dark for data)`;

/** Robust JSON extraction that handles:
 *  • Markdown code fences (```json ... ```)
 *  • Trailing text after the closing brace
 *  • Truncated output — closes unclosed brackets so a partial Plan is usable */
function extractJSON(text: string): Record<string, unknown> | null {
  // Strip markdown fences
  const stripped = text.replace(/^```[a-z]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
  const start = stripped.indexOf("{");
  if (start === -1) return null;

  // Pass 1: walk brackets to find the outermost complete object
  let depth = 0, inStr = false, esc = false, complete = -1;
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) { complete = i; break; } }
  }

  if (complete > 0) {
    try { return JSON.parse(stripped.slice(start, complete + 1)) as Record<string, unknown>; } catch {}
  }

  // Pass 2: output was truncated — close all unclosed brackets, strip trailing partial value
  let partial = stripped.slice(start);
  // Remove a trailing incomplete string/value (everything after last comma/bracket at depth 1)
  partial = partial.replace(/,\s*["{\[]*\s*$/, "").replace(/:\s*["{\[0-9]*\s*$/, "");
  const stack: string[] = [];
  let inS2 = false, es2 = false;
  for (const c of partial) {
    if (es2) { es2 = false; continue; }
    if (c === "\\" && inS2) { es2 = true; continue; }
    if (c === '"') { inS2 = !inS2; continue; }
    if (inS2) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length) stack.pop();
  }
  const repaired = partial + stack.reverse().join("");
  try { return JSON.parse(repaired) as Record<string, unknown>; } catch { return null; }
}

/** Sanitize AI-authored sticker SVG: size cap, must be a bare <svg> with a
 *  viewBox, and NO active content (scripts, handlers, external refs, CSS). The
 *  result only ever renders inside <img src="data:…">, where scripts can't run
 *  anyway — this keeps the stored document clean too. Returns null to reject. */
function sanitizeStickerSvg(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 20 || s.length > 4000) return null;
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null;
  if (!/viewBox\s*=/i.test(s)) return null;
  const banned = /<\s*(script|foreignObject|iframe|embed|object|use|image|animate|set)\b|on[a-z]+\s*=|javascript:|href\s*=|xlink:href|url\s*\(|@import|<\s*style\b/i;
  if (banned.test(s)) return null;
  return s;
}

async function directorCall(idea: string, cfg: AIConfig): Promise<DirectorScript | null> {
  // 1800 tokens: enough for 6-10 entity research entries + 3-5 beats. Keeps cost low.
  const { text } = await aiComplete(DIRECTOR_SYSTEM, `Idea: """${idea.slice(0, 1600)}"""`, cfg, { maxTokens: 1800 });
  if (!text) return null;
  try {
    const json = extractJSON(text);
    if (!json || !Array.isArray(json?.beats) || (json.beats as unknown[]).length < 1) return null;
    return json as unknown as DirectorScript;
  } catch { return null; }
}

/** Beat duration (seconds) from pacing/energy fields — varies the rhythm of the story. */
function beatDurFor(b: DirectorBeat): number {
  const pacing = b.pacing ?? (b.energy === "calm" || b.energy === "payoff" ? "slow" : b.energy === "tension" || b.energy === "reveal" ? "fast" : "medium");
  if (pacing === "slow")   return b.energy === "payoff" ? 9 : 7;
  if (pacing === "fast")   return 3;
  return 5; // medium
}

/** Layer stagger within a beat — pacing drives how quickly things stack up. */
function staggerFor(b: DirectorBeat): number {
  if (b.pacing === "slow") return 0.5;
  if (b.pacing === "fast") return 0.15;
  return 0.3;
}

/** How long the camera settles before the FIRST geography layer appears. */
function camSettleFor(b: DirectorBeat): number {
  if (b.pacing === "slow") return 0.6;
  if (b.pacing === "fast") return 0.2;
  return 0.4;
}

/** Format a DirectorScript as a precise context block for the Composer (Phase 2).
 *  Pre-computes per-beat timing from energy/pacing fields so the Composer only
 *  outputs JSON — all editorial and choreography decisions stay in the Director. */
function scriptToComposerContext(script: DirectorScript): string {
  const n = script.beats.length;

  // Per-beat durations from pacing/energy, then scaled to fit totalSec.
  const rawDurs = script.beats.map(beatDurFor);
  const rawTotal = rawDurs.reduce((a, b) => a + b, 0);
  const totalSec = script.totalSec ?? Math.max(8, rawTotal);
  const scale = totalSec / rawTotal;
  const beatDurs = rawDurs.map((d) => Math.round(d * scale * 10) / 10);

  // Beat start times from cumulative durations (not equal splits).
  const beatStarts: number[] = [];
  let t = 0;
  for (const d of beatDurs) { beatStarts.push(Math.round(t * 10) / 10); t += d; }

  const cameraPoses = script.beats.map((b) => ({
    place: b.focus,
    zoom: b.zoom ?? undefined,
    pitch: b.pitch ?? undefined,
    bearing: b.bearing ?? undefined,
    motion: b.motion ?? undefined,
  }));

  const lines: string[] = [
    `DIRECTOR'S SCRIPT — realize this EXACTLY as a finished Plan JSON:`,
    `Thesis: ${script.thesis} | Arc: ${script.arc ?? "reveal"} | Input: ${script.inputType ?? "idea"}`,
    `Total: ${totalSec}s | Palette: ${script.palette ?? "Default"} | Map: ${script.mapStyle ?? "dark"} | Look: ${JSON.stringify(script.look ?? {})}`,
    ``,
    `CAMERA POSES — copy this array verbatim into top-level "cameraPoses":`,
    JSON.stringify(cameraPoses),
    ``,
    `BEAT CHOREOGRAPHY — each beat has its own timing rules driven by energy/pacing:`,
    `(Rule: camera arrives at beatStart. Geography layers appear after camera settles. Text always arrives LAST in the beat.)`,
    ``,
  ];

  for (let i = 0; i < n; i++) {
    const b = script.beats[i];
    const start = beatStarts[i];
    const dur = beatDurs[i];
    const stagger = staggerFor(b);
    const settle = camSettleFor(b);
    const firstGeoAt = Math.round((start + settle) * 10) / 10;
    const titleAt = Math.round((firstGeoAt + stagger * 2.5) * 10) / 10;
    const nextStart = i + 1 < n ? beatStarts[i + 1] : totalSec;
    const titleOut = Math.round((nextStart - 0.35) * 10) / 10;

    lines.push(`Beat ${i + 1}: "${b.title}" [${start}s–${Math.round((start + dur) * 10) / 10}s] | energy:${b.energy ?? "medium"} pacing:${b.pacing ?? "medium"} cameraIntent:${b.cameraIntent ?? "focus"}`);
    lines.push(`  Narration (copy verbatim into narration[]): "${b.narration}"`);
    lines.push(`  TIMING: Camera at ${start}s. Geography starts ${firstGeoAt}s. Stagger ${stagger}s per layer. Title inSec=${titleAt} outSec=${titleOut}.`);
    lines.push(`  LAYERS (geography → emphasis → text — NEVER put title before map content):`);
    for (const l of b.layers) lines.push(`    • ${l}`);

    // When the Director researched specific entities, relay them directly to the Composer
    // as a structured machine-readable block — no guessing, no hallucination.
    if (b.entities && b.entities.length > 0) {
      const sorted = [...b.entities].sort((x, y) => x.value - y.value); // ascending → largest = climax
      lines.push(``);
      lines.push(`  ⚑ RESEARCHED ENTITIES — Composer MUST use these EXACT place names verbatim:`);
      lines.push(`    kind:"bubbles"`);
      lines.push(`    metric:"${b.entityMetric ?? ""}", unit:"${b.entityUnit ?? ""}"`);
      lines.push(`    stagger:${b.entityStagger ?? 0.9} (each bubble appears ${b.entityStagger ?? 0.9}s after previous)`);
      lines.push(`    ORDER: ascending by value (smallest first → largest = cinematic climax)`);
      lines.push(`    places:${JSON.stringify(sorted.map((e) => e.place))}`);
      lines.push(`    values:${JSON.stringify(sorted.map((e) => e.value))}`);
      lines.push(`    labels:${JSON.stringify(sorted.map((e) => e.label ?? ""))}`);
      lines.push(`    inSec:${firstGeoAt} (first bubble at firstGeoAt, subsequent add stagger each)`);
      lines.push(`    DO NOT substitute, shorten, rephrase, or invent alternate names — geocoder will fail.`);
    }

    lines.push(``);
  }

  lines.push(
    `CHOREOGRAPHY RULES (enforce on every layer):`,
    `• Geography layers (highlight/route/connections/spotlight): inSec = firstGeoAt, then +${staggerFor(script.beats[0])}s each`,
    `• Emphasis layers (marker/annotation): inSec = geography_inSec + stagger`,
    `• Title layer: inSec = titleAt shown above, outSec = titleOut. NEVER earlier than the beat's geography.`,
    `• outSec=null for geography/emphasis (they persist until next beat overwrites them)`,
    `• enter:"fade" for geography, enter:"slide-up" for titles, enter:"pop" for markers`,
    ``,
    `⚑ RESEARCHED ENTITIES — BINDING CONTRACT:`,
    `When a beat above has ⚑ RESEARCHED ENTITIES, you MUST output a kind:"bubbles" layer with:`,
    `  • places[] copied VERBATIM from the list above (exact strings, no shortening)`,
    `  • values[] copied exactly`,
    `  • stagger = the entityStagger value shown`,
    `  • inSec = the firstGeoAt shown for that beat`,
    `  • The geocoder will FAIL if you rephrase, abbreviate, or substitute any place name.`,
    ``,
    `Output the complete Plan JSON. Include: "cameraPoses", "narration":[], "durationSec":${totalSec}. Every layer must have "inSec" and "enter".`,
  );

  return lines.join("\n");
}

/* ── Phase 2: Animation Composer (provider-agnostic) ───────────────────────── */
/** Minimum quality bar: a plan must have a focal place AND at least one geographic
 *  visual layer (not just text). Returns a human-readable problem string or null. */
function checkPlanQuality(plan: Record<string, unknown> | null): string | null {
  if (!plan) return "No plan";
  if (!plan.focus || typeof plan.focus !== "string" || !plan.focus.trim()) return "No focal place";
  const layers = Array.isArray(plan.layers) ? plan.layers as any[] : [];
  if (layers.length < 1) return "No layers";
  const GEO_KINDS = ["highlight", "route", "marker", "connections", "conflict", "regionFlags",
    "choropleth", "bubbles", "flows", "earthlayer", "spotlight", "character", "truesize", "flag", "annotation", "radius"];
  const hasGeo = layers.some((l) => GEO_KINDS.includes(l?.kind));
  if (!hasGeo) return "All layers are text — no geographic content on the map";
  return null;
}

async function aiPlan(idea: string, cfg: AIConfig | null, system: string = SYSTEM): Promise<{ plan: Plan | null; error?: string; warning?: string; tokensUsed?: number }> {
  if (!cfg) return { plan: null };
  // Composer outputs a full Plan JSON — can exceed 2000 tokens for a 4-beat story.
  // 4096 guarantees complete output. Temperature 0.25 reduces JSON malformation.
  const result = await aiComplete(system, `Idea: """${idea.slice(0, 3200)}"""`, cfg, { maxTokens: 4096, temperature: 0.25 });
  const { text, error, truncated, usage } = result;
  const tokensUsed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  if (!text) return { plan: null, error: error ?? "Empty AI response." };

  // Try to parse whatever we got (extractJSON handles truncated JSON via bracket repair)
  let json = extractJSON(text);
  let warning: string | undefined;

  if (truncated) {
    // Output was cut off — first try to use what we extracted
    if (json?.focus && Array.isArray(json?.layers) && (json.layers as unknown[]).length > 0) {
      warning = "Your story was very complex — the animation was simplified to fit within AI limits. Try breaking it into shorter sequences for maximum detail.";
    } else {
      // Partial JSON wasn't usable — do a repair call asking for a minimal 2-beat version
      const repairPrompt = `The previous plan was cut off. Produce a SHORTER version: max 2 beats, max 6 layers total, keep the same focus and story. Idea: """${idea.slice(0, 800)}"""`;
      const repair = await aiComplete(system, repairPrompt, cfg, { maxTokens: 2000, temperature: 0.2 });
      if (repair.text) json = extractJSON(repair.text);
      warning = "The AI needed to simplify your animation to complete it — it was longer than the model could generate in one pass. For the full version, split your idea into 2–3 shorter sequences.";
    }
  }

  if (!json?.focus || !Array.isArray(json?.layers)) {
    return { plan: null, error: "AI returned an unexpected shape.", tokensUsed };
  }

  // Quality gate: if the plan has no geographic layers (text-only), retry once
  // with an explicit directive so the composer adds at least one visual element.
  const qualityIssue = checkPlanQuality(json);
  if (qualityIssue) {
    const fixPrompt = `ISSUE: ${qualityIssue}. Produce the same story but ensure the "layers" array contains at least ONE geographic layer (highlight/route/marker/connections/earthlayer/spotlight). A map animation with only text layers is broken. Idea: """${idea.slice(0, 1000)}"""`;
    const fix = await aiComplete(system, fixPrompt, cfg, { maxTokens: 2500, temperature: 0.2 });
    if (fix.text) {
      const fixJson = extractJSON(fix.text);
      if (!checkPlanQuality(fixJson)) json = fixJson;
    }
    if (checkPlanQuality(json)) {
      return { plan: null, error: `AI plan had no map content (${qualityIssue}). Try describing the specific place or event more clearly.`, tokensUsed };
    }
  }

  return { plan: json as unknown as Plan, warning, tokensUsed };
}

/* ── Geography resolvers ─────────────────────────────────────────────────── */
type GeoResult = { lon: number; lat: number; zoom: number; placeType: string; name: string; iso: string | null; bbox: [number, number, number, number] | null };

/** Mercator-aware zoom that frames a bbox in a 16:9 frame with cinematic padding.
 *  This is the accuracy core: a tiny country (Luxembourg) and a huge one (Russia)
 *  resolve to very DIFFERENT zooms based on their real extent — instead of every
 *  "country" landing at a single guessed zoom. `pad` < 1 leaves breathing room. */
function zoomForBbox(bbox: [number, number, number, number], pad = 0.82): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const latRad = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return Math.log((1 + s) / (1 - s)) / 2;
  };
  // World tile is 512px at zoom 0; reference a 1920×1080 frame.
  const VW = 1920, VH = 1080, WORLD = 512;
  let lonSpan = maxLon - minLon; if (lonSpan < 0) lonSpan += 360;
  const lonFrac = Math.max(lonSpan / 360, 1e-4);
  const latFrac = Math.max(Math.abs(latRad(maxLat) - latRad(minLat)) / (2 * Math.PI), 1e-4);
  const lonZoom = Math.log2((VW / WORLD) / lonFrac);
  const latZoom = Math.log2((VH / WORLD) / latFrac);
  // Fit the more-constraining axis, then back off by `pad` zoom for headroom.
  return Math.max(1.2, Math.min(16, Math.min(lonZoom, latZoom) - (1 - pad) * 6));
}
// Geocode cache (per server lifetime). Geography doesn't change, and the place-
// grounding pre-pass + buildFromPlan both resolve the same names — caching keeps
// them consistent AND halves the Mapbox calls. Bounded so it can't grow forever.
const GEO_CACHE = new Map<string, GeoResult | null>();
async function geocode(q: string): Promise<GeoResult | null> {
  if (!q) return null;
  const key = q.trim().toLowerCase();
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;
  let out: GeoResult | null = null;
  if (MAPBOX_TOKEN) {
    try {
      const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&limit=1&access_token=${MAPBOX_TOKEN}`);
      if (r.ok) {
        const d = await r.json(); const f = d.features?.[0];
        const [lon, lat] = f?.geometry?.coordinates ?? [];
        if (typeof lon === "number") {
          const placeType = f.properties?.feature_type ?? "place";
          // Mapbox v6 returns an extent bbox [minLon,minLat,maxLon,maxLat] for most
          // areal features. Frame the camera to the REAL extent (the accuracy win);
          // only fall back to the placeType guess for points with no bbox.
          const rawBbox = f.properties?.bbox ?? f.bbox ?? null;
          const bbox: [number, number, number, number] | null =
            Array.isArray(rawBbox) && rawBbox.length === 4 && rawBbox.every((n: any) => typeof n === "number")
              ? [rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]] : null;
          const zoomBy: Record<string, number> = { country: 3.4, region: 5.5, district: 8, place: 9.5, locality: 11, neighborhood: 12.5, street: 14, address: 15.5 };
          // Pads tuned per scale: areal features get more breathing room than points.
          const zoom = bbox ? zoomForBbox(bbox, placeType === "country" || placeType === "region" ? 0.86 : 0.8) : (zoomBy[placeType] ?? 9);
          out = { lon, lat, zoom, placeType, name: f.properties?.name ?? q, iso: f.properties?.context?.country?.country_code?.toUpperCase() ?? null, bbox };
        }
      }
    } catch { out = null; }
  }
  // Nominatim fallback — used when Mapbox token is absent or the request failed.
  if (!out) out = await geocodeNominatim(q);
  if (GEO_CACHE.size > 2000) GEO_CACHE.clear();
  GEO_CACHE.set(key, out);
  return out;
}

/** Does a geocode result plausibly MATCH what was asked for? Catches the silent
 *  "Strait of Hormuz → OF, Germany" / "Wakanda → a random street" failures: the
 *  resolved name must share a meaningful token with the query, and a story place
 *  must not resolve to a street/address (almost always a wrong pin). */
function geoLooksWrong(query: string, geo: GeoResult | null): boolean {
  if (!geo) return true;
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const head = norm(query.split(",")[0]);            // the actual place, before any ", Country"
  const rname = norm(geo.name);
  const qTokens = head.split(" ").filter((w) => w.length > 3);
  const rTokens = rname.split(" ").filter((w) => w.length > 3);
  const overlap = !qTokens.length || qTokens.some((w) => rname.includes(w)) || rTokens.some((w) => head.includes(w));
  if (!overlap) return true;                          // name totally unrelated → wrong
  // An EXACT name match is trustworthy even if Mapbox typed it oddly (e.g.
  // "Mount Everest" comes back feature_type:"street" but is clearly correct).
  const exactish = rname === head || (rname.length > 3 && head.includes(rname));
  if ((geo.placeType === "street" || geo.placeType === "address") && qTokens.length && !exactish) return true; // a region/city query → a random street = wrong
  return false;
}
async function fetchPolygon(q: string) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "Mapanisy/1.0 (michaandguadi@gmail.com)" } });
    if (!r.ok) return null; const a = await r.json();
    return a?.[0] ? { geojson: a[0].geojson, iso: a[0].address?.country_code?.toUpperCase() ?? null } : null;
  } catch { return null; }
}
/** Visit every place-name string in a plan (focus, camera stops, and each
 *  layer's place fields) with get/set accessors, so we can validate + rewrite. */
function eachPlaceField(plan: Plan, visit: (get: () => string, set: (v: string) => void, kind: string) => void) {
  const p = plan as any;
  if (typeof p.focus === "string") visit(() => p.focus, (v) => { p.focus = v; }, "focus");
  if (Array.isArray(p.cameraStops)) p.cameraStops.forEach((_: unknown, i: number) => visit(() => p.cameraStops[i], (v) => { p.cameraStops[i] = v; }, "stop"));
  for (const l of (p.layers ?? []) as any[]) {
    for (const k of ["place", "from", "to", "hub", "a", "b"]) {
      if (typeof l[k] === "string" && l[k]) visit(() => l[k], (v) => { l[k] = v; }, k);
    }
    if (Array.isArray(l.places)) l.places.forEach((_: unknown, i: number) => { if (typeof l.places[i] === "string") visit(() => l.places[i], (v) => { l.places[i] = v; }, "places"); });
  }
}

/** Nominatim forward geocode — used as a fallback when Mapbox isn't configured. */
async function geocodeNominatim(q: string): Promise<GeoResult | null> {
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mapanisy/1.0 (michaandguadi@gmail.com)" } });
    if (!r.ok) return null;
    const a = await r.json();
    const f = a?.[0];
    if (!f) return null;
    const lon = parseFloat(f.lon), lat = parseFloat(f.lat);
    if (!isFinite(lon) || !isFinite(lat)) return null;
    const typeMap: Record<string, number> = { country: 3.4, state: 5.5, county: 7, city: 9.5, town: 10.5, village: 12, suburb: 12.5 };
    const zoom = typeMap[f.type] ?? typeMap[f.addresstype ?? ""] ?? 9;
    return { lon, lat, zoom, placeType: f.type ?? "place", name: f.display_name?.split(",")?.[0] ?? q, iso: null, bbox: null };
  } catch { return null; }
}

/** AI repair: given names that resolved to the WRONG place (or nowhere), ask the
 *  model for the precise, unambiguous canonical name a geocoder will nail. */
async function repairPlaces(bad: string[], ctx: string, cfg: AIConfig): Promise<Record<string, string | null>> {
  const sys = `You correct bad MAP place names. Each input failed to resolve to the right real-world location. For each, return the precise, UNAMBIGUOUS canonical name a geocoder will land on correctly — as "Place, Country" or "Place, Region, Country" (e.g. "Strait of Hormuz"→"Strait of Hormuz, Oman", "Naga"→"Naga, Camarines Sur, Philippines", "Georgia (country)"→"Tbilisi, Georgia"). If a name is FICTIONAL or not a real place, return null for it. Return STRICT JSON only: {"fixes":{"<input>":"<fixed name or null>"}}.`;
  const user = `Story context: """${ctx.slice(0, 500)}"""\nFix these place names:\n${bad.map((b) => `- ${b}`).join("\n")}`;
  // Repair JSON is tiny — 600 tokens is more than enough.
  const { text } = await aiComplete(sys, user, cfg, { maxTokens: 600 });
  if (!text) return {};
  try {
    const j = extractJSON(text);
    const fixes = (j as any)?.fixes ?? {};
    const out: Record<string, string | null> = {};
    for (const b of bad) { const v = fixes[b]; out[b] = typeof v === "string" && v.trim() ? v.trim() : null; }
    return out;
  } catch { return {}; }
}

export interface PlaceReport { checked: number; ok: number; corrected: { from: string; to: string }[]; unresolved: string[] }

/** PLACE GROUNDING — the accuracy superpower. Verify EVERY place the plan
 *  references actually lands on the right spot; AI-repair the wrong ones;
 *  rewrite the plan with the corrected names. So the map never silently pins the
 *  wrong city (the thing that made it "weaker than just asking an AI"). */
async function groundPlaces(plan: Plan, cfg: AIConfig | null, ctx: string): Promise<PlaceReport> {
  const refs: { get: () => string; set: (v: string) => void; orig: string; kind: string }[] = [];
  eachPlaceField(plan, (get, set, kind) => { const v = (get() ?? "").trim(); if (v) refs.push({ get, set, orig: v, kind }); });
  const unique = Array.from(new Set(refs.map((r) => r.orig)));
  if (!unique.length) return { checked: 0, ok: 0, corrected: [], unresolved: [] };

  const geos = new Map<string, GeoResult | null>();
  await Promise.all(unique.map(async (p) => geos.set(p, await geocode(p))));
  const suspect = unique.filter((p) => geoLooksWrong(p, geos.get(p) ?? null));

  const corrections: Record<string, string> = {};
  const unresolved = new Set<string>();
  if (suspect.length && cfg) {
    const fixes = await repairPlaces(suspect, ctx, cfg);
    for (const p of suspect) {
      const fix = fixes[p];
      if (fix) { const g = await geocode(fix); if (g && !geoLooksWrong(fix, g)) { corrections[p] = fix; continue; } }
      unresolved.add(p);
    }
  } else {
    suspect.forEach((p) => unresolved.add(p));
  }
  // Apply: corrected names get rewritten; UNRESOLVABLE places are BLANKED so the
  // builder skips them — better to show NO pin than a confidently-wrong one. The
  // one exception is `focus` (the camera needs a target): fall back to the first
  // place that DID resolve so the shot still lands somewhere meaningful.
  const firstGood = refs.find((r) => !suspect.includes(r.orig) || corrections[r.orig])?.orig;
  const focusFallback = firstGood ? (corrections[firstGood] ?? firstGood) : "";
  for (const r of refs) {
    if (corrections[r.orig]) { r.set(corrections[r.orig]); continue; }
    if (unresolved.has(r.orig)) r.set(r.kind === "focus" ? focusFallback : "");
  }
  return { checked: unique.length, ok: unique.length - suspect.length, corrected: Object.entries(corrections).map(([from, to]) => ({ from, to })), unresolved: Array.from(unresolved) };
}

/** Great-circle samples between two lon/lat. */
function greatCircle(from: [number, number], to: [number, number], n = 64): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180, toDeg = (r: number) => (r * 180) / Math.PI;
  const [lon1, lat1] = from.map(toRad), [lon2, lat2] = to.map(toRad);
  const dl = lon2 - lon1, dla = lat2 - lat1;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dl / 2) ** 2;
  const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (dist < 1e-8) return [from, to];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * dist) / Math.sin(dist), B = Math.sin(f * dist) / Math.sin(dist);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

const STYLE_URL: Record<string, string> = {
  dark: "mapbox://styles/mapbox/dark-v11", light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12", streets: "mapbox://styles/mapbox/streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
  historical: "https://www.openhistoricalmap.org/map-styles/main/main.json",
};

/* ── NASA GIBS earth-observation tile helpers ────────────────────────────── */

/* ── NASA GIBS earth-observation tile library ────────────────────────────────
 * Free, no auth required, production-grade satellite/scientific imagery from
 * NASA Earthdata Global Imagery Browse Services (GIBS). 500+ datasets — we
 * curate the most useful for map journalism here.
 *
 * `maxzoom` = the highest zoom level the GIBS tile matrix supports.
 *   MODIS (250m) → GoogleMapsCompatible_Level9  → maxzoom 9
 *   VIIRS/Landsat → GoogleMapsCompatible_Level8 → maxzoom 8
 *   Landsat high-res → GoogleMapsCompatible_Level12 → maxzoom 12
 *   (MapLibre over-zooms from maxzoom when you go deeper — still looks great.)
 *
 * `static` = true for datasets with no meaningful date (served as one mosaic).
 *   Pass any date for non-static; MapLibre will use the closest available.
 */
type GibsMeta = {
  id: string; fmt: "jpg" | "png"; matrix: string; maxzoom: number;
  label: string; attribution: string; static?: boolean;
};
const GIBS_LAYER: Record<string, GibsMeta> = {
  // ── True-color daily composites (RGB satellite imagery) ────────────────────
  "true-color": {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor", fmt: "jpg",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "True Color (MODIS Terra)", attribution: "NASA Terra MODIS / Earthdata GIBS",
  },
  "true-color-aqua": {
    id: "MODIS_Aqua_CorrectedReflectance_TrueColor", fmt: "jpg",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "True Color (MODIS Aqua)", attribution: "NASA Aqua MODIS / Earthdata GIBS",
  },
  // Landsat is sharper (30m, max zoom 12) but annual composites only.
  "landsat": {
    id: "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", fmt: "jpg",
    matrix: "GoogleMapsCompatible_Level12", maxzoom: 12,
    label: "True Color — Landsat (Annual)", attribution: "NASA Landsat / Earthdata GIBS",
  },
  // ── Vegetation / environment ───────────────────────────────────────────────
  "ndvi": {
    id: "MODIS_Terra_NDVI_8Day", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Vegetation Index — NDVI", attribution: "NASA Terra MODIS NDVI / Earthdata GIBS",
  },
  "evi": {
    id: "MODIS_Terra_EVI_8Day", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Enhanced Vegetation Index — EVI", attribution: "NASA Terra MODIS EVI / Earthdata GIBS",
  },
  // ── Fire / thermal ────────────────────────────────────────────────────────
  "fire": {
    id: "MODIS_Terra_Thermal_Anomalies_All", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Active Fire / Thermal Hotspots", attribution: "NASA Terra MODIS Thermal Anomalies / Earthdata GIBS",
  },
  "fire-aqua": {
    id: "MODIS_Aqua_Thermal_Anomalies_All", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Active Fire (MODIS Aqua)", attribution: "NASA Aqua MODIS Thermal Anomalies / Earthdata GIBS",
  },
  // ── Nighttime lights — urban growth ───────────────────────────────────────
  "nightlights": {
    id: "VIIRS_SNPP_DayNightBand_ENCC", fmt: "png",
    matrix: "GoogleMapsCompatible_Level8", maxzoom: 8,
    label: "Nighttime City Lights — VIIRS", attribution: "NASA VIIRS SNPP Day-Night Band / Earthdata GIBS",
  },
  // ── Ocean / sea ───────────────────────────────────────────────────────────
  "sea-temp": {
    id: "MODIS_Aqua_Sea_Surface_Temp_Night", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Sea Surface Temperature", attribution: "NASA Aqua MODIS SST / Earthdata GIBS",
  },
  "chlorophyll": {
    id: "MODIS_Aqua_Chlorophyll_A", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Ocean Chlorophyll-A", attribution: "NASA Aqua MODIS Chlorophyll / Earthdata GIBS",
  },
  // ── Ice & snow ────────────────────────────────────────────────────────────
  "snow": {
    id: "MODIS_Terra_Snow_Cover_Daily_L3_Global_500m", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Snow & Ice Cover", attribution: "NASA Terra MODIS Snow Cover / Earthdata GIBS",
  },
  "sea-ice": {
    id: "NSIDC_VIIRS_NOAA20_Sea_Ice_Concentration", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Sea Ice Concentration", attribution: "NSIDC VIIRS / Earthdata GIBS",
  },
  // ── Atmosphere / air quality ──────────────────────────────────────────────
  "aerosol": {
    id: "MODIS_Terra_Aerosol_Optical_Depth", fmt: "png",
    matrix: "GoogleMapsCompatible_Level9", maxzoom: 9,
    label: "Aerosol & Smoke Opacity", attribution: "NASA Terra MODIS Aerosol / Earthdata GIBS",
  },
  // ── Precipitation ─────────────────────────────────────────────────────────
  "rain": {
    id: "GPM_L3_Half_Hourly_06", fmt: "png",
    matrix: "GoogleMapsCompatible_Level5", maxzoom: 5,
    label: "Precipitation — GPM", attribution: "NASA GPM / Earthdata GIBS",
  },
  // ── Static basemaps (no date needed) ─────────────────────────────────────
  "blue-marble": {
    id: "BlueMarble_NextGeneration", fmt: "jpg",
    matrix: "GoogleMapsCompatible_Level8", maxzoom: 8,
    label: "Blue Marble", attribution: "NASA Blue Marble / Earthdata GIBS",
    static: true,
  },
};

/** Resolve a date string → YYYY-MM-DD.
 *  "latest" falls back to 2 days ago (GIBS near-real-time products lag ~1-2 days).
 *  Static datasets (blue-marble etc.) always return an empty date. */
function resolveGibsDate(date?: string, isStatic = false): string {
  if (isStatic) return "";
  if (!date || date === "latest") {
    const d = new Date(); d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }
  return date.slice(0, 10);
}

/** Build the MapLibre raster tile URL template for a GIBS dataset. */
function gibsTileUrl(layerKey: string, date: string): string | null {
  const meta = GIBS_LAYER[layerKey];
  if (!meta) return null;
  const d = resolveGibsDate(date, meta.static);
  const datePart = d ? `/${d}` : "/default";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${meta.id}/default${datePart}/${meta.matrix}/{z}/{y}/{x}.${meta.fmt}`;
}

/* ── Assemble a Project from a plan ──────────────────────────────────────── */
/** Linearly interpolate between two CSS hex colours at t ∈ [0, 1]. */
function lerpColor(low: string, high: string, t: number): string {
  const h = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const a = h(low.length === 7 ? low : "#e3f2fd"), b = h(high.length === 7 ? high : "#0d47a1");
  const r = (v: number) => v.toString(16).padStart(2, "0");
  return `#${r(Math.round(a[0] + (b[0] - a[0]) * t))}${r(Math.round(a[1] + (b[1] - a[1]) * t))}${r(Math.round(a[2] + (b[2] - a[2]) * t))}`;
}

/* ── Constrained color system ─────────────────────────────────────────────────
 * The AI may art-direct colors, but inside a professional envelope: no neon,
 * no washed-out saturated pastels, no invisible saturated near-blacks. Neutral
 * colors (whites/blacks/grays, s≈0) pass through untouched — they're the
 * backbone of the design system, not a risk. */
function tameColor(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return hex;
  const h6 = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const r = parseInt(h6.slice(0, 2), 16) / 255, g = parseInt(h6.slice(2, 4), 16) / 255, b = parseInt(h6.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hDeg = 0;
  if (d > 0) {
    if (max === r) hDeg = 60 * (((g - b) / d) % 6);
    else if (max === g) hDeg = 60 * ((b - r) / d + 2);
    else hDeg = 60 * ((r - g) / d + 4);
    if (hDeg < 0) hDeg += 360;
  }
  if (s < 0.12) return hex; // neutral — leave whites/blacks/grays alone
  s = Math.min(s, 0.82);                       // cap saturation (no neon)
  l = Math.min(0.82, Math.max(0.18, l));       // keep chromatic colors readable
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r1, g1, b1] = hDeg < 60 ? [c, x, 0] : hDeg < 120 ? [x, c, 0] : hDeg < 180 ? [0, c, x]
    : hDeg < 240 ? [0, x, c] : hDeg < 300 ? [x, 0, c] : [c, 0, x];
  const to2 = (v: number) => Math.round((v + m0) * 255).toString(16).padStart(2, "0");
  return `#${to2(r1)}${to2(g1)}${to2(b1)}`;
}

const COLOR_KEYS = ["fillColor", "color", "glowColor", "borderColor", "boundaryGlow", "landColor", "waterColor", "buildingColor", "tintColor", "bgColor", "gradeShadow", "gradeMid", "gradeHigh", "colorA", "colorB", "border"];

/** Tame every recognised color field in a style/spec object (shallow). */
function tameStyleColors<T extends Record<string, unknown> | undefined>(style: T): T {
  if (!style) return style;
  for (const k of COLOR_KEYS) {
    if (typeof style[k] === "string" && (style[k] as string).startsWith("#")) {
      (style as Record<string, unknown>)[k] = tameColor(style[k] as string);
    }
  }
  return style;
}

/** Shift all coordinates in a GeoJSON by (dLon, dLat) — used for true-size overlays. */
function offsetGeoJSON(geojson: any, dLon: number, dLat: number): any {
  if (!geojson) return null;
  const oc = (c: any): any => (typeof c[0] === "number" ? [c[0] + dLon, c[1] + dLat] : c.map(oc));
  const og = (g: any): any => g ? { ...g, coordinates: oc(g.coordinates) } : null;
  if (geojson.type === "Feature") return { ...geojson, geometry: og(geojson.geometry) };
  if (geojson.type === "FeatureCollection") return { ...geojson, features: geojson.features.map((f: any) => ({ ...f, geometry: og(f.geometry) })) };
  return og(geojson);
}

/* ── Composition intelligence: the right framing + style + look per story ─────
 * These deterministic resolvers run AFTER the AI plan so the output always makes
 * sense even when the model under-specifies — the camera tilt, map style and
 * colour grade are chosen by WHAT the story shows, not a blanket default. */

type StoryKind = "data" | "city" | "terrain" | "journey" | "region" | "country" | "historical" | "conflict";

/** Classify the story from the plan's layers + focus so framing/style/look can
 *  be tuned to it. Order matters: the most specific signal wins. */
function classifyStory(plan: Plan, focusType: string): StoryKind {
  const kinds = new Set((plan.layers ?? []).map((l: any) => l.kind));
  if (plan.basemapStyle === "historical" || plan.mapYear) return "historical";
  if (kinds.has("choropleth") || kinds.has("bubbles") || kinds.has("flows")) return "data";
  if (kinds.has("conflict")) return "conflict";
  if (kinds.has("route") || kinds.has("character") || (plan.cameraStops?.length ?? 0) > 1) return "journey";
  if (kinds.has("regionFlags")) return "region";
  // City-scale: a locality/place/address focus (skyline, neighbourhood, landmark).
  if (["locality", "place", "neighborhood", "address", "street", "district"].includes(focusType)) return "city";
  if (plan.terrain) return "terrain";
  if (focusType === "region") return "region";
  return "country";
}

/** The ending camera pose (pitch + bearing + zoom bias) that best SHOWS this
 *  kind of story. Data maps read honestly top-down; cities want a dramatic tilt;
 *  reveals want a gentle 3D lean. This is "the camera is the narrator" made
 *  deterministic, so even a terse prompt gets a purposeful shot. */
function framingForStory(kind: StoryKind, terrain: boolean): { pitch: number; bearing: number; zoomBias: number } {
  switch (kind) {
    // Flat, honest, top-down — a tilted choropleth distorts the data it encodes.
    case "data":       return { pitch: 0, bearing: 0, zoomBias: -0.3 };
    case "conflict":   return { pitch: 0, bearing: 0, zoomBias: -0.2 };   // frame both sides square-on
    case "region":     return { pitch: 8, bearing: 0, zoomBias: -0.2 };
    // Dramatic skyline lean (+ buildings/terrain do the rest).
    case "city":       return { pitch: 58, bearing: -18, zoomBias: 0.4 };
    case "terrain":    return { pitch: 52, bearing: -15, zoomBias: 0.0 };
    // A travelling shot reads best with a moderate lean into the direction.
    case "journey":    return { pitch: 40, bearing: -8, zoomBias: -0.2 };
    case "historical": return { pitch: 18, bearing: 0, zoomBias: -0.2 };  // antique maps read flatter
    // A single country reveal: a gentle, premium 3D tilt.
    case "country":    return { pitch: terrain ? 50 : 34, bearing: -10, zoomBias: 0 };
    default:           return { pitch: 35, bearing: -10, zoomBias: 0 };
  }
}

/** Resolve the basemap STYLE so it always suits the story — validating the AI's
 *  pick and correcting clashes (e.g. a colour-coded data map on satellite is
 *  unreadable; a skyline on flat dark loses the wow). Returns the style key. */
function resolveBasemapStyle(plan: Plan, kind: StoryKind): string {
  const picked = (plan.basemapStyle ?? "").toLowerCase();
  const valid = ["dark", "light", "satellite", "streets", "outdoors", "historical"];
  const ai = valid.includes(picked) ? picked : "";
  switch (kind) {
    case "historical": return "historical";
    // Data needs a clean, low-chroma canvas so the data colours carry meaning.
    // Honour an explicit light/dark choice; never let data sit on satellite/streets.
    case "data":       return ai === "light" ? "light" : "dark";
    case "conflict":   return ai === "satellite" ? "satellite" : (ai || "dark");
    // A city/skyline is dramatically better on satellite imagery.
    case "city":       return ai === "streets" || ai === "light" ? ai : "satellite";
    case "terrain":    return ai === "satellite" ? "satellite" : "outdoors";
    case "journey":    return ai || "dark";
    case "region":     return ai || "dark";
    default:           return ai || "dark";
  }
}

/** Resolve the cinematic LOOK so the grade/vignette/letterbox match the style +
 *  story. Clean for data (credibility), cinematic for narrative, never an antique
 *  filter on a modern data map. Merged OVER the AI's explicit look choices. */
function resolveLook(plan: Plan, kind: StoryKind, styleKey: string): Record<string, unknown> {
  switch (kind) {
    case "data":
      // Minimal, neutral — let the data read. No filter, light vignette only.
      return { vignette: 0.18, grain: 0, letterbox: 0, mapFilter: "none", texture: "none" };
    case "historical":
      return { vignette: 0.6, grain: 0.18, mapFilter: "antique", texture: "paper", textureOpacity: 0.5, letterbox: 0.06 };
    case "conflict":
      return { vignette: 0.5, grain: 0.12, mapFilter: styleKey === "satellite" ? "none" : "noir", letterbox: 0.08 };
    case "city":
      return { vignette: 0.4, grain: 0.05, mapFilter: "none", letterbox: 0.08 };
    case "terrain":
      return { vignette: 0.35, grain: 0.04, mapFilter: "none", letterbox: 0.06 };
    case "journey":
      return { vignette: 0.38, grain: 0.06, letterbox: 0.08 };
    default:
      // Country/region reveal: a tasteful, premium cinematic base.
      return { vignette: 0.42, grain: 0.06, letterbox: 0.06 };
  }
}

async function buildFromPlan(plan: Plan, opts: { story?: boolean } = {}): Promise<Project> {
  const project = createDefaultProject(plan.title || "AI animation");
  // Quick animations stay punchy (≤12s); a STORY earns a longer runtime (≤60s,
  // the Storyboard Review's slider range) so multi-beat narratives can breathe.
  const dur = Math.min(opts.story ? 60 : 12, Math.max(5, Math.round(plan.durationSec || 7)));
  project.composition.durationSec = dur;
  if (plan.aspect) project.composition.aspect = plan.aspect;

  // Resolve geography FIRST so story classification can use the focus's real scale.
  const focus = await geocode(plan.focus);
  const story = classifyStory(plan, focus?.placeType ?? "country");

  // Smart basemap: the right style for THIS story (validates + corrects the AI's
  // pick so a colour-coded data map never lands on satellite, etc.).
  const styleKey = resolveBasemapStyle(plan, story);
  project.composition.basemap.styleUrl = STYLE_URL[styleKey] ?? STYLE_URL.dark;
  // Depth cues where they READ — never tilt/terrain a flat data map.
  const terrain = (plan.terrain || story === "terrain") && story !== "data" && story !== "region";
  project.composition.basemap.terrain = !!terrain;
  project.composition.basemap.buildings3d = (!!plan.buildings3d || story === "city") && styleKey !== "satellite";
  if (plan.mapYear !== undefined && plan.mapYear !== "") project.composition.basemap.mapYear = String(plan.mapYear);
  if ((plan as any).mapYearEnd !== undefined && (plan as any).mapYearEnd !== "") {
    project.composition.basemap.mapYearEnd = String((plan as any).mapYearEnd);
  }

  // Content-aware framing: pitch/bearing/zoom chosen by what the story SHOWS.
  const frame = framingForStory(story, !!terrain);
  const endZoom = focus ? Math.max(1.4, Math.min(16, focus.zoom + frame.zoomBias)) : 4;
  const cam = focus
    ? defaultCamera({ lon: focus.lon, lat: focus.lat, zoom: endZoom, pitch: frame.pitch, bearing: frame.bearing })
    : defaultCamera();
  if (plan.motion && MOTIONS.includes(plan.motion)) (cam as any).style = plan.motion;
  // The AI's explicit camera overrides always win over the derived framing.
  if (typeof plan.cameraPitch === "number") (cam as any).end.pitch = Math.max(0, Math.min(85, plan.cameraPitch));
  if (typeof plan.cameraBearing === "number") (cam as any).end.bearing = plan.cameraBearing;

  // AI-authored camera poses (Phase 2 output) — these carry full per-beat
  // zoom/pitch/bearing as designed by the director, so use them directly.
  // Falls back to cameraStops (name-only path), then single-focus heuristic.
  if (plan.cameraPoses?.length) {
    const poses = (await Promise.all(
      plan.cameraPoses.slice(0, 8).map(async (cp) => {
        const g = await geocode(cp.place);
        if (!g) return null;
        return {
          lon: g.lon, lat: g.lat,
          zoom: cp.zoom ?? Math.max(2, Math.min(14, g.zoom + (frame.zoomBias ?? 0))),
          pitch: cp.pitch ?? frame.pitch,
          bearing: cp.bearing ?? frame.bearing,
        };
      })
    )).filter(Boolean) as { lon: number; lat: number; zoom: number; pitch: number; bearing: number }[];
    if (poses.length >= 2) {
      const motionFromPose = plan.cameraPoses[0]?.motion ?? "fly-in";
      (cam as any).style = MOTIONS.includes(motionFromPose) ? motionFromPose : "fly-in";
      (cam as any).smoothPath = true;
      (cam as any).start = poses[0];
      (cam as any).waypoints = poses.slice(1, -1);
      (cam as any).end = poses[poses.length - 1];
    }
  } else if (plan.cameraStops?.length && focus) {
    // Multi-stop journey: fly THROUGH the cameraStops, ending at the focus. Use the
    // journey framing (a moderate lean), and keep waypoints zoomed-out enough to
    // read the route between beats.
    const stops = (await Promise.all(plan.cameraStops.slice(0, 6).map((s) => geocode(s)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof geocode>>>[];
    if (stops.length) {
      const travel = (g: { lon: number; lat: number; zoom: number }) => ({ lon: g.lon, lat: g.lat, zoom: Math.min(g.zoom, 6), pitch: Math.min(frame.pitch, 34), bearing: 0 });
      (cam as any).style = "fly-in";
      (cam as any).smoothPath = true;
      (cam as any).start = travel(stops[0]);
      (cam as any).waypoints = stops.slice(1).map(travel);
      (cam as any).end = { lon: focus.lon, lat: focus.lat, zoom: Math.min(endZoom, 6.5), pitch: frame.pitch, bearing: frame.bearing };
    }
  }
  const layers: Layer[] = [cam];
  // Curated templates art-direct exact per-layer values via `style`. Remember
  // those raw overrides by layer id so the palette recolour later fills only
  // what the template LEFT OPEN — a template's explicit colours always win.
  const styleById = new Map<string, Record<string, unknown>>();
  const add = (l: Layer, style?: Record<string, unknown>) => {
    if (style && Object.keys(style).length) styleById.set(l.id, style);
    layers.push(l);
  };
  // A composite (conflict / regionFlags) can ask the camera to frame a bbox
  // instead of the single `focus` point — so "Europe" frames Europe, and a
  // border clash frames both countries.
  let frameBbox: [number, number, number, number] | null = null;

  // Beat-arrival choreography: layers reveal WHEN the camera arrives at their
  // geographic beat. Beats = camera path [start, ...waypoints, end].
  // In multi-stop journeys, title layers mark beat transitions so the layers for
  // each beat appear as the camera arrives there — not all at once at the start.
  const camPath = [(cam as any).start, ...((cam as any).waypoints ?? []), (cam as any).end].filter(Boolean);
  const nBeats = camPath.length; // 2 = single focus, >2 = multi-stop journey
  const moveFrac = 0.82; // camera uses ~82% of dur; rest is the hero hold
  let currentBeat = 0;
  let withinBeatCount = 0;

  // Stagger overlay entrances across the scene for a composed reveal.
  // Stories carry one layer-set for EVERY beat on a single timeline, so they
  // need far more headroom than a quick single-shot animation — a 7-layer cap
  // silently dropped later beats' titles/highlights (the #1 "beats missing" bug).
  const overlays = plan.layers.slice(0, opts.story ? 18 : 10);
  const inAt = (): number => {
    if (nBeats <= 2) {
      // Single scene: classic sequential distribution (original behavior).
      return Math.round((0.12 + (oi / Math.max(1, overlays.length)) * 0.55) * dur * 100) / 100;
    }
    // Multi-stop: each beat's layers appear when the camera arrives there.
    const beatFrac = currentBeat / Math.max(1, nBeats - 1);
    const beatStart = beatFrac * moveFrac * dur;
    return Math.round(Math.max(0.1, Math.min(beatStart + 0.5 + withinBeatCount * 0.25, dur * 0.92)) * 100) / 100;
  };

  // Titles whose timing the AI authored explicitly — the story-mode slicer
  // below must NOT clobber those windows (the AI already made them non-overlapping).
  const aiTimedTitleIds = new Set<string>();

  let oi = 0;
  for (const pl of overlays) {
    // In multi-stop story mode, title layers mark beat transitions.
    if (pl.kind === "title" && oi > 0 && nBeats > 2) {
      currentBeat = Math.min(currentBeat + 1, nBeats - 1);
      withinBeatCount = 0;
    }
    // Constrained color system: every AI-authored color is clamped into the
    // professional envelope before it can touch a layer.
    tameStyleColors(pl as unknown as Record<string, unknown>);
    if (pl.style) tameStyleColors(pl.style as Record<string, unknown>);
    // AI-authored timing takes priority — only fall back to heuristic inAt() when
    // the AI didn't specify. This is the core of "AI builds the animation, not heuristics".
    const hasAiTiming = typeof (pl as any).inSec === "number";
    const timing: { inSec: number; outSec: number | null; enter: "fade" | "slide-up" | "scale" | "border-first"; exit: "fade" | "slide-down"; easing: "easeInOut" } = {
      inSec: hasAiTiming ? (pl as any).inSec : inAt(),
      outSec: (pl as any).outSec !== undefined ? ((pl as any).outSec as number | null) : null,
      enter: (["fade", "slide-up", "scale", "border-first"].includes((pl as any).enter) ? (pl as any).enter : "fade"),
      exit: (["fade", "slide-down"].includes((pl as any).exit) ? (pl as any).exit : "fade"),
      easing: "easeInOut",
    };
    try {
      if (pl.kind === "highlight") {
        const poly = await fetchPolygon(pl.place);
        if (!poly?.geojson) continue;
        const moodId = MOOD_PRESET[(pl.mood || plan.mood || "neutral").toLowerCase()] ?? "neutral";
        const preset = HIGHLIGHT_PRESETS.find((p) => p.id === moodId) ?? HIGHLIGHT_PRESETS[0];
        const fill = pl.fill ?? (preset.style.fillType ?? "solid");
        add(createLayer("highlight", {
          // `name` labels it in the editor panel; `place` is the ON-MAP centroid
          // label and is OPT-IN (only when the plan asks for one) so a country
          // isn't named again on top of a title that already names it.
          name: pl.place, place: pl.label ?? "", countryISO: poly.iso, flagISO: poly.iso, geojson: cleanCountryGeo(poly.geojson),
          fillType: fill, fillColor: preset.style.fillColor, fillOpacity: fill === "flag" ? 0.85 : preset.style.fillOpacity,
          borderColor: preset.style.borderColor, glowColor: preset.style.glowColor,
          animation: preset.animationStyle === "pulse-in" ? "pulse" : preset.animationStyle, timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "label") {
        const g = await geocode(pl.place); if (!g) continue;
        add(createLayer("label", { text: (pl.text || g.name).toUpperCase(), sub: pl.sub ?? "", variant: pl.variant ?? "pin", anchor: { kind: "coord", lon: g.lon, lat: g.lat }, timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "route") {
        const a = await geocode(pl.from), b = await geocode(pl.to); if (!a || !b) continue;
        const transport = (["driving", "walking", "cycling", "boat", "aircraft"].includes(pl.transport ?? "") ? pl.transport! : "driving");
        // Aircraft bows into a flight arc; everything else is a great-circle path.
        const coords = transport === "aircraft" ? flightArc([a.lon, a.lat], [b.lon, b.lat]) : greatCircle([a.lon, a.lat], [b.lon, b.lat]);
        add(createLayer("route", {
          name: `${pl.from} → ${pl.to}`, from: { lon: a.lon, lat: a.lat, name: pl.from }, to: { lon: b.lon, lat: b.lat, name: pl.to },
          transport,
          coordinates: coords, icon: (pl.icon as any) ?? "car", cameraMode: (pl.cameraMode as any) ?? "follow", timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "flag") {
        const g = await geocode(pl.place); if (!g) continue;
        add(createLayer("flag", { iso: g.iso ?? "FR", anchor: { lon: g.lon, lat: g.lat }, timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "title") {
        const tl = createLayer("title", { text: (pl.text || plan.title).toUpperCase(), sub: pl.sub ?? plan.subtitle ?? "", template: (pl.template as any) ?? "impact", position: (pl.position as any) ?? "bottom", timing, ...(pl.style ?? {}) });
        if (hasAiTiming) aiTimedTitleIds.add(tl.id);
        add(tl, pl.style);
      } else if (pl.kind === "chart") {
        add(createLayer("chart", { variant: pl.variant ?? "counter", value: pl.value ?? 0, prefix: pl.prefix ?? "", suffix: pl.suffix ?? "", name: pl.label ?? "stat", timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "marker") {
        // `between` drops the symbol on the contested border (midpoint of two
        // places) — exactly the "swords on the India–Pakistan border" beat.
        let lon: number | undefined, lat: number | undefined;
        if (Array.isArray(pl.between) && pl.between.length === 2) {
          const [ga, gb] = await Promise.all([geocode(pl.between[0]), geocode(pl.between[1])]);
          if (ga && gb) { lon = (ga.lon + gb.lon) / 2; lat = (ga.lat + gb.lat) / 2; }
        }
        if (lon === undefined && pl.place) { const g = await geocode(pl.place); if (g) { lon = g.lon; lat = g.lat; } }
        if (lon === undefined || lat === undefined) continue;
        add(createLayer("marker", { name: pl.label || pl.icon || "marker", anchor: { lon, lat }, icon: (pl.icon as any) ?? "pin", emoji: pl.emoji ?? "", label: pl.label ?? "", timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "annotation") {
        const g = await geocode(pl.place); if (!g) continue;
        add(createLayer("annotation", { name: pl.text || pl.place, anchor: { lon: g.lon, lat: g.lat }, text: (pl.text || g.name), sub: pl.sub ?? "", side: (pl.side as any) ?? "auto", timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "connections") {
        const places = (pl.places ?? []).slice(0, 12);
        const geos = (await Promise.all(places.map((s) => geocode(s)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof geocode>>>[];
        const hubG = pl.hub ? await geocode(pl.hub) : null;
        if (geos.length < (hubG ? 1 : 2)) continue;
        const mode = hubG ? (pl.mode ?? "hub") : "chain";
        add(createLayer("connections", { name: "Network", mode, hub: hubG ? { lon: hubG.lon, lat: hubG.lat, name: hubG.name } : null, points: geos.map((g) => ({ lon: g.lon, lat: g.lat, name: g.name })), timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "spotlight") {
        const g = await geocode(pl.place); if (!g) continue;
        add(createLayer("spotlight", { name: `Spotlight ${pl.place}`, anchor: { lon: g.lon, lat: g.lat }, timing, ...(pl.style ?? {}) }), pl.style);
      } else if (pl.kind === "radius") {
        const g = await geocode(pl.place); if (!g) continue;
        const rKm = Math.max(0.1, Math.min(20000, Number(pl.radiusKm) || 500));
        add(createLayer("radius", {
          name: `${pl.place} · ${rKm} km`, center: { lon: g.lon, lat: g.lat, name: g.name },
          radiusKm: rKm, rings: Math.max(1, Math.min(5, pl.rings ?? 3)),
          mode: pl.mode ?? "grow", ...(pl.color ? { color: tameColor(pl.color) } : {}),
          labelUnit: pl.unit ?? "km", timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "timestamp") {
        const isCounter = pl.dayStart != null || pl.dayEnd != null;
        add(createLayer("timestamp", {
          name: "Timestamp",
          mode: pl.text ? "fixed" : isCounter ? "day-counter" : "date-range",
          ...(pl.start ? { startDate: pl.start } : {}), ...(pl.end ? { endDate: pl.end } : {}),
          ...(pl.format ? { format: pl.format } : {}),
          ...(pl.dayStart != null ? { dayStart: pl.dayStart } : {}), ...(pl.dayEnd != null ? { dayEnd: pl.dayEnd } : {}),
          ...(pl.prefix ? { prefix: pl.prefix } : {}), ...(pl.text ? { fixedText: pl.text } : {}),
          ...(pl.position ? { position: pl.position } : {}),
          // The ticker should usually run the WHOLE scene, not enter late.
          timing: { ...timing, inSec: Math.min(timing.inSec, 0.6) },
          ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "atmosphere") {
        add(createLayer("atmosphere", {
          name: `Atmosphere · ${pl.effect}`, effect: pl.effect ?? "snow",
          density: Math.max(0, Math.min(1, pl.density ?? 0.45)),
          ...(pl.wind != null ? { wind: Math.max(-2, Math.min(2, pl.wind)) } : {}),
          timing: { ...timing, inSec: 0.2 }, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "sticker") {
        // AI-authored SVG b-roll → an image layer with a data URL. Rendered via
        // <img>, so script execution is impossible; the sanitizer is belt-and-
        // braces against active content and external fetches.
        const svg = sanitizeStickerSvg(pl.svg);
        if (!svg) continue;
        const g = pl.place ? await geocode(pl.place) : null;
        const anchor = g ? { kind: "coord", lon: g.lon, lat: g.lat } : { kind: "screen", pos: "center" };
        add(createLayer("image", {
          name: pl.label ? `✦ ${pl.label}` : "✦ AI sticker",
          url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
          anchor, sizePx: Math.max(60, Math.min(420, pl.sizePx ?? 150)), rounded: false,
          timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "conflict") {
        // The headline composite: two countries, the real frontier, swords on it.
        const [pa, pb] = await Promise.all([fetchPolygon(pl.a), fetchPolygon(pl.b)]);
        if (!pa?.geojson || !pb?.geojson) continue;
        const geoA = cleanCountryGeo(pa.geojson), geoB = cleanCountryGeo(pb.geojson);
        const colA = pl.colorA ?? "#d23b3b", colB = pl.colorB ?? "#3b74d2", bcol = pl.border ?? "#ffd23f";
        // Two opposing-colour highlights (border-first reveal).
        add(createLayer("highlight", { name: pl.a, place: "", countryISO: pa.iso, flagISO: pa.iso, geojson: geoA, fillType: "solid", fillColor: colA, fillOpacity: 0.4, borderColor: "#ffffff", borderWidth: 2.5, glowColor: colA, glowWidth: 26, animation: "border-first", timing }), { fillColor: colA, glowColor: colA });
        add(createLayer("highlight", { name: pl.b, place: "", countryISO: pb.iso, flagISO: pb.iso, geojson: geoB, fillType: "solid", fillColor: colB, fillOpacity: 0.4, borderColor: "#ffffff", borderWidth: 2.5, glowColor: colB, glowWidth: 26, animation: "border-first", timing: { ...timing, inSec: Math.round((timing.inSec + 0.25) * 100) / 100 } }), { fillColor: colB, glowColor: colB });
        // The REAL shared border, drawn glowing in its own colour…
        const border = sharedBorderLine(geoA, geoB);
        const swordPts = border.length >= 2 ? sampleAlong(border, Math.max(1, Math.min(8, pl.swords ?? 4)))
          : [[(centroidOf(geoA)[0] + centroidOf(geoB)[0]) / 2, (centroidOf(geoA)[1] + centroidOf(geoB)[1]) / 2] as [number, number]];
        if (border.length >= 2) {
          add(createLayer("route", { name: `${pl.a}–${pl.b} frontier`, from: { lon: border[0][0], lat: border[0][1] }, to: { lon: border[border.length - 1][0], lat: border[border.length - 1][1] }, transport: "driving", coordinates: border, icon: "none", showLine: true, color: bcol, width: 5, glow: 1.1, dashStyle: "dashed", reveal: "draw", cameraMode: "frame", timing: { ...timing, inSec: Math.round((timing.inSec + 0.5) * 100) / 100 } }), { color: bcol, glow: 1.1 });
        }
        // …and crossing swords spaced ALONG it.
        swordPts.forEach((pt, k) => add(createLayer("marker", { name: "clash", anchor: { lon: pt[0], lat: pt[1] }, icon: (pl.icon as any) ?? "swords", sizePx: 84, color: "#ff3030", glow: 0.85, ring: false, animation: "pop", timing: { inSec: Math.round((timing.inSec + 0.8 + k * 0.18) * 100) / 100, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" } }), { color: "#ff3030" }));
        const bb = bboxOfGeos([geoA, geoB]); if (bb) frameBbox = bb;
      } else if (pl.kind === "regionFlags") {
        const region = resolveRegion(pl.region);
        if (!region) continue;
        if (region.countries.length) {
          const list = region.countries.slice(0, 60);
          list.forEach((c, k) => add(createLayer("flag", {
            name: c.name, iso: c.iso, anchor: { lon: c.lon, lat: c.lat }, sizePx: 78, showCode: false,
            timing: { inSec: Math.round((0.12 * dur + (k / list.length) * 0.62 * dur) * 100) / 100, outSec: null, enter: "scale", exit: "fade", easing: "easeInOut" },
          })));
        }
        frameBbox = region.bbox;
      } else if (pl.kind === "choropleth") {
        // Data-bound choropleth: fill each place with a colour proportional to its value.
        const places = (pl.places ?? []).slice(0, 30);
        const values = (pl.values ?? []).map(Number);
        const labels = pl.labels ?? [];
        if (!places.length || !values.length) continue;
        const vMin = Math.min(...values), vMax = Math.max(...values);
        const colorLow = (pl.style as any)?.colorLow ?? "#e3f2fd";
        const colorHigh = (pl.style as any)?.colorHigh ?? "#0d47a1";
        const entries: unknown[] = [];
        // Fetch polygons in parallel, build ChoroplethEntry list with pre-computed colours.
        const polys = await Promise.all(places.map((p) => fetchPolygon(p)));
        for (let ci = 0; ci < places.length; ci++) {
          const poly = polys[ci];
          const val = values[ci] ?? 0;
          const t = vMax > vMin ? (val - vMin) / (vMax - vMin) : 0.5;
          entries.push({
            place: places[ci], value: val, label: labels[ci] ?? "",
            iso: poly?.iso ?? "", color: lerpColor(colorLow, colorHigh, t),
            geojson: poly?.geojson ?? null,
          });
        }
        add(createLayer("choropleth", {
          name: pl.metric ?? "Data",
          metric: pl.metric ?? "", unit: pl.unit ?? "",
          colorLow, colorHigh, showLegend: true,
          data: entries, timing,
          ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "truesize") {
        // SCALE METAPHOR: overlay source polygon on target location. The viewer
        // instantly grasps relative size — "this is how big X is compared to Y".
        const [srcPoly, tgtPoly] = await Promise.all([fetchPolygon(pl.source), fetchPolygon(pl.target)]);
        const tgtGeo = await geocode(pl.target);
        if (!srcPoly?.geojson || !tgtGeo) continue;
        // Translate source polygon's centroid onto the target's centroid.
        const srcCentroid = centroidOf(cleanCountryGeo(srcPoly.geojson));
        const dLon = tgtGeo.lon - srcCentroid[0], dLat = tgtGeo.lat - srcCentroid[1];
        const srcTranslated = offsetGeoJSON(cleanCountryGeo(srcPoly.geojson), dLon, dLat);
        // Target highlight (home context).
        if (tgtPoly?.geojson) {
          add(createLayer("highlight", { name: pl.target, place: "", geojson: cleanCountryGeo(tgtPoly.geojson), fillType: "solid", fillColor: "#3b74d2", fillOpacity: 0.25, borderColor: "#4a8fe8", borderWidth: 2, glowColor: "#3b74d2", glowWidth: 18, animation: "border-first", timing }));
        }
        // Source overlay — same colour family, more prominent, labelled.
        add(createLayer("highlight", { name: pl.source, place: pl.label ?? pl.source, geojson: srcTranslated, fillType: "solid", fillColor: "#d23b3b", fillOpacity: 0.45, borderColor: "#ff5a44", borderWidth: 2.5, glowColor: "#d23b3b", glowWidth: 22, animation: "border-first", timing: { ...timing, inSec: Math.round((timing.inSec + 0.4) * 100) / 100 } }), pl.style);
        // Frame camera on target.
        if (tgtPoly?.geojson) { const bb = bboxOfGeos([cleanCountryGeo(tgtPoly.geojson)]); if (bb) frameBbox = bb; }
      } else if (pl.kind === "character") {
        // CHARACTER THREAD: animated chain of stops along a named person's journey.
        const places = (pl.places ?? []).slice(0, 10);
        const geos = (await Promise.all(places.map((p) => geocode(p)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof geocode>>>[];
        if (geos.length < 2) continue;
        const icon = (pl.icon as any) ?? "pin";
        // The full journey as a drawn chain.
        add(createLayer("connections", { name: `${pl.name} journey`, mode: "chain", hub: null, points: geos.map((g) => ({ lon: g.lon, lat: g.lat, name: g.name })), color: "#f5c842", width: 4, glow: 0.7, reveal: "draw", stagger: 0.6, dots: true, dotColor: "#f5c842", timing }));
        // Staggered markers at each stop.
        geos.forEach((g, k) => add(createLayer("marker", { name: k === 0 ? `${pl.name} departs` : k === geos.length - 1 ? `${pl.name} arrives` : `${pl.name} at ${g.name}`, anchor: { lon: g.lon, lat: g.lat }, icon, sizePx: k === geos.length - 1 ? 100 : 72, color: k === geos.length - 1 ? "#f5c842" : "#ffffff", glow: 0.5, ring: k === geos.length - 1, animation: "pop", timing: { inSec: Math.round((timing.inSec + k * 0.45) * 100) / 100, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" } })));
        // Character name label at final destination.
        const last = geos[geos.length - 1];
        add(createLayer("label", { text: pl.name.toUpperCase(), sub: last.name, variant: "card", anchor: { kind: "coord", lon: last.lon, lat: last.lat }, timing: { ...timing, inSec: Math.round((timing.inSec + geos.length * 0.45) * 100) / 100 } }));
      } else if (pl.kind === "bubbles") {
        // PROPORTIONAL SYMBOL MAP — size encodes value via sqrt scaling for equal area.
        const places = (pl.places ?? []).slice(0, 24);
        const values = (pl.values ?? []).map(Number);
        if (!places.length || !values.length) continue;
        const maxVal = Math.max(...values.filter(isFinite));
        const color = pl.color ?? DEFAULT_ACCENT;
        const stagger = pl.stagger ?? 0; // seconds between successive bubble reveals
        const geos = await Promise.all(places.map((p) => geocode(p)));
        const entries: unknown[] = geos.map((g, i) => ({
          place: places[i], value: values[i] ?? 0,
          label: pl.labels?.[i] ?? "",
          lon: g?.lon ?? 0, lat: g?.lat ?? 0,
          // sqrt scaling: equal area = equal value (perceptually honest)
          sizePx: g ? Math.round(20 + 120 * Math.sqrt(Math.max(0, values[i] ?? 0) / Math.max(1, maxVal))) : 0,
          color,
          // entryDelay drives per-bubble staggered reveal in BubbleView
          entryDelay: stagger > 0 ? Math.round(stagger * i * 100) / 100 : 0,
        })).filter((e: any) => e.lon !== 0 && e.sizePx > 0);
        if (!entries.length) continue;
        add(createLayer("bubble", {
          name: pl.metric ?? "Data",
          metric: pl.metric ?? "", unit: pl.unit ?? "",
          color, showLabels: true, showLegend: true, animate: "grow",
          data: entries, timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "flows") {
        // WEIGHTED FLOW — like connections but arc thickness = magnitude.
        const places = (pl.places ?? []).slice(0, 12);
        const weights = (pl.weights ?? []).map(Number);
        const geos = (await Promise.all(places.map((s) => geocode(s)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof geocode>>>[];
        const hubG = pl.hub ? await geocode(pl.hub) : null;
        if (geos.length < (hubG ? 1 : 2)) continue;
        const maxW = Math.max(1, ...weights);
        const mode = hubG ? (pl.mode ?? "hub") : "chain";
        add(createLayer("connections", {
          name: "Flows", mode, hub: hubG ? { lon: hubG.lon, lat: hubG.lat, name: hubG.name } : null,
          points: geos.map((g, i) => ({ lon: g.lon, lat: g.lat, name: g.name, weight: weights[i] != null ? (weights[i] / maxW) : undefined })),
          color: pl.color ?? "#6E7BFF", width: 8, glow: 0.7, reveal: "draw", stagger: 0.4, dots: true, pulse: true,
          timing, ...(pl.style ?? {}),
        }), pl.style);
      } else if (pl.kind === "earthlayer") {
        // EARTH OBSERVATION — NASA GIBS WMTS raster overlay. Free, no auth required.
        const dsKey = (pl.dataset ?? "true-color") as string;
        const meta = GIBS_LAYER[dsKey];
        if (!meta) continue;
        const resolvedDate = resolveGibsDate(pl.date, meta.static);
        const layerData: Record<string, unknown> = {
          name: pl.label ?? meta.label,
          datasetId: meta.id,
          date: resolvedDate,
          tileFormat: meta.fmt,
          tileMatrix: meta.matrix,
          maxzoom: meta.maxzoom,
          opacity: Math.min(1, Math.max(0, pl.opacity ?? 0.75)),
          label: pl.label ?? meta.label,
          attribution: meta.attribution,
          timing,
          ...(pl.style ?? {}),
        };
        // Optional compare layer for before/after change detection.
        if (pl.compareDataset) {
          const cmKey = pl.compareDataset as string;
          const cmMeta = GIBS_LAYER[cmKey];
          if (cmMeta) {
            layerData.compareDatasetId = cmMeta.id;
            layerData.compareDate = resolveGibsDate(pl.compareDate, cmMeta.static);
            layerData.compareMaxzoom = cmMeta.maxzoom;
          }
        }
        add(createLayer("earthlayer", layerData), pl.style);
        // Force satellite basemap — earth-obs data looks best over real imagery.
        if (!plan.basemapStyle || plan.basemapStyle === "dark" || plan.basemapStyle === "light") {
          plan.basemapStyle = "satellite";
        }
      }
      withinBeatCount++;
      oi++;
    } catch { /* skip layer that fails to resolve */ }
  }

  // A composite asked to frame a whole bbox (region / both countries) — override
  // the single-point camera so the whole story is in shot the entire time.
  if (frameBbox) {
    const fc = cameraForBbox(frameBbox);
    (cam as any).end = { lon: fc.lon, lat: fc.lat, zoom: fc.zoom, pitch: 0, bearing: 0 };
    (cam as any).start = { lon: fc.lon, lat: fc.lat, zoom: Math.max(1.3, fc.zoom - 0.55), pitch: 0, bearing: 0 };
    (cam as any).waypoints = [];
    if (!(plan.motion && MOTIONS.includes(plan.motion)) || plan.motion === "fly-in") (cam as any).style = "fly-in";
  }

  // Ensure SOME on-screen content exists if the plan resolved to nothing.
  if (!layers.some((l) => l.type !== "camera")) {
    layers.push(createLayer("label", { text: (plan.title || focus?.name || "PLACE").toUpperCase(), sub: plan.subtitle ?? "", variant: "pin", anchor: { kind: "coord", lon: focus?.lon ?? 0, lat: focus?.lat ?? 20 }, timing: { inSec: 1, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" } }));
  }

  // Animation hierarchy: the chosen layer DRIVES the camera (route → travelling
  // shot; highlight → reveal) via framesCamera — decoupled from z-order — and is
  // also promoted to the top of the stack. Camera layer stays the default author.
  if (plan.priority === "route" || plan.priority === "highlight") {
    const i = layers.findIndex((l) => l.type === plan.priority);
    if (i >= 0) {
      (layers[i] as any).framesCamera = true;
      if (i > 0) { const [d] = layers.splice(i, 1); layers.unshift(d); }
    }
  }

  // Kill redundant repeated text (no place named three times over).
  const deduped = dedupeText(layers);

  // STORY MODE: sequence the chapter titles across the SINGLE timeline so they
  // play one after another as the camera journeys through the beats (each
  // appears, holds, then yields to the next) — turning the fly-through into a
  // narrative. When the AI authored EVERY title's timing window itself (per the
  // T1/T4 doctrine those are already non-overlapping and camera-synced), trust
  // it; only fall back to even slices when any title lacks explicit timing,
  // because a mixed set could overlap.
  if (opts.story) {
    const titles = deduped.filter((l) => l.type === "title");
    const n = titles.length;
    const allAiTimed = n > 0 && titles.every((t) => aiTimedTitleIds.has(t.id));
    if (!allAiTimed) {
      titles.forEach((t, i) => {
        const start = 0.06 * dur + (i / Math.max(1, n)) * 0.86 * dur;
        const end = 0.06 * dur + ((i + 1) / Math.max(1, n)) * 0.86 * dur;
        (t as any).timing = { inSec: Math.round(start * 100) / 100, outSec: n > 1 ? Math.round((end - 0.4) * 100) / 100 : null, enter: "slide-up", exit: "fade", easing: "easeInOut" };
      });
    }
  }

  // Art-direct the whole piece: pick a cohesive palette+font theme from the
  // story's mood (or Claude's explicit choice) and recolour every overlay to it
  // so titles, labels, routes, charts and highlights all share one look —
  // instead of every layer defaulting to the same iris blue.
  // Clone the preset (never mutate the shared THEME_PRESETS object) and let a
  // template override fonts so each curated piece has its own typographic voice.
  const theme: Theme = { ...resolveTheme(plan.palette, plan.mood) };
  if (plan.fontDisplay) theme.fontDisplay = plan.fontDisplay;
  if (plan.fontBody) theme.fontBody = plan.fontBody;
  project.composition.theme = theme;
  // Coherent LOOK: a story-appropriate cinematic grade (clean for data, antique
  // for history, noir for conflict, …) layered UNDER the AI's explicit look so
  // the model can still art-direct, but a terse prompt still gets a designed grade.
  project.composition.look = { ...project.composition.look, ...resolveLook(plan, story, styleKey) } as any;
  if (plan.look) project.composition.look = { ...project.composition.look, ...plan.look } as any;
  // Creative 3D map style (optional) — transforms the map into a distinctive 3D
  // world (holographic / neon / miniature / blueprint / molten …), overriding the
  // basemap recolour + look + camera pitch. Applied LAST so it wins.
  const m3d = (plan as any).map3dStyle ? map3dStyleById(String((plan as any).map3dStyle)) : undefined;
  if (m3d) {
    project.composition.basemap = { ...project.composition.basemap, ...m3d.basemap, style3d: m3d.id } as any;
    project.composition.look = { ...project.composition.look, ...m3d.look } as any;
    if (typeof m3d.pitch === "number") (cam as any).end.pitch = m3d.pitch;
  }
  // INVENTED 3D world — the AI art-directs a bespoke look (overrides any preset).
  // Buildings auto-enable so the custom colours actually show at city scale.
  // Colors pass through the constrained-color clamp first (no neon worlds).
  const m3dc = tameStyleColors((plan as any).map3dCustom);
  if (plan.look) tameStyleColors(plan.look as Record<string, unknown>);
  if (m3dc && typeof m3dc === "object") {
    const bmPatch: Record<string, unknown> = { style3d: "custom" };
    for (const k of ["landColor", "waterColor", "buildingColor", "buildingOpacity", "buildingHeightMult", "buildingGradient", "boundaryGlow", "terrain", "terrainStrength"]) {
      if (m3dc[k] !== undefined) bmPatch[k] = m3dc[k];
    }
    if (m3dc.buildingColor && bmPatch.buildings3d === undefined) bmPatch.buildings3d = true;
    project.composition.basemap = { ...project.composition.basemap, ...bmPatch } as any;
    const lookPatch: Record<string, unknown> = {};
    for (const k of ["bgColor", "tintColor", "tintOpacity", "vignette"]) if (m3dc[k] !== undefined) lookPatch[k] = m3dc[k];
    project.composition.look = { ...project.composition.look, ...lookPatch } as any;
    if (typeof m3dc.pitch === "number") (cam as any).end.pitch = Math.max(0, Math.min(85, m3dc.pitch));
  }
  // Populate composition narration so the renderer can show it as a caption overlay.
  if (Array.isArray((plan as any).narration) && (plan as any).narration[0]) {
    project.composition.narration = String((plan as any).narration[0]);
    project.composition.look.showCaptions = true;
  }
  // Extract journalism-grade source citations from the AI's fact-checked brief.
  // These render as a subtle "Source:" overlay in the bottom-right corner, giving
  // the animation the credibility of a Vox / Bloomberg / FT data graphic.
  const briefFacts = (plan as any).brief?.facts;
  if (Array.isArray(briefFacts)) {
    const sources = Array.from(new Set(briefFacts.map((f: any) => f.source).filter(Boolean))) as string[];
    if (sources.length) project.composition.citations = sources.slice(0, 4);
  }
  project.composition.layers = deduped.map((l) => {
    if (l.type === "camera") return l;
    const themed = recolorLayer(l, theme);
    // A template's explicit `style` (colours included) wins over the palette
    // recolour; the palette only fills fields the template left unspecified.
    const st = styleById.get(l.id);
    return st ? ({ ...themed, ...st } as Layer) : themed;
  });

  // For single-scene animations with multiple AI-authored narration beats,
  // store each beat's text + start time so the renderer can show them one at a
  // time as the camera arrives — Vox-style beat-timed documentary captions.
  const narrationArr: string[] = Array.isArray((plan as any).narration)
    ? (plan as any).narration.filter(Boolean) : [];
  if (narrationArr.length > 1) {
    // Derive beat start times from title layers (sorted by inSec) — these are the
    // beat markers the AI placed; fall back to even distribution if titles are scarce.
    const sortedTitles = project.composition.layers
      .filter((l) => l.type === "title")
      .slice()
      .sort((a, b) => ((a as any).timing?.inSec ?? 0) - ((b as any).timing?.inSec ?? 0));
    const beatStarts: number[] = sortedTitles.slice(0, narrationArr.length)
      .map((l) => (l as any).timing?.inSec ?? 0);
    // Pad with even distribution if the AI put fewer titles than narration lines.
    while (beatStarts.length < narrationArr.length) {
      beatStarts.push(Math.round((beatStarts.length / narrationArr.length) * dur * 10) / 10);
    }
    // Typed since narrationLines joined the Composition schema — previously an
    // `as any` write that every parseProject() round-trip silently stripped.
    project.composition.narrationLines = narrationArr.map((text, i) => ({
      text, startSec: beatStarts[i] ?? 0,
    }));
    project.composition.look.showCaptions = true;
  }

  // A story is ONE continuous timeline — beats are sequenced INSIDE this single
  // composition (titles sliced, beat-arrival layer timing, narrationLines).
  // Never auto-split into scenes; the user adds scenes manually when they want.
  return ProjectSchema.parse(project);
}

/* ── Heuristic fallback plan (no API key) — VISUAL-FIRST, concept-aware ──────
 * Mirrors the LLM's visual vocabulary so the headline prompts ("conflict on the
 * India–Pakistan border", "every country in Europe with flags", "growing
 * economy of X") produce the right animation even with no model configured. */
/** Mood → a distinct basemap style + cinematic look, so different ideas don't
 *  all come out as the same dark map. This is the variety the heuristic lacked. */
function styleForMood(mood: string): { basemapStyle: string; look: Record<string, unknown> } {
  switch (mood) {
    case "historical": return { basemapStyle: "light", look: { mapFilter: "antique", mapFilterAmount: 0.85, texture: "paper", textureOpacity: 0.6, vignette: 0.52, grain: 0.13 } };
    case "empire": return { basemapStyle: "dark", look: { mapFilter: "antique", mapFilterAmount: 0.55, vignette: 0.5, grain: 0.13 } };
    case "conflict": return { basemapStyle: "dark", look: { mapFilter: "noir", mapFilterAmount: 0.5, vignette: 0.56, grain: 0.2 } };
    case "arctic": return { basemapStyle: "light", look: { mapFilter: "cool", mapFilterAmount: 0.5, vignette: 0.35, grain: 0.06 } };
    case "trade": return { basemapStyle: "dark", look: { vignette: 0.4, grain: 0.1, gradeShadow: "#0c3b3a", gradeShadowAmt: 0.3 } };
    case "political": return { basemapStyle: "dark", look: { mapFilter: "duotone", mapFilterAmount: 0.4, vignette: 0.42, grain: 0.1 } };
    default: return { basemapStyle: "dark", look: { vignette: 0.4, grain: 0.1 } };
  }
}

function heuristicPlan(idea: string): Plan {
  const t = idea.toLowerCase();
  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  const sub = idea.trim().slice(0, 44);

  // 1) "every / all countries in <region>" → regionFlags (flags + framed camera)
  if ((/\b(every|all|each)\b/.test(t) && /\bcountr/.test(t)) || (/\bcountries\b/.test(t) && /\bflag/.test(t))) {
    const region = detectRegion(idea);
    if (region) return { title: region.label.toUpperCase().slice(0, 30), subtitle: "", durationSec: 10, aspect: "16:9", basemapStyle: "dark", focus: region.label, mood: "neutral", motion: "fly-in", palette: "Default", priority: "camera", layers: [{ kind: "regionFlags", region: region.key }] };
  }

  // 1b) Explicit MULTI-ENTITY list ("highlight France, Germany, Spain and Italy",
  //     or a continent the parser expands) → ONE highlight per place. Fixes the
  //     old "France only" failure. Gated on the intent engine so single places,
  //     routes and region-flags are untouched.
  {
    const it = interpret(idea);
    if (!it.route && (it.action === "highlight" || it.action === "mixed") && it.locations.length >= 2) {
      const places = it.locations.slice(0, 18);
      return {
        title: it.expandedFrom ? it.expandedFrom.toUpperCase().slice(0, 30) : "",
        subtitle: "", durationSec: it.durationSec, aspect: "16:9", basemapStyle: "dark",
        focus: it.context || places[0], mood: "neutral", motion: it.context ? "zoom-out" : "fly-in",
        palette: "Default", priority: "highlight",
        layers: places.map((p) => ({ kind: "highlight", place: p, fill: "solid" }) as PlanLayer),
      };
    }
  }

  // 2) clash between two places → conflict composite (highlights + border + swords)
  const conflictWord = /\b(conflict|war|invasion|clash|tension|dispute|fighting|frontline|standoff|civil war|military)\b/.test(t);
  const pair = idea.match(/between\s+([\w''-]+(?:\s+[\w''-]+){0,2}?)\s+and\s+([\w''-]+(?:\s+[\w''-]+){0,2})/i)
    || idea.match(/\b([\w''-]+(?:\s+[\w''-]+){0,2}?)\s+(?:vs\.?|versus)\s+([\w''-]+(?:\s+[\w''-]+){0,2})/i);
  if (conflictWord && pair) {
    const a = titleCase(pair[1]), b = titleCase(pair[2]);
    return { title: "FRONTLINE", subtitle: `${a} – ${b}`, durationSec: 9, aspect: "16:9", basemapStyle: "dark", focus: a, mood: "conflict", motion: "zoom-out", palette: "Conflict Red", priority: "highlight",
      look: { vignette: 0.5, grain: 0.18, mapFilter: "noir", mapFilterAmount: 0.45 },
      layers: [{ kind: "conflict", a, b, swords: 4 }, { kind: "title", text: "FRONTLINE", sub: `${a} – ${b}`, template: "impact", position: "bottom" }] };
  }

  // ── EXPANSION / CONTRACTION → a highlight that GROWS (or shrinks) from origin ──
  const arch0 = matchArchetype(idea);
  if (arch0 && (arch0.name.startsWith("Expansion") || arch0.name.startsWith("Contraction"))) {
    const capsX = (idea.match(/\b([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,2})\b/g) || []).filter((c) => !/^(The|In|Of|And|At|On|How|Show|Why|When|Map|Rise)$/.test(c));
    const place = (capsX.sort((a, b) => b.length - a.length)[0] || idea.split(/[.,;\n]/)[0]).trim().slice(0, 50);
    const growing = arch0.name.startsWith("Expansion");
    return {
      title: place.toUpperCase().slice(0, 30), subtitle: growing ? "Expansion" : "Contraction", durationSec: 9, aspect: "16:9",
      basemapStyle: "dark", focus: place, mood: "historical", motion: "push-in", palette: "Vox Editorial", priority: "highlight",
      look: { vignette: 0.45, grain: 0.14 },
      layers: [
        { kind: "highlight", place, fill: "solid", style: { animation: growing ? "grow" : "shrink", growSpanSec: 4, borderDash: "dashed" } } as PlanLayer,
        { kind: "title", text: place.toUpperCase(), sub: growing ? "At its greatest extent" : "Receding", template: "impact", position: "bottom" },
      ],
    };
  }

  // mood + focus (a single anchor place pulled from the idea)
  const mood = conflictWord ? "conflict"
    : /empire|dynasty|kingdom/.test(t) ? "empire"
    : /history|ancient|medieval|century|\b1[0-9]{3}\b/.test(t) ? "historical"
    : /trade|econom|export|silk|shipping/.test(t) ? "trade"
    : /election|vote|politic|parliament/.test(t) ? "political"
    : /climate|arctic|ice|warming|glacier/.test(t) ? "arctic"
    : "neutral";
  const m = idea.match(/\b(?:in|of|about|over|across|through|from)\s+([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,3})/);
  const caps = idea.match(/[A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,3}/g) || [];
  const focus = (m?.[1] || caps.sort((a, b) => b.length - a.length)[0] || idea.split(/[.,;\n]/)[0]).trim().slice(0, 50);

  // 3) growth / economy → a highlight + a line chart trending UP
  if (/\b(grow|growth|growing|booming|boom|rising|surg|gdp|economy|economic|expansion)\b/.test(t)) {
    const up = [18, 24, 29, 41, 58, 79].map((v, i) => ({ label: `${2019 + i}`, value: v }));
    return { title: focus.toUpperCase().slice(0, 30), subtitle: sub, durationSec: 8, aspect: "16:9", basemapStyle: "dark", focus, mood: "trade", motion: "push-in", palette: "Trade Green", priority: "highlight",
      layers: [{ kind: "highlight", place: focus, fill: "solid", mood: "trade" }, { kind: "chart", variant: "line", label: "growth", style: { series: up } }, { kind: "title", text: focus.toUpperCase(), sub, template: "impact", position: "bottom" }] };
  }

  // 4) a disaster / strike at one spot → a symbol marker
  if (/\b(earthquake|nuclear|disaster|explosion|bomb|meltdown|erupt|volcano|wildfire|attack|strike)\b/.test(t)) {
    const icon = /nuclear|radiation|meltdown/.test(t) ? "radiation" : /volcano|erupt|fire|wildfire/.test(t) ? "fire" : "explosion";
    return { title: focus.toUpperCase().slice(0, 30), subtitle: sub, durationSec: 8, aspect: "16:9", basemapStyle: "dark", focus, mood: "conflict", motion: "push-in", palette: "Conflict Red", priority: "camera",
      look: { vignette: 0.5, grain: 0.2 },
      layers: [{ kind: "marker", place: focus, icon, style: { sizePx: 150 } }, { kind: "title", text: focus.toUpperCase(), sub, template: "impact", position: "bottom" }] };
  }

  // ── MOVEMENT / journey / invasion / migration → a route that DRAWS on ──
  const jp = idea.match(/\bfrom\s+([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,2})\s+to\s+([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,2})/);
  if (jp || (arch0 && arch0.name.startsWith("Movement"))) {
    const from = jp ? titleCase(jp[1]) : (caps[0] || focus);
    const to = jp ? titleCase(jp[2]) : (caps[1] || focus);
    const air = /flight|flew|\bfly\b|plane|airl/.test(t), sea = /sail|voyage|\bship\b|naval|fleet|\bsea\b/.test(t);
    return { title: "", subtitle: "", durationSec: 11, aspect: "16:9", basemapStyle: air || sea ? "satellite" : "dark", terrain: false, focus: to, mood: "neutral", motion: "fly-in", palette: "Default", priority: "route", look: { vignette: 0.42, grain: 0.1 },
      layers: [{ kind: "route", from, to, transport: air ? "aircraft" : sea ? "boat" : "driving", icon: air ? "plane" : sea ? "boat" : "car", cameraMode: "chase" } as PlanLayer] };
  }

  // ── SPREAD / diffusion / network / alliances → connection arcs (chain or hub) ──
  if (arch0 && (arch0.name.startsWith("Spread") || arch0.name.startsWith("Influence"))) {
    const hub = arch0.name.startsWith("Influence");
    const places = caps.filter((c) => !/^(The|In|Of|And|At|On|How|Show|Why|When|Map|Rise|A|An|From|To)$/.test(c)).slice(0, 6);
    if (places.length >= 2) {
      const sm = styleForMood(mood);
      return { title: focus.toUpperCase().slice(0, 30), subtitle: sub, durationSec: 11, aspect: "16:9", basemapStyle: sm.basemapStyle as any, terrain: false, focus, mood, motion: "zoom-out", palette: MOOD_THEME[mood], priority: "camera", look: sm.look as any,
        layers: [{ kind: "connections", hub: hub ? places[0] : undefined, places: hub ? places.slice(1) : places, mode: hub ? "hub" : "chain" } as PlanLayer, { kind: "title", text: focus.toUpperCase(), sub, template: "impact", position: "bottom" }] };
    }
  }

  // ── CHOKEPOINT / strategic location → spotlight + target marker on terrain ──
  if ((arch0 && arch0.name.startsWith("Chokepoint")) || /\b(strait|chokepoint|canal|blockade|strategic|naval base|crossing point)\b/.test(t)) {
    return { title: focus.toUpperCase().slice(0, 30), subtitle: sub, durationSec: 8, aspect: "16:9", basemapStyle: "satellite", terrain: true, focus, mood: "neutral", motion: "push-in", palette: "Default", priority: "camera", look: { vignette: 0.45, grain: 0.1 },
      layers: [{ kind: "spotlight", place: focus } as PlanLayer, { kind: "marker", place: focus, icon: "target", style: { sizePx: 120 } } as PlanLayer, { kind: "title", text: focus.toUpperCase(), sub, template: "impact", position: "bottom" }] };
  }

  // 5) default — a mood-styled, cinematically composed highlight.
  //    Every default still has: an opening wide shot establishing context,
  //    a main geographic element (flag or solid highlight), and a clean title.
  //    Terrain auto-on for mountainous subjects; satellite for cities/coast.
  const sm = styleForMood(mood);
  const hasMountain = /mountain|alps|himalaya|andes|rockies|peak|range|valley|volcano|highland|fjord|glacier/.test(t);
  const hasCity = /city|town|downtown|skyline|neighborhood|district|quarter|bay|harbour|harbor/.test(t);
  const isCountry = caps.length <= 2 && !hasCity && !/\b(city|town|valley|range|mountain|lake|river|desert|sea|gulf|bay|island|strait|canal)\b/.test(t);
  const basemap: string = hasCity ? "satellite" : sm.basemapStyle;
  const terrain = hasMountain || (hasCity && /mountain|hill|coast/.test(t));
  // Decide the most cinematic motion: push-in for intimacy, zoom-out for scale, orbit for 3D
  const motion = hasCity ? "push-in" : hasMountain ? "orbit" : mood === "historical" ? "push-in" : "zoom-out";
  const pitch = hasCity ? 55 : hasMountain ? 42 : 12;
  // A brief context annotation when the subject has well-known significance
  const hasAnnotation = /strait|canal|chokepoint|border|capital|headquarter|base|hub/.test(t);
  const annotationLayers: PlanLayer[] = hasAnnotation
    ? [{ kind: "annotation", place: focus, text: focus.toUpperCase().slice(0, 24), side: "auto" } as PlanLayer]
    : [];
  const layers: PlanLayer[] = [
    { kind: "highlight", place: focus, fill: isCountry ? "flag" : "solid", mood,
      style: { enter: "border-first" } } as PlanLayer,
    ...annotationLayers,
    { kind: "title", text: focus.toUpperCase().slice(0, 30), sub, template: "impact", position: "bottom",
      style: { inSec: 1.4 } } as PlanLayer,
  ];
  return {
    title: focus.toUpperCase().slice(0, 30), subtitle: sub,
    durationSec: hasCity ? 10 : hasMountain ? 12 : 8,
    aspect: "16:9", basemapStyle: basemap as any, terrain, focus, mood,
    motion, cameraPitch: pitch, palette: MOOD_THEME[mood] ?? "Default",
    priority: "highlight", look: sm.look as any, layers,
  };
}

/* ── Heuristic STORY plan (no API key) — a real multi-beat fly-through ───────
 * Splits the narrative into beats (sentences), pulls the lead place from each,
 * and journeys the camera through them with a chapter title + narration line
 * per beat. So "paste a story → sequenced map" works even with no model. */
function heuristicStoryPlan(idea: string): Plan {
  // Journey prompts → let the Story Director sequence the camera (World →
  // continent context → start → stops → destination) with per-scene purpose
  // lines, instead of naive caps-extraction. Other stories fall through.
  const itv = interpret(idea);
  if (itv.route) {
    const sb = planStory(itv);
    const stops = Array.from(new Set(sb.scenes.flatMap((s) => s.locations))).slice(0, 7);
    const f = itv.route.to;
    return {
      title: f.toUpperCase().slice(0, 30), durationSec: Math.min(30, Math.max(12, sb.totalSec)),
      aspect: "16:9", basemapStyle: "dark", focus: f, mood: "neutral", motion: "fly-in",
      palette: "Vox Editorial", priority: "camera",
      cameraStops: stops.length >= 2 ? stops : [itv.route.from, itv.route.to],
      narration: sb.scenes.map((s) => s.purpose),
      look: { vignette: 0.38, grain: 0.12 },
      layers: [
        { kind: "connections", places: [itv.route.from, ...itv.route.via, itv.route.to], mode: "chain", style: { reveal: "draw", stagger: 0.7, curve: 0.4, width: 4, glow: 0.6, dots: true } } as PlanLayer,
        { kind: "title", text: f.toUpperCase().slice(0, 24), template: "kicker", position: "bottom" } as PlanLayer,
      ],
    };
  }
  const sentences = idea.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 6).slice(0, 6);
  const placeRe = /\b([A-Z][\w''-]+(?:\s+(?:of\s+)?[A-Z][\w''-]+){0,3})\b/g;
  const STOP = /^(The|In|On|At|And|But|Both|Search|It|He|She|They|His|Her|Their|A|An|After|Then|When|While|By)$/;
  const beats: { place: string; line: string }[] = [];
  for (const s of (sentences.length ? sentences : [idea])) {
    const caps = (s.match(placeRe) || []).filter((c) => !STOP.test(c));
    const place = caps.sort((a, b) => b.length - a.length)[0];
    if (place) beats.push({ place, line: s });
  }
  if (!beats.length) return heuristicPlan(idea);
  const stops = beats.map((b) => b.place).slice(0, 6);
  const focus = stops[stops.length - 1] || beats[0].place;
  const mood = /war|battle|siege|conflict|invasion|front/i.test(idea) ? "conflict"
    : /\b1[0-9]{3}\b|ancient|empire|expedition|sailed|voyage|century|medieval/i.test(idea) ? "historical" : "neutral";
  const layers: PlanLayer[] = beats.slice(0, 6).map((b) => ({ kind: "title" as const, text: b.place.toUpperCase().slice(0, 24), template: "kicker", position: "bottom" }));
  // The JOURNEY THREAD: a chained arc linking every beat in order, drawn on
  // progressively as the camera travels — the visual spine of the story.
  if (stops.length >= 2) {
    layers.unshift({ kind: "connections", places: stops, mode: "chain", style: { reveal: "draw", stagger: 0.7, curve: 0.4, width: 4, glow: 0.6, dots: true } } as PlanLayer);
  }
  // A conflict story gets its clash symbol at the climax (the final beat).
  if (mood === "conflict") layers.push({ kind: "marker", place: focus, icon: "swords", style: { sizePx: 96, glow: 0.8 } } as PlanLayer);
  return {
    title: (beats[0].place || "STORY").toUpperCase().slice(0, 30),
    durationSec: Math.min(28, Math.max(12, beats.length * 4)),
    aspect: "16:9", basemapStyle: mood === "historical" ? "light" : "dark", focus, mood,
    motion: "fly-in", palette: MOOD_THEME[mood] || "Vox Editorial", priority: "camera",
    cameraStops: stops, narration: beats.map((b) => b.line),
    look: mood === "historical"
      ? { vignette: 0.5, grain: 0.14, texture: "paper", textureOpacity: 0.6, mapFilter: "antique", mapFilterAmount: 0.6, tintColor: "#6b4a1f", tintOpacity: 0.25 }
      : { vignette: 0.35, grain: 0.12 },
    layers,
  };
}

/** Minimal brief for the NO-AI path — names the matched archetype so the user
 *  sees what story shape was chosen, and is honest that facts weren't verified. */
function heuristicBrief(idea: string): any {
  const arch = matchArchetype(idea);
  return {
    thesis: idea.replace(/\s+/g, " ").trim().slice(0, 140),
    angle: arch?.name ?? "Locate & highlight",
    archetype: arch?.name ?? "Place feature",
    facts: [],
    caveats: [],
    disputed: [],
  };
}

/**
 * Apply the narrative-interview answers to a freshly-built project so they
 * measurably shape the result on BOTH the AI and heuristic paths: length →
 * duration, camera energy → camera/route/track motion. (Tone + focus are fed to
 * the AI planner via the prompt; energy + length are deterministic here so even
 * the no-AI path honors them.)
 */
/**
 * Camera energy derived from tone — the interview is 3 questions (tone, focus,
 * length), so when the user hasn't answered a legacy `energy` question the
 * tone decides the camera language. This keeps every answer consequential on
 * BOTH the AI and no-AI paths.
 */
function energyFromInterview(iv: any): string {
  const explicit = String(iv?.energy ?? "");
  if (explicit) return explicit;
  const tone = String(iv?.tone ?? "");
  return tone === "urgent" ? "punchy"
    : tone === "epic" ? "dynamic"
    : tone === "calm" ? "smooth"
    : tone === "cinematic" ? "smooth"
    : "";
}

/**
 * Translate the interview answers into BINDING directives in the Director's
 * own vocabulary (energy arc, pacing, runtime, thesis angle). This is what
 * makes the 3-tap Q&A actually steer the story engine — the answers arrive as
 * hard constraints, not a suggestion blob.
 */
function interviewDirectives(iv: any, ivText: string): string {
  if (!iv && !ivText) return "";
  const lines: string[] = [];
  const tone = String(iv?.tone ?? "");
  const energy = energyFromInterview(iv);
  const length = String(iv?.length ?? "");

  if (tone === "cinematic") lines.push(`TONE (binding): cinematic & dramatic — moody palette, strong vignette, and the energy arc MUST climax in a "payoff" hero beat.`);
  else if (tone === "calm") lines.push(`TONE (binding): calm & informational — restrained camera, NO "tension" beats; energies stay calm/building, generous dwell time.`);
  else if (tone === "urgent") lines.push(`TONE (binding): urgent, news-style — "fast" pacing, put a "tension" beat in the middle third, short punchy titles.`);
  else if (tone === "epic") lines.push(`TONE (binding): epic & sweeping — wide establishing shot first, terrain on, and a "payoff" finale with a slow hero move.`);

  if (energy === "smooth") lines.push(`CAMERA (binding): smooth & elegant — fly-in / push-in moves, eased motion, never abrupt.`);
  else if (energy === "dynamic") lines.push(`CAMERA (binding): dynamic — favor route-following/chase moves, higher pitch, motion in every beat.`);
  else if (energy === "punchy") lines.push(`CAMERA (binding): punchy & fast — quick zooms, "fast" pacing on most beats.`);
  else if (energy === "locked") lines.push(`CAMERA (binding): locked-off & still — hold shots, let the map breathe.`);

  if (length === "8" || length === "15" || length === "30") {
    const beats = length === "8" ? "2–3" : length === "15" ? "3–4" : "4–6";
    lines.push(`RUNTIME (binding): totalSec ≈ ${length}. Plan exactly ${beats} beats to fit — do not exceed it.`);
  }

  // The readable transcript from the client ("• question → chosen label")
  // carries the tailored FOCUS answer and any AI-generated questions verbatim —
  // the Director builds the thesis around it.
  if (ivText) lines.push(`THE CREATOR'S ANSWERS (the "focus" line defines the story's angle — the thesis MUST serve it):\n${ivText}`);

  return lines.length
    ? `## THE CREATOR'S DECISIONS — binding directives, not suggestions. Every one must be visible in the result:\n${lines.join("\n")}`
    : "";
}

function applyInterview(project: Project, iv: any) {
  const comps: any[] = [];
  if (project.composition) comps.push(project.composition);
  for (const s of (project.scenes ?? [])) if (s.composition) comps.push(s.composition);
  const uniq = Array.from(new Set(comps));

  const lenMap: Record<string, number> = { "8": 7, "15": 14, "30": 28 };
  const target = lenMap[String(iv.length)];
  if (target) {
    const scenes = project.scenes ?? [];
    if (scenes.length > 1) {
      const per = Math.max(4, Math.min(60, Math.round(target / scenes.length)));
      for (const s of scenes) s.composition.durationSec = per;
      project.composition.durationSec = scenes[0]?.composition.durationSec ?? project.composition.durationSec;
    } else {
      const d = Math.max(4, Math.min(60, target));
      for (const c of uniq) c.durationSec = d;
    }
  }

  const energy = energyFromInterview(iv);
  if (!energy) return;
  for (const c of uniq) {
    const cam = c.layers.find((l: Layer) => l.type === "camera") as any;
    if (cam) {
      if (energy === "smooth") { cam.easing = "easeInOut"; cam.moveFraction = 0.92; if (cam.style === "hold") cam.style = "push-in"; }
      else if (energy === "dynamic") { cam.easing = "easeInOut"; cam.moveFraction = 0.85; cam.style = "push-in"; cam.end = { ...cam.end, pitch: Math.max(cam.end?.pitch ?? 0, 55) }; }
      else if (energy === "punchy") { cam.easing = "easeOut"; cam.moveFraction = 0.6; }
      else if (energy === "locked") { cam.style = "hold"; cam.moveFraction = 0.2; }
    }
    for (const r of c.layers.filter((l: Layer) => l.type === "route") as any[]) {
      if (energy === "dynamic" || energy === "punchy") r.cameraMode = "chase";
      else if (energy === "locked") r.cameraMode = "frame";
    }
    for (const t of c.layers.filter((l: Layer) => l.type === "track") as any[]) {
      if (energy === "dynamic") t.variant = "chase-flyover";
      else if (energy === "locked" || energy === "smooth") t.variant = "overview-draw";
    }
  }
}

export async function POST(req: NextRequest) {
  // Defense-in-depth: enforce auth at the handler level (Clerk middleware is the
  // primary gate, but this prevents accidental misconfiguration from leaving the
  // most expensive endpoint open).
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  // 10 AI generations per minute per user — generous for real usage, blocks abuse.
  if (!rateLimit("generate", clerkId, { maxRequests: 10, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests — max 10 generations per minute." }, { status: 429 });
  }

  let body: { idea?: string; plan?: Plan; ai?: any; mode?: string; style?: string; interview?: any; interviewText?: string; arc?: ArcContext; taste?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const idea = (body.idea ?? "").trim();
  const iv = body.interview && typeof body.interview === "object" ? body.interview : null;
  const ivText = (body.interviewText ?? "").toString().slice(0, 400);
  // TASTE PROFILE — the client's learned preference summary. Biases the AI's
  // look/palette/pacing choices toward what this user keeps choosing; the
  // brief always wins on conflict. Never fed to the rule-based parser.
  const taste = (body.taste ?? "").toString().slice(0, 400);
  // ARC: this generate call is ONE chapter of a larger multi-sequence film.
  const arc = body.arc && typeof body.arc === "object" ? body.arc : null;

  // A caller can pass a fully-authored plan directly (curated templates do this)
  // — deterministic, non-redundant, no LLM round-trip. Otherwise design from the
  // idea via the configured AI provider, falling back to the heuristic.
  const directPlan = body.plan && (body.plan as any).focus && Array.isArray((body.plan as any).layers) ? body.plan : null;
  if (!directPlan && !idea) return NextResponse.json({ error: "Describe your animation idea first." }, { status: 400 });

  // STORY FRAMEWORK: every non-template idea runs through the deterministic
  // engine (interpret → storyboard) first. This fixes the STRUCTURE + STYLE so
  // the AI fills facts/narration into a determined storyline (consistent, never
  // structureless) — and it decides story-vs-single from the narrative, not a
  // crude length check.
  const framework = (!directPlan && idea) ? buildFramework(idea, { styleId: body.style, interview: iv ?? undefined }) : null;

  // STORY MODE: explicit toggle, OR the framework says this is a multi-scene
  // story (journey/multi-entity/etc.), OR a clearly narrative input.
  const isStory = body.mode === "story" || (framework?.multiScene ?? false) || (!directPlan && (idea.length > 220 || ((idea.match(/[.!?]/g) || []).length >= 3)));

  // ENGINE CHOICE: the user explicitly picks AI-directed vs "Smart (no AI)".
  // useAI:false → built-in director logic only (instant, no key, private).
  // Otherwise AI is REQUESTED — prefer their own provider/key (BYO) over env.
  const aiRequested = (body as any).useAI !== false;
  const aiCfg = aiRequested ? (configFromUser(body.ai) ?? resolveAIConfig()) : null;
  // ARC CONTINUITY: when this is one chapter of a bigger film, tell the AI the
  // whole-story context so it keeps the SAME style, remembers the goal + what
  // earlier chapters showed, and can build on / refine them (not start over).
  const arcText = arc ? [
    `## STORY ARC — CONTINUITY (this is sequence ${(arc.index ?? 0) + 1} of ${arc.count} in ONE larger film — critical)`,
    arc.subject ? `The whole film is about: ${arc.subject}.` : "",
    arc.goal ? `Goal of the whole film: ${arc.goal}` : "",
    arc.thesis ? `Editorial thesis: ${arc.thesis}` : "",
    Array.isArray(arc.prior) && arc.prior.length ? `Earlier sequences already showed:\n${arc.prior.map((p) => `  - ${p}`).join("\n")}` : "",
    arc.intent ? `THIS sequence's job: ${arc.intent}` : `THIS sequence's request: ${idea}`,
    Array.isArray(arc.beats) && arc.beats.length ? `Planned beats for this sequence:\n${arc.beats.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}` : "",
    "Rules: keep the EXACT SAME visual style as the other sequences (it is locked). Maintain geographic + narrative continuity — reuse the same places/framing where they recur. You MAY build on, extend, or REMOVE/REFINE elements introduced earlier (e.g. \"remove the unethical spots\" = filter down the places shown before, do not restart). Advance the story by exactly this one chapter.",
  ].filter(Boolean).join("\n") : "";

  // TWO-PHASE AI PIPELINE:
  // Phase 1 — Story Director: translates the raw idea into a structured story script
  //   (what to show per beat, how to animate, what camera moves). Fast, focused call.
  // Phase 2 — Animation Composer: receives the Director's Script + the full layer
  //   schema, outputs the complete Plan JSON with timing, colors, animations specified.
  //   Heuristics are NOT responsible for creative decisions — they're fallback only.

  // INTENT GATE: simple, direct prompts ("route from Paris to Rome", "highlight
  // Japan") skip the Director phase AND the research doctrine entirely — one
  // fast Composer call, minimal layers, no documentary expansion. Deep research
  // is reserved for stories and prompts that actually ask for it.
  const simpleIntent = !directPlan && !arc && !isStory
    && isSimpleIntent(idea, framework?.interpretation?.locations?.length ?? 0);

  // Phase 1: Director call (skip for direct plans, arcs with full spec, no-AI
  // mode, and simple requests — the arc/simple context needs no story script).
  const shouldRunDirector = !directPlan && !!aiCfg && !arc && !simpleIntent;

  // Pre-inject interpretation + archetype into the Director's user prompt.
  // The Director gets verified places, detected route, and archetype recipe BEFORE
  // it starts designing, so it never has to guess them from scratch — which is the
  // main cause of place hallucinations and wrong story archetypes.
  const directorInput = (() => {
    if (!shouldRunDirector || !idea) return idea;
    const it = framework?.interpretation;
    const arch = matchArchetype(idea);
    const ctx: string[] = [];
    if (it?.locations.length) ctx.push(`Verified locations in prompt: ${it.locations.join(", ")}`);
    if (it?.route) ctx.push(`Route: ${it.route.from} → ${it.route.via.length ? it.route.via.join(" → ") + " → " : ""}${it.route.to}`);
    if (it?.action && it.action !== "unknown") ctx.push(`Action type: ${it.action}`);
    if (arch) ctx.push(`Matched story archetype: ${arch.name}.\nRecipe: ${arch.recipe.slice(0, 220)}`);
    const directives = interviewDirectives(iv, ivText);
    if (directives) ctx.push(directives);
    if (taste) ctx.push(`User taste profile (learned from their past choices — bias style/palette/pacing toward it unless the brief says otherwise): ${taste}`);
    if (!ctx.length) return idea;
    return `${idea}\n\n## ENGINE PRE-ANALYSIS — trust and use this:\n${ctx.join("\n")}`;
  })();

  // GEOCODING PRE-WARM: fire geocode requests for places detected by interpret()
  // in parallel with the Director call. By the time Composer finishes and we hit
  // groundPlaces(), these results are already cached — zero extra latency.
  const prewarmGeo = framework?.interpretation?.locations?.length
    ? framework.interpretation.locations.map((p: string) => geocode(p))
    : [];
  const [dirScript] = await Promise.all([
    shouldRunDirector ? directorCall(directorInput, aiCfg!) : Promise.resolve(null),
    Promise.allSettled(prewarmGeo), // warm the cache; results go straight to GEO_CACHE
  ]);

  // Phase 2: Composer call. When the director produced a script, feed it as context
  // so the composer focuses purely on technical animation — not story structure.
  const composerInput = [
    dirScript ? scriptToComposerContext(dirScript) : idea,
    // Framework instruction still shapes structure when no director script (arc mode).
    !dirScript && framework && aiCfg ? frameworkInstruction(framework) : "",
    // Interview decisions flow to the Composer when no Director script carried
    // them (arc mode / director skipped) — same binding form.
    !dirScript ? interviewDirectives(iv, ivText) : "",
    // Arc continuity context.
    arcText && aiCfg ? arcText : "",
    // Learned user taste — a nudge for the composer's map3dStyle/palette/fonts.
    taste && aiCfg ? `USER TASTE PROFILE (bias look & palette toward this unless the brief contradicts it): ${taste}` : "",
  ].filter(Boolean).join("\n\n");

  const composerSystem = simpleIntent ? `${SYSTEM}${SIMPLE_MODE}` : withDoctrine(isStory ? STORY_SYSTEM : SYSTEM);
  const ai = (directPlan || !aiCfg) ? { plan: null as Plan | null, warning: undefined as string | undefined, tokensUsed: 0 } : await aiPlan(composerInput, aiCfg, composerSystem);
  const llmPlan = ai.plan;

  // AI RESULT HANDLING:
  // • No key configured (aiCfg=null): gracefully fall through to the built-in
  //   heuristic director. The response includes aiConfigured:false so the UI can
  //   show a non-blocking "connect a key for AI research" nudge without blocking.
  // • Key configured but model failed: surface the error so the user can fix it
  //   (wrong key, rate-limit, etc.). We do NOT silently fall back here because
  //   that would mask a real config problem the user needs to know about.
  if (aiRequested && !directPlan && aiCfg && !llmPlan) {
    return NextResponse.json({
      error: `AI returned no usable plan: ${ai.error ?? "unknown error"}. Check your API key and model in Settings, then try again.`,
      aiConfigured: true,
    }, { status: 502 });
  }

  const plan = directPlan ?? llmPlan ?? (isStory ? heuristicStoryPlan(idea) : heuristicPlan(idea));

  // If the Director produced a script but the Composer didn't include narration,
  // inject the director's narration lines so storyboard review has content.
  if (dirScript?.beats?.length && !Array.isArray((plan as any).narration)) {
    (plan as any).narration = dirScript.beats.map((b) => b.narration).filter(Boolean);
  }
  // Inject director thesis as the editorial brief thesis when the Composer missed it.
  if (dirScript?.thesis && !(plan as any).brief) {
    (plan as any).brief = { thesis: dirScript.thesis, angle: "", archetype: "", facts: [], caveats: [], disputed: [] };
  }

  // ── ENRICH PLAN: recover Composer omissions from the Director script ──────
  // The Composer is explicitly told to include "cameraPoses" (per-beat camera
  // framing) but frequently omits it. Without it, buildFromPlan falls back to
  // cameraStops (place-name only, no per-beat zoom/pitch/bearing/motion) which
  // produces much flatter multi-beat stories. Synthesize from Director beats
  // when the Composer dropped the field.
  if (dirScript?.beats?.length && !Array.isArray((plan as any).cameraPoses)) {
    (plan as any).cameraPoses = dirScript.beats.map((b: any) => ({
      place: b.focus,
      zoom: b.zoom ?? undefined,
      pitch: b.pitch ?? undefined,
      bearing: b.bearing ?? 0,
      motion: b.motion ?? (plan as any).motion ?? "fly-in",
    }));
    // Align cameraStops with the beats when empty (gives multi-stop camera path).
    if (!Array.isArray((plan as any).cameraStops) || !(plan as any).cameraStops.length) {
      (plan as any).cameraStops = dirScript.beats.map((b: any) => b.focus);
    }
    // Honour the Director's total duration when the Composer didn't set one.
    if (!((plan as any).durationSec > 0) && (dirScript as any).totalSec > 0) {
      (plan as any).durationSec = (dirScript as any).totalSec;
    }
  }

  // ── PLACE GROUNDING (accuracy superpower) ──
  // Verify every place the plan pins actually resolves to the RIGHT spot, and
  // AI-repair the wrong ones, BEFORE we build geometry. Templates (directPlan)
  // are already authored with real coords, so skip them.
  const placeReport = !directPlan ? await groundPlaces(plan, aiCfg, `${idea}\n${(plan as any).title ?? ""}`) : null;

  // The fact-checked Director brief (thesis, facts + confidence, caveats) — shown
  // in the Storyboard Review so the user sees the journalism before scenes build.
  const brief = directPlan ? null : ((plan as any).brief ?? heuristicBrief(idea));
  if (brief) {
    brief.provider = llmPlan ? "ai" : "heuristic";
    if (!llmPlan && !(brief.caveats?.length)) brief.caveats = ["Planned by the built-in logic parser — facts were NOT independently researched or verified. Connect an AI provider for fact-checked, journalist-grade planning."];
  }

  // SIGNATURE STYLE: the user picked a complete art direction BEFORE generating
  // (War Room / Expedition 1900 / Editorial / …). It locks the palette, type
  // pairing, film grade + texture and basemap so the result is cohesively
  // designed every time — regardless of what the planner chose. Curated
  // template plans (directPlan) are already fully art-directed, so skip those.
  const sig = !directPlan ? signatureStyleById(body.style) : null;
  if (sig) {
    plan.palette = sig.palette;
    plan.fontDisplay = sig.fontDisplay;
    plan.fontBody = sig.fontBody;
    plan.look = { ...(plan.look ?? {}), ...sig.look };
    // Keep "historical" if the planner chose period borders — the era is the point.
    if (sig.basemapStyle && plan.basemapStyle !== "historical") plan.basemapStyle = sig.basemapStyle;
  }

  // LANDING-PARITY: turn the creator's requested LOOK language into the matching
  // pro style so the preview they tapped on the landing (or asked for in the
  // BuildFlow "look" question) becomes the ACTUAL film — even with no AI. The AI
  // path sets map3dStyle itself, so only fill it when nothing chose one yet.
  if (!directPlan && !(plan as any).map3dStyle) {
    const look = detectProStyle(`${idea} ${ivText}`);
    if (look) (plan as any).map3dStyle = look;
  }

  try {
    // A story is built as ONE continuous timeline (beats sequenced inside a
    // single composition) — never auto-split into scenes. Users add scenes
    // manually in the editor when they want chapters.
    const project = await buildFromPlan(plan, { story: isStory });
    // Camera energy + length from the interview shape the result on every path.
    if (iv && !directPlan) applyInterview(project, iv);
    return NextResponse.json({
      project,
      plan,
      usedLLM: !!llmPlan,
      provider: directPlan ? "template" : llmPlan ? (aiCfg?.label ?? "ai") : "heuristic",
      story: isStory,
      // The fact-checked Director brief (thesis, facts+confidence, caveats, disputed).
      verification: brief,
      // The suggested voiceover lines, one per story beat (story mode only).
      narration: Array.isArray((plan as any).narration) ? (plan as any).narration : [],
      // The determined storyboard (pattern + beats) — for a "here's the plan" preview.
      storyboard: framework ? { pattern: framework.storyboard.pattern, scenes: framework.storyboard.scenes, notes: framework.storyboard.notes } : null,
      // The Director's editorial script (Phase 1) — beat titles, narration and focus
      // locations as the Director planned them, shown in StoryboardReview so the user
      // sees the editorial intent before the Composer's animation is opened.
      dirScript: dirScript ? { thesis: dirScript.thesis, arc: dirScript.arc, inputType: dirScript.inputType, beats: dirScript.beats.map((b) => ({ title: b.title, narration: b.narration, focus: b.focus, energy: b.energy, pacing: b.pacing, cameraIntent: b.cameraIntent })) } : null,
      // Surface WHY the AI wasn't used (wrong key/model, rate limit, …) instead
      // of silently degrading to the heuristic — so the user can fix it.
      aiError: !directPlan && !llmPlan && aiCfg ? (ai.error ?? "AI unavailable") : undefined,
      aiConfigured: !!aiCfg,
      layers: project.composition.layers.length,
      // Place-accuracy report: which place names were verified, auto-corrected,
      // or couldn't be resolved — surfaced so the user trusts the map landed right.
      places: placeReport,
      // Reusable feature ADD-ONS the AI invented for this story (the client saves
      // them to the registry so they become one-click building blocks forever).
      addons: Array.isArray((plan as any).addons)
        ? (plan as any).addons.map((a: unknown) => normalizeAddon(a)).filter(Boolean)
        : [],
      // Meta: token usage + any warnings (e.g. truncation) the UI should surface.
      _meta: {
        tokensUsed: ai.tokensUsed ?? 0,
        warning: ai.warning ?? null,
        // Which pipeline handled it: "simple" = lightweight one-call path (no
        // Director, no research doctrine), "story"/"rich" = full two-phase.
        intent: directPlan ? "template" : simpleIntent ? "simple" : isStory ? "story" : "rich",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to assemble project", detail: String(e?.message ?? e) }, { status: 500 });
  }
}

// Registry: exposes buildFromPlan to sibling routes (addon apply) without a
// route-module export, which Next's route typegen forbids.
_registerPlanBuilder(buildFromPlan);
