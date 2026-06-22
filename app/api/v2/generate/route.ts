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
import { aiComplete, resolveAIConfig, configFromUser, type AIConfig } from "@/lib/ai/providers";
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
type PlanLayer =
  | ({ kind: "highlight"; place: string; fill?: "solid" | "flag" | "hatch" | "crosshatch" | "stripes" | "dots"; mood?: string; label?: string } & Styled)
  | ({ kind: "label"; text: string; sub?: string; place: string; variant?: "pin" | "card" | "banner" | "lower-third" } & Styled)
  | ({ kind: "route"; from: string; to: string; transport?: string; icon?: string; cameraMode?: "follow" | "frame" | "chase" | "orbit" } & Styled)
  | ({ kind: "flag"; place: string } & Styled)
  | ({ kind: "title"; text: string; sub?: string; template?: string; position?: string } & Styled)
  | ({ kind: "chart"; variant?: "counter" | "bar" | "line"; value?: number; prefix?: string; suffix?: string; label?: string } & Styled)
  // A symbol dropped on a spot — `between:[A,B]` sits it on the contested border
  // between two places (midpoint); else `place` names where it lands.
  | ({ kind: "marker"; place?: string; between?: [string, string]; icon?: string; emoji?: string; label?: string } & Styled)
  // An editorial leader-line callout pointing at a place.
  | ({ kind: "annotation"; place: string; text: string; sub?: string; side?: "top" | "bottom" | "left" | "right" | "auto" } & Styled)
  // A network of arcs: hub-and-spoke (hub → places) or a chain (places in order).
  | ({ kind: "connections"; hub?: string; places: string[]; mode?: "hub" | "chain" } & Styled)
  // Darken everything except a circle on `place` to force the eye there.
  | ({ kind: "spotlight"; place: string } & Styled)
  // COMPOSITE: a clash between two countries — auto-highlights BOTH (opposing
  // colours), draws the real shared border (glowing, its own style) and places
  // crossing-swords ALONG that border. Camera frames both. One word does it all.
  | ({ kind: "conflict"; a: string; b: string; icon?: string; swords?: number; colorA?: string; colorB?: string; border?: string } & Styled)
  // COMPOSITE: drop every country in a region as a flag badge (staggered pop-in)
  // and frame the camera on that region. "every country in Europe with flags".
  | ({ kind: "regionFlags"; region: string } & Styled)
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
  | ({ kind: "bubbles"; places: string[]; values: number[]; labels?: string[]; metric?: string; unit?: string; color?: string } & Styled)
  // WEIGHTED FLOW: like connections but arc width = volume (trade, migration, data).
  | ({ kind: "flows"; hub?: string; places: string[]; weights: number[]; mode?: "hub" | "chain"; color?: string } & Styled);
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
  /** STORY MODE: one voiceover line per beat, in order (suggested narration). */
  narration?: string[];
  /** OPTIONAL: reusable feature add-ons the AI invented for this story. */
  addons?: unknown[];
  layers: PlanLayer[];
};
const MOTIONS = ["fly-in", "zoom-out", "orbit", "push-in", "pan", "hold"];

const SYSTEM = `You are the director of "Mapanisy", a cinematic MAP-animation studio (Vox / Johnny Harris style). Translate the user's idea into ONE finished, well-composed, art-directed map animation. Think like an editor: what is the single visual story, where does the eye go, what's the one focal point?

Output ONLY minified JSON (no prose, no markdown) of EXACTLY this shape:
{"title":str(≤30),"subtitle":str(≤48),"durationSec":num(5-12),"aspect":"16:9"|"9:16"|"1:1","basemapStyle":"dark"|"light"|"satellite"|"streets"|"outdoors"|"historical","mapYear":"1880 (start era, historical only)","mapYearEnd":"1920 (end era — animates year sweep + on-screen counter; historical only)","terrain":bool,"focus":str,"motion":"fly-in"|"zoom-out"|"orbit"|"push-in"|"pan"|"hold","cameraStops":[str],"mood":"conflict"|"historical"|"trade"|"empire"|"political"|"arctic"|"neutral","palette":"Default"|"Vox Editorial"|"Arctic Cold"|"Conflict Red"|"Trade Green"|"Political Violet"|"Classic Mono","priority":"camera"|"route"|"highlight","map3dStyle":"(optional creative 3D world) holographic|neon-noir|miniature|blueprint|obsidian|molten|aurora|crystal-ice|papercraft|war-room|sakura|emerald|golden-hour|monochrome","map3dCustom":{"(optional — INVENT a bespoke 3D world when no preset fits)":"","landColor":"#hex","waterColor":"#hex","buildingColor":"#hex","buildingOpacity":0-1,"buildingHeightMult":0.2-8,"buildingGradient":bool,"boundaryGlow":"#hex","terrain":bool,"terrainStrength":0-5,"bgColor":"#hex","tintColor":"#hex","tintOpacity":0-1,"vignette":0-0.7,"pitch":0-84},"look":{"vignette":0-0.7,"grain":0-0.3,"texture":"none"|"paper","mapFilter":"none"|"antique"|"noir"|"sepia"},"layers":[...]}

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
 {"kind":"bubbles","places":["China","USA","India","Indonesia"],"values":[1400000000,330000000,1380000000,270000000],"metric":"Population","unit":"people"}  ← PROPORTIONAL SYMBOLS: circles sized by sqrt-scaled value — perfect for population, deaths, GDP per country at-a-glance. Pairs with a choropleth for maximum impact on data stories.
 {"kind":"flows","hub":"London, UK","places":["New York","Mumbai","Sydney"],"weights":[450,320,180],"mode":"hub"}  ← WEIGHTED FLOWS: arc thickness = volume. Use when quantities differ significantly (trade $450B vs $180B). Shows MAGNITUDE not just connection. Add "pulse":true style for live-trade feel.
ANY layer may add "style":{...} to art-direct exact fields — e.g. highlight {"fillColor":"#c0392b","extrude":18,"glowColor":"#ff4030"}, route {"color":"#e67e22","dashStyle":"dashed","glow":0.8}, marker {"color":"#ff3030","sizePx":150}.

VISUAL VOCABULARY — translate the user's WORDS into VISUALS (show, don't write):
 • conflict / war / invasion / clash / tension / fighting / civil war / frontline / dispute / standoff (between two countries) → kind:"conflict". A one-sided strike/attack/battle at a spot → marker icon:"swords"|"explosion". palette:"Conflict Red".
 • growing / booming / rising / surging economy·GDP·population·exports → chart variant:"line" (trends UP) or a counter. decline / crash / collapse / recession → chart "line" (reads as falling). palette:"Trade Green".
 • trade / exports / shipping / supply-chain / silk road → connections (or a boat/truck route). migration / refugees / diaspora / spread / empire reach / alliances (NATO, EU) → connections hub→many.
 • earthquake / disaster / nuclear / meltdown / bomb / strike → marker icon:"explosion"|"radiation"|"fire" on the spot. oil / gas / energy / drilling → marker icon:"oil". money / finance / wealth → marker icon:"money" or a counter.
 • "every / all countries in <region>" → kind:"regionFlags". one country → highlight fill:"flag".
 • ranked countries by a figure (GDP / population / CO₂ / military / poverty / exports) → kind:"choropleth" with the REAL numbers you verified. The colour gradient tells the whole story at a glance — data journalism grade.
 • "how big is X compared to Y" / "X is the size of Y" / scale context → kind:"truesize". The polygon overlay is the most visceral way to convey geographic scale.
 • country-by-country quantities (population / deaths / infections / GDP per country) → kind:"bubbles". Circle area = value. Use INSTEAD of choropleth when there are fewer places (2-10) and the story is about the MAGNITUDE of each individual place.
 • trade volumes / investment flows / migration corridors with known volumes → kind:"flows" with weights. Arc WIDTH encodes the magnitude. Much more informative than plain connections when the quantities vary widely.
 • biography / expedition / migration / journey of a named person → kind:"character". Traces their stops as an animated chain. Use alongside "title" beats naming each chapter.
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
 • CREATIVE 3D WORLDS: for a striking, art-directed look set "map3dStyle" — it recolours land/water, art-directs glowing 3D buildings, relief and grade into a distinctive world. Use "holographic"/"blueprint" for tech/data/future, "neon-noir" for night/urban/culture, "miniature"/"golden-hour" for a charming city diorama, "molten" for disaster/energy/conflict, "aurora"/"crystal-ice"/"emerald" for nature/climate, "war-room" for military/geopolitics, "papercraft" for whimsical/travel, "sakura" for Japan/spring/romance, "monochrome" for stark editorial. Best on a CITY or country reveal (buildings show at city zoom). Pairs with motion:"orbit"/"push-in".
 • INVENT A 3D WORLD: when the story has a strong colour identity that no preset nails (e.g. "a toxic green wasteland", "a royal purple empire", "a frozen crimson tundra"), set "map3dCustom" with your own hexes — landColor, waterColor, buildingColor (+ buildingHeightMult/Gradient), boundaryGlow, terrain, bgColor/tintColor, pitch. Be bold and cohesive; the schema clamps anything out of range. Use a preset OR map3dCustom, not both.

8. PLACE ACCURACY (critical — the map MUST land on the right spot). Every place name you emit is geocoded literally, so be UNAMBIGUOUS:
   • Use the canonical, full name and ADD the disambiguating parent for anything ambiguous: "Tbilisi, Georgia" (not "Georgia"), "Cordoba, Spain", "Springfield, Illinois, USA", "Naga City, Philippines". A bare ambiguous name will geocode to the wrong place.
   • For a COUNTRY, use the country's common English name alone ("Japan", "Georgia (country)"). For a CITY, prefer "City, Country". For a region/feature, name it precisely ("Sichuan, China", "Strait of Hormuz").
   • Highlights/pins/markers must reference the EXACT feature the story is about. If unsure between two readings, pick the one the idea clearly means and qualify it.
   • Never invent a place that doesn't exist; if a beat has no real location, omit the pin rather than guessing.

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

Be decisive and specific to THIS idea.`;

/* ── STORY MODE: a narrative/script → a sequenced, chaptered fly-through ─────── */
const STORY_SYSTEM = `${SYSTEM}

STORY MODE — the input is a NARRATIVE or script, not a single idea. Turn it into ONE cinematic map STORY that plays as a sequenced fly-through:
S1. Read the WHOLE story and find its 3-6 KEY GEOGRAPHIC BEATS in chronological/narrative order.
S2. Set durationSec to 12-28 (longer — it's a story). Fill "cameraStops" with the beats' places IN ORDER (the camera journeys through them); "focus" is the final/climactic place.
S3. For EACH beat add its visuals (highlight / route / marker icon:swords|fire|… / connections) AND ONE short chapter "title" naming that beat (≤ 24 chars). Put layers in STORY ORDER — they are sequenced automatically so each chapter title appears as the camera arrives, then yields to the next.
S4. Add "narration": an array with ONE vivid voiceover sentence per beat (same order, same count as the beats) — what a documentary narrator would say.
S5. ≤ 9 layers total. The MAP + the journey carry the story; titles are short chapter markers, never paragraphs. Keep one cohesive palette + look for the whole piece (antique for history, noir for war).
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
T3. Keep on-screen text to AT MOST ONE title + minimal map labels at any moment. If a beat needs more words than one short line, that is a SIGN TO SPLIT IT INTO ITS OWN SEQUENCE — do not cram.
T4. PREFER A MULTI-SEQUENCE STORY over cramming everything into one continuous scene. If the narrative has distinct phases/chapters (more than ~3-4 beats, or a clear "and then…" structure), say so in the brief ("angle") and design clean, separable beats so each can stand as its own scene/storybeat — even if the camera flows continuously between them. A separable beat = its own focal place + its own single title + its own one narration line.`;

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

/* ── Director planner (provider-agnostic: Anthropic / OpenAI / compatible) ──── */
async function aiPlan(idea: string, cfg: AIConfig | null, system: string = SYSTEM): Promise<{ plan: Plan | null; error?: string }> {
  if (!cfg) return { plan: null };
  const { text, error } = await aiComplete(system, `Idea: """${idea.slice(0, 1400)}"""`, cfg);
  if (!text) return { plan: null, error: error ?? "Empty AI response." };
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!json?.focus || !Array.isArray(json?.layers)) return { plan: null, error: "AI returned an unexpected shape." };
    return { plan: json as Plan };
  } catch { return { plan: null, error: "AI did not return valid JSON." }; }
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
  if (!MAPBOX_TOKEN || !q) return null;
  const key = q.trim().toLowerCase();
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;
  let out: GeoResult | null = null;
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

/** AI repair: given names that resolved to the WRONG place (or nowhere), ask the
 *  model for the precise, unambiguous canonical name a geocoder will nail. */
async function repairPlaces(bad: string[], ctx: string, cfg: AIConfig): Promise<Record<string, string | null>> {
  const sys = `You correct bad MAP place names. Each input failed to resolve to the right real-world location. For each, return the precise, UNAMBIGUOUS canonical name a geocoder will land on correctly — as "Place, Country" or "Place, Region, Country" (e.g. "Strait of Hormuz"→"Strait of Hormuz, Oman", "Naga"→"Naga, Camarines Sur, Philippines", "Georgia (country)"→"Tbilisi, Georgia"). If a name is FICTIONAL or not a real place, return null for it. Return STRICT JSON only: {"fixes":{"<input>":"<fixed name or null>"}}.`;
  const user = `Story context: """${ctx.slice(0, 500)}"""\nFix these place names:\n${bad.map((b) => `- ${b}`).join("\n")}`;
  const { text } = await aiComplete(sys, user, cfg);
  if (!text) return {};
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const fixes = j?.fixes ?? {};
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

/* ── Assemble a Project from a plan ──────────────────────────────────────── */
/** Linearly interpolate between two CSS hex colours at t ∈ [0, 1]. */
function lerpColor(low: string, high: string, t: number): string {
  const h = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const a = h(low.length === 7 ? low : "#e3f2fd"), b = h(high.length === 7 ? high : "#0d47a1");
  const r = (v: number) => v.toString(16).padStart(2, "0");
  return `#${r(Math.round(a[0] + (b[0] - a[0]) * t))}${r(Math.round(a[1] + (b[1] - a[1]) * t))}${r(Math.round(a[2] + (b[2] - a[2]) * t))}`;
}

/** Auto-grade the colour of a scene based on its emotional content.
 *  Returns partial Look overrides to be merged into the scene's look. */
function gradeFromEmotion(text: string): Record<string, unknown> {
  const t = text.toLowerCase();
  if (/tension|crisis|collaps|war|battle|invad|conflict|clash|attack|siege|massacre|catastroph/.test(t))
    return { gradeShadow: "#3a0808", gradeShadowAmt: 0.32 };          // ominous blood-red shadow
  if (/triumph|victory|liberat|celebrat|rise|dawn|break|resurrect|free/.test(t))
    return { gradeHigh: "#fff3c0", gradeHighAmt: 0.22 };              // warm golden triumph
  if (/fall|tragic|grief|mourn|death|doomed|end|perish|lost/.test(t))
    return { gradeShadow: "#080d1a", gradeShadowAmt: 0.42, gradeMid: "#1a2a3a", gradeMidAmt: 0.18 }; // cold dark blue
  if (/discover|reveal|hidden|secret|found|ancient|unearthed|mystery/.test(t))
    return { gradeHigh: "#c0e8d0", gradeHighAmt: 0.16 };              // cool green revelation
  if (/wealth|boom|gold|prosper|rich|trade|flourish/.test(t))
    return { gradeHigh: "#f5e4a0", gradeHighAmt: 0.14 };              // warm amber prosperity
  return {};
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

/** Derive a camera style, pitch, and bearing from the narration text —
 *  so the camera MEANS something: push into tension, pull back for scale. */
function motionFromSemantics(text: string): { style: string; pitch: number; bearing: number } {
  const t = text.toLowerCase();
  if (/tension|crisis|collaps|war|battle|attack|surge|spike|invaded|fell|struck/.test(t))
    return { style: "push-in", pitch: 55, bearing: 0 };
  if (/scale|spread|empire|region|across|global|world|all|entire|continent/.test(t))
    return { style: "zoom-out", pitch: 12, bearing: 0 };
  if (/journey|route|travel|migrat|march|fly|road|across|from .+ to/.test(t))
    return { style: "fly-in", pitch: 32, bearing: -8 };
  if (/orbit|around|circl|surround/.test(t))
    return { style: "orbit", pitch: 35, bearing: 30 };
  return { style: "push-in", pitch: 38, bearing: 0 };
}

/** Calculate an appropriate scene duration from its content.
 *  Narration at ~130 wpm sets the floor; visual complexity adds headroom. */
function beatDuration(narration: string, layers: any[]): number {
  const words = (narration || "").trim().split(/\s+/).filter(Boolean).length;
  const narrationSec = words > 5 ? (words / 130) * 60 : 0;
  const hasRoute = layers.some((l: any) => l.type === "route");
  const hasCounter = layers.some((l: any) => l.type === "chart");
  const hasBubble = layers.some((l: any) => l.type === "bubble");
  const highlightCount = layers.filter((l: any) => l.type === "highlight").length;
  const base = Math.max(narrationSec, 4);
  const complexity = (hasRoute ? 2.5 : 0) + (hasCounter ? 1.5 : 0) + (hasBubble ? 1 : 0) + (highlightCount > 2 ? 1 : 0);
  return Math.min(16, Math.round((base + complexity) * 10) / 10);
}

/** Split a finished story composition into one EDITABLE scene per geographic
 *  beat (the camera's start → waypoints → end), so a single prompt yields a
 *  multi-scene story the user can tweak beat-by-beat. Each scene re-frames on its
 *  beat (push-in) and shows only that beat's chapter title; shared context layers
 *  (route, highlights) carry through. Returns [] when there aren't ≥2 distinct
 *  beats (single-place stories stay one scene). */
function splitStoryScenes(comp: any, dur: number, narration: string[]): any[] {
  const cam = comp.layers.find((l: any) => l.type === "camera");
  if (!cam) return [];
  const raw = [cam.start, ...(Array.isArray(cam.waypoints) ? cam.waypoints : []), cam.end]
    .filter((p: any) => p && isFinite(p.lon) && isFinite(p.lat));
  // Collapse near-identical consecutive poses (a single-place push-in is 1 beat).
  const beats: any[] = [];
  for (const p of raw) { const last = beats[beats.length - 1]; if (!last || Math.hypot(last.lon - p.lon, last.lat - p.lat) > 0.05) beats.push(p); }
  const n = beats.length;
  if (n < 2) return [];

  const scenes: any[] = [];
  let prevCamEnd: any = null;          // geographic continuity — each scene starts where the last ended

  for (let i = 0; i < n; i++) {
    const b = beats[i];
    const c = structuredClone(comp);
    // Per-beat timing: driven by narration length + visual complexity.
    const per = beatDuration(narration[i] ?? "", c.layers ?? []);
    const cam2 = c.layers.find((l: any) => l.type === "camera");
    if (cam2) {
      const endZoom = Math.max(3.5, Math.min((b.zoom ?? 5) + 0.4, 7.5));
      const mot = motionFromSemantics(narration[i] ?? "");
      // Content guard: a beat that shows a DATA map (choropleth/bubble/flows) or a
      // wide region must stay near top-down even if the narration sounds dramatic —
      // a tilted data map distorts what it encodes. Flatten pitch + neutral bearing.
      const flatBeat = (c.layers ?? []).some((l: any) => ["choropleth", "bubble"].includes(l.type))
        || (c.layers ?? []).filter((l: any) => l.type === "highlight").length >= 3;
      const pitch = flatBeat ? Math.min(mot.pitch, 12) : mot.pitch;
      const bearing = flatBeat ? 0 : mot.bearing;
      // Geographic match transition: each scene flies IN from the previous beat's
      // endpoint — so the multi-scene story is one continuous journey, not cuts.
      cam2.start = prevCamEnd
        ? { ...prevCamEnd }
        : { lon: b.lon, lat: b.lat, zoom: Math.max(2.2, endZoom - 2.2), pitch: Math.min(pitch, 12), bearing: 0 };
      cam2.end = { lon: b.lon, lat: b.lat, zoom: endZoom, pitch, bearing };
      cam2.waypoints = [];
      // Between scenes always fly-in (camera is already somewhere); first scene
      // uses the semantically-chosen motion.
      cam2.style = prevCamEnd ? "fly-in" : mot.style;
      cam2.smoothPath = false;
      prevCamEnd = { ...cam2.end };
    }
    // Keep ONLY the i-th chapter title in this scene; show it for the whole beat.
    let ti = 0;
    c.layers = c.layers.filter((l: any) => { if (l.type !== "title") return true; const keep = ti === i; ti++; return keep; });
    for (const l of c.layers) if (l.type === "title") (l as any).timing = { inSec: 0.3, outSec: null, enter: "slide-up", exit: "fade", easing: "easeInOut" };
    c.durationSec = per;
    c.narration = narration[i] ?? "";
    if (c.narration) c.look = { ...c.look, showCaptions: true };
    // Auto emotional grade: camera colour matches story beat emotion.
    const grade = gradeFromEmotion(c.narration);
    if (Object.keys(grade).length) c.look = { ...c.look, ...grade };
    scenes.push({ id: newId(), name: `Beat ${i + 1}`, narration: narration[i] ?? "", transition: i === 0 ? "cut" : "fade", transitionDuration: 0.6, composition: c });
  }
  return scenes;
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

export async function buildFromPlan(plan: Plan, opts: { story?: boolean; split?: boolean } = {}): Promise<Project> {
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
  if (typeof plan.cameraPitch === "number") (cam as any).end.pitch = Math.max(0, Math.min(84, plan.cameraPitch));
  if (typeof plan.cameraBearing === "number") (cam as any).end.bearing = plan.cameraBearing;

  // Multi-stop journey: fly THROUGH the cameraStops, ending at the focus. Use the
  // journey framing (a moderate lean), and keep waypoints zoomed-out enough to
  // read the route between beats.
  if (plan.cameraStops?.length && focus) {
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
  const overlays = plan.layers.slice(0, 7);
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

  let oi = 0;
  for (const pl of overlays) {
    // In multi-stop story mode, title layers mark beat transitions.
    if (pl.kind === "title" && oi > 0 && nBeats > 2) {
      currentBeat = Math.min(currentBeat + 1, nBeats - 1);
      withinBeatCount = 0;
    }
    const timing = { inSec: inAt(), outSec: null as number | null, enter: "fade" as const, exit: "fade" as const, easing: "easeInOut" as const };
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
        add(createLayer("title", { text: (pl.text || plan.title).toUpperCase(), sub: pl.sub ?? plan.subtitle ?? "", template: (pl.template as any) ?? "impact", position: (pl.position as any) ?? "bottom", timing, ...(pl.style ?? {}) }), pl.style);
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
        const geos = await Promise.all(places.map((p) => geocode(p)));
        const entries: unknown[] = geos.map((g, i) => ({
          place: places[i], value: values[i] ?? 0,
          label: pl.labels?.[i] ?? "",
          lon: g?.lon ?? 0, lat: g?.lat ?? 0,
          // sqrt scaling: equal area = equal value (perceptually honest)
          sizePx: g ? Math.round(20 + 120 * Math.sqrt(Math.max(0, values[i] ?? 0) / Math.max(1, maxVal))) : 0,
          color,
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

  // STORY MODE: sequence the chapter titles across the timeline so they play
  // one after another as the camera journeys through the beats (each appears,
  // holds, then yields to the next) — turning the fly-through into a narrative.
  if (opts.story) {
    const titles = deduped.filter((l) => l.type === "title");
    const n = titles.length;
    titles.forEach((t, i) => {
      const start = 0.06 * dur + (i / Math.max(1, n)) * 0.86 * dur;
      const end = 0.06 * dur + ((i + 1) / Math.max(1, n)) * 0.86 * dur;
      (t as any).timing = { inSec: Math.round(start * 100) / 100, outSec: n > 1 ? Math.round((end - 0.4) * 100) / 100 : null, enter: "slide-up", exit: "fade", easing: "easeInOut" };
    });
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
  const m3dc = (plan as any).map3dCustom;
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
    if (typeof m3dc.pitch === "number") (cam as any).end.pitch = Math.max(0, Math.min(84, m3dc.pitch));
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

  // MULTI-SCENE: when this is a story with distinct beats, emit one editable
  // scene per beat (the user can tweak each), instead of one continuous shot.
  // Robust: falls back to the single composition if splitting yields < 2 scenes.
  if (opts.split) {
    try {
      const narration = Array.isArray((plan as any).narration) ? (plan as any).narration : [];
      const scenes = splitStoryScenes(project.composition, dur, narration);
      if (scenes.length >= 2) {
        project.scenes = scenes;
        project.composition = scenes[0].composition;
        (project as any).activeSceneId = scenes[0].id;
      }
    } catch { /* keep the single-scene composition */ }
  }
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
  const pair = idea.match(/between\s+([\w'’-]+(?:\s+[\w'’-]+){0,2}?)\s+and\s+([\w'’-]+(?:\s+[\w'’-]+){0,2})/i)
    || idea.match(/\b([\w'’-]+(?:\s+[\w'’-]+){0,2}?)\s+(?:vs\.?|versus)\s+([\w'’-]+(?:\s+[\w'’-]+){0,2})/i);
  if (conflictWord && pair) {
    const a = titleCase(pair[1]), b = titleCase(pair[2]);
    return { title: "FRONTLINE", subtitle: `${a} – ${b}`, durationSec: 9, aspect: "16:9", basemapStyle: "dark", focus: a, mood: "conflict", motion: "zoom-out", palette: "Conflict Red", priority: "highlight",
      look: { vignette: 0.5, grain: 0.18, mapFilter: "noir", mapFilterAmount: 0.45 },
      layers: [{ kind: "conflict", a, b, swords: 4 }, { kind: "title", text: "FRONTLINE", sub: `${a} – ${b}`, template: "impact", position: "bottom" }] };
  }

  // ── EXPANSION / CONTRACTION → a highlight that GROWS (or shrinks) from origin ──
  const arch0 = matchArchetype(idea);
  if (arch0 && (arch0.name.startsWith("Expansion") || arch0.name.startsWith("Contraction"))) {
    const capsX = (idea.match(/\b([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})\b/g) || []).filter((c) => !/^(The|In|Of|And|At|On|How|Show|Why|When|Map|Rise)$/.test(c));
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
  const m = idea.match(/\b(?:in|of|about|over|across|through|from)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})/);
  const caps = idea.match(/[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3}/g) || [];
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
  const jp = idea.match(/\bfrom\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})\s+to\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})/);
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

  // 5) default — a mood-styled highlight (varies basemap + look by mood, terrain
  //    auto-on for mountainous subjects) so different ideas look different.
  const sm = styleForMood(mood);
  const isCountry = caps.length <= 2 && !/\b(city|town|valley|range|mountain|lake|river|desert|sea|gulf|bay|island)\b/.test(t);
  return { title: focus.toUpperCase().slice(0, 30), subtitle: sub, durationSec: 8, aspect: "16:9", basemapStyle: sm.basemapStyle as any, terrain: /mountain|alps|himalaya|andes|rockies|peak|range|valley|volcano|highland/.test(t), focus, mood, palette: MOOD_THEME[mood], priority: "highlight", look: sm.look as any,
    layers: [{ kind: "highlight", place: focus, fill: isCountry ? "flag" : "solid", mood }, { kind: "title", text: focus.toUpperCase(), sub, template: "impact", position: "bottom" }] };
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
  const placeRe = /\b([A-Z][\w'’-]+(?:\s+(?:of\s+)?[A-Z][\w'’-]+){0,3})\b/g;
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

  const energy = String(iv.energy ?? "");
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
  let body: { idea?: string; plan?: Plan; ai?: any; mode?: string; style?: string; interview?: any; interviewText?: string; arc?: ArcContext };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const idea = (body.idea ?? "").trim();
  const iv = body.interview && typeof body.interview === "object" ? body.interview : null;
  const ivText = (body.interviewText ?? "").toString().slice(0, 400);
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

  // The AI sees: the idea + interview constraints + the DIRECTOR FRAMEWORK (the
  // determined storyboard it must fill) + any arc continuity. So the model
  // researches facts and writes narration, but the structure + style stay
  // consistent per the framework, and chapters cohere into one film.
  const ideaForAI = [
    idea,
    ivText ? `Director constraints (honor these):\n${ivText}` : "",
    framework && aiCfg ? frameworkInstruction(framework) : "",
    arcText && aiCfg ? arcText : "",
  ].filter(Boolean).join("\n\n");
  const ai = (directPlan || !aiCfg) ? { plan: null as Plan | null } : await aiPlan(ideaForAI, aiCfg, withDoctrine(isStory ? STORY_SYSTEM : SYSTEM));
  const llmPlan = ai.plan;

  // STRICT AI MODE: when the user chose AI-directed, NEVER silently degrade to
  // the built-in heuristic parser — fail loudly so they can fix the key/model.
  // The heuristic is the engine ONLY when the user explicitly picks "Smart (no
  // AI)" (aiRequested=false) or supplies a finished template plan (directPlan).
  if (aiRequested && !directPlan) {
    if (!aiCfg) {
      return NextResponse.json({
        error: "AI-directed mode is on, but no AI provider is connected. Add your API key in Settings, or switch the engine to “Smart (no AI)”.",
        aiConfigured: false,
      }, { status: 400 });
    }
    if (!llmPlan) {
      return NextResponse.json({
        error: `AI-directed mode is on and the model didn't return a usable plan: ${ai.error ?? "unknown error"}. Not falling back to the built-in parser — check your key/model in Settings, then try again.`,
        aiConfigured: true,
      }, { status: 502 });
    }
  }

  const plan = directPlan ?? llmPlan ?? (isStory ? heuristicStoryPlan(idea) : heuristicPlan(idea));

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
  try {
    // Split a multi-beat story into editable per-beat scenes (the builder no-ops
    // the split when there aren't ≥2 distinct geographic beats, so single-place
    // animations stay one scene).
    const project = await buildFromPlan(plan, { story: isStory, split: isStory && ((framework?.multiScene ?? false) || !!directPlan) });
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to assemble project", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
