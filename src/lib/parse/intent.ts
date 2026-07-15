/**
 * Intent engine — a deterministic, rule-based interpretation layer that runs
 * BEFORE any animation/story generation. It spell-fixes, normalizes synonyms,
 * resolves multi-entity + continent requests, detects routes, translates
 * descriptive words into a visual style profile, and scores its own confidence
 * so the UI can show a "here's what I understood" preview (and ask for
 * clarification when unsure). No AI — pure, fast, testable.
 */
import { CONTINENTS, CONTINENT_ALIASES, PLACE_SET, PLACE_DISPLAY, VOCAB } from "./gazetteer";

export type StyleProfile = { style: string; camera: string; motion: string; pacing: string; mapTheme: string };
export type ActionKind = "highlight" | "camera" | "route" | "mixed" | "unknown";

export interface Interpretation {
  raw: string;
  corrected: string;
  corrections: { from: string; to: string }[];
  action: ActionKind;
  locations: string[];
  context: string | null;        // an establishing continent/region (e.g. "Europe")
  expandedFrom: string | null;   // set when a continent was expanded to its countries
  route: { from: string; to: string; via: string[] } | null;
  style: StyleProfile | null;
  durationSec: number;
  confidence: number;            // 0..1
  needsClarification: boolean;
  preview: string[];
}

/* ── Spell correction ─────────────────────────────────────────────────────── */

const COMMON: Record<string, string> = {
  frnace: "france", germnay: "germany", germony: "germany", spian: "spain", itly: "italy", japn: "japan", japa: "japan",
  englad: "england", portgual: "portugal", brasil: "brazil", chinaa: "china",
  highkight: "highlight", higlight: "highlight", hilight: "highlight", highligt: "highlight", higlght: "highlight",
  cinamtic: "cinematic", cinematc: "cinematic", cimenatic: "cinematic", documentry: "documentary", documantary: "documentary",
  adventrue: "adventure", advnture: "adventure", jorney: "journey", joruney: "journey", contry: "country", contries: "countries",
  europ: "europe", eruope: "europe", asai: "asia", afica: "africa", afrca: "africa", vintge: "vintage", luxruy: "luxury",
};

// Common English words that sit within 1–2 edits of a place name and must NEVER
// be auto-snapped to one (roman→oman/romania, iron→iran, main→spain, …). Story
// prompts are full of these; corrupting them silently rewrites the storyline.
const NEVER_FIX = new Set([
  "roman", "romans", "empire", "empires", "imperial", "across", "rise", "risen", "rose",
  "fall", "fallen", "fell", "great", "greater", "greatest", "world", "worlds", "war", "wars",
  "iron", "main", "story", "stories", "born", "grew", "grow", "grown", "spread", "moved", "move",
  "came", "come", "conquered", "conquest", "expansion", "expanded", "golden", "gold", "silver",
  "ancient", "modern", "early", "late", "ruled", "rule", "ruler", "rulers", "reign", "age", "era",
  "north", "south", "east", "west", "central", "coast", "ocean", "river", "deep", "wide", "long",
  "trade", "trades", "route", "routes", "path", "paths", "land", "lands", "sea", "seas", "born",
  "king", "kings", "queen", "empire", "nation", "nations", "people", "peoples", "tribe", "tribes",
]);

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
  }
  return d[m][n];
}

const VOCAB_ARR = Array.from(VOCAB);
function closest(w: string): string | null {
  const thresh = w.length <= 4 ? 1 : 2;
  let best: string | null = null, bestD = thresh + 1;
  for (const v of VOCAB_ARR) {
    if (Math.abs(v.length - w.length) > thresh) continue;
    const d = lev(w, v);
    if (d < bestD) { bestD = d; best = v; if (d === 0) break; }
  }
  return bestD <= thresh ? best : null;
}

const matchCase = (orig: string, fix: string) => (orig[0] === orig[0]?.toUpperCase() ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix);

export function spellfix(text: string): { corrected: string; corrections: { from: string; to: string }[] } {
  const corrections: { from: string; to: string }[] = [];
  const corrected = text.replace(/[A-Za-z]+/g, (w) => {
    const lw = w.toLowerCase();
    if (lw.length < 3 || VOCAB.has(lw)) return w;
    if (COMMON[lw]) { corrections.push({ from: w, to: COMMON[lw] }); return matchCase(w, COMMON[lw]); }
    if (NEVER_FIX.has(lw)) return w; // real English word — don't snap to a place
    const fix = closest(lw);
    if (fix && fix !== lw) { corrections.push({ from: w, to: fix }); return matchCase(w, fix); }
    return w;
  });
  return { corrected, corrections };
}

/* ── Synonyms / actions ───────────────────────────────────────────────────── */

const HIGHLIGHT_RE = /\b(highlight|mark|focus on|emphasi[sz]e|show|colou?r|fill|outline|reveal|display)\b/i;
const CAMERA_RE = /\b(zoom|fly (?:to|into|over)|move to|go to|travel to|navigate to|pan|dive into)\b/i;
const ROUTE_NOUN_RE = /\b(route|journey|road ?trip|flight|trip|expedition|voyage|traveled|travelled)\b/i;

/* ── Style translation ───────────────────────────────────────────────────── */

const STYLES: Record<string, StyleProfile> = {
  cinematic: { style: "Cinematic", camera: "Smooth", motion: "Controlled", pacing: "Medium", mapTheme: "Documentary" },
  epic: { style: "Epic", camera: "Dynamic", motion: "Fast", pacing: "High energy", mapTheme: "Adventure" },
  documentary: { style: "Documentary", camera: "Steady", motion: "Restrained", pacing: "Measured", mapTheme: "Documentary" },
  vintage: { style: "Vintage", camera: "Slow", motion: "Gentle", pacing: "Slow", mapTheme: "Historical" },
  modern: { style: "Modern", camera: "Clean", motion: "Minimal", pacing: "Brisk", mapTheme: "Minimal" },
  news: { style: "News", camera: "Direct", motion: "Snappy", pacing: "Fast", mapTheme: "Clean" },
  luxury: { style: "Luxury", camera: "Slow", motion: "Elegant", pacing: "Slow", mapTheme: "Premium" },
  dynamic: { style: "Dynamic Social", camera: "Punchy", motion: "Aggressive", pacing: "Very fast", mapTheme: "Bold" },
  adventure: { style: "Adventure / Explorer", camera: "Dynamic", motion: "Sweeping", pacing: "High energy", mapTheme: "Adventure" },
};
// Trigger word → style key (priority: explicit style names first, then moods).
const STYLE_TRIGGERS: [RegExp, keyof typeof STYLES][] = [
  [/\bcinematic\b/i, "cinematic"], [/\bepic\b/i, "epic"], [/\bdocumentary\b/i, "documentary"],
  [/\bvintage\b|\bold[- ]?map\b|\bhistoric(al)?\b|\bantique\b/i, "vintage"],
  [/\bmodern\b|\bminimal(ist)?\b|\bclean\b/i, "modern"],
  [/\bnews\b|\bbreaking\b|\breport\b/i, "news"],
  [/\bluxury\b|\bpremium\b|\belegant\b|\bluxe\b/i, "luxury"],
  [/\b(tiktok|reel|short|social|punchy|snappy)\b/i, "dynamic"],
  [/\bepic\b|\bdramatic\b|\bsweeping\b|\bgrand\b/i, "epic"],
  [/\badventure\b|\bexpedition\b|\bexplorer?\b/i, "adventure"],
];
function detectStyle(text: string): StyleProfile | null {
  for (const [re, key] of STYLE_TRIGGERS) if (re.test(text)) return STYLES[key];
  return null;
}

/* ── Location resolution ──────────────────────────────────────────────────── */

const resolvePlace = (frag: string): string | null => {
  const f = frag.trim().replace(/^(the|a|an|of|in|into|to|from)\s+/i, "").replace(/[.?!]+$/, "").trim();
  if (!f) return null;
  const lf = f.toLowerCase();
  if (PLACE_DISPLAY[lf]) return PLACE_DISPLAY[lf];
  if (PLACE_SET.has(lf)) return f.replace(/\b\w/g, (c) => c.toUpperCase());
  // Unknown but plausible (≤4 words, alphabetic) → Title-case and let the geocoder resolve it.
  if (/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(f) && f.split(/\s+/).length <= 4) {
    const stop = new Set(["all", "countries", "country", "world", "map", "everything", "them", "it"]);
    if (stop.has(lf)) return null;
    // Art-direction is never geography. Trailing craft phrases ("…, vintage atlas
    // style", "…map animation") get split into fragments here and would otherwise
    // Title-case into phantom route stops / highlights. These words never appear
    // in a real place name, so rejecting them is safe (known places resolved above).
    if (/\b(styles?|animation|animated|documentary|cinematic|voiceover|narration|flythrough|aesthetic|filmic|montage)\b/i.test(f)) return null;
    return f.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
};

/** Ordered, de-duped KNOWN places mentioned (longest-match first to avoid e.g.
 *  "York" inside "New York"). */
function scanKnownPlaces(text: string): string[] {
  const lower = text.toLowerCase();
  const names = Object.keys(PLACE_DISPLAY).concat(Object.keys(CONTINENTS)).sort((a, b) => b.length - a.length);
  const taken: [number, number][] = [];
  const hits: { name: string; idx: number }[] = [];
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = re.exec(lower);
    if (!m) continue;
    const s = m.index, e = s + n.length;
    if (taken.some(([ts, te]) => s < te && e > ts)) continue; // overlaps a longer match
    taken.push([s, e]);
    hits.push({ name: PLACE_DISPLAY[n] ?? n.replace(/\b\w/g, (c) => c.toUpperCase()), idx: s });
  }
  return hits.sort((a, b) => a.idx - b.idx).map((h) => h.name);
}

function continentKey(text: string): string | null {
  const lower = text.toLowerCase();
  for (const k of Object.keys(CONTINENTS)) if (lower.includes(k)) return k;
  for (const [alias, k] of Object.entries(CONTINENT_ALIASES)) if (lower.includes(alias)) return k;
  return null;
}

function extractRoute(text: string): { from: string; to: string; via: string[] } | null {
  // Only LITERAL arrows denote a route. Em/en-dashes (— –) are ordinary prose
  // punctuation ("…Brazil — a punchy 15s cut") — treating them as arrows made a
  // "Highlight France, Italy, Japan, Brazil — …" prompt mis-parse as a route AND
  // dropped the country bundled with the leading clause. Real routes still work
  // via arrows, "from…to", route nouns, or a bare "X to Y".
  const arrow = /→|->/.test(text);
  const fromTo = /\bfrom\b[\s\S]+\bto\b/i.test(text);
  const routeNoun = ROUTE_NOUN_RE.test(text);
  const startsWithVerb = /^\s*(zoom|fly|move|go|travel|navigate|pan|dive|show|highlight|mark|focus|reveal|display|emphasi[sz]e|colou?r|fill|outline)\b/i.test(text);
  if (!arrow && !fromTo && !routeNoun) {
    // "Paris to Rome" — bare place-to-place, not led by an action verb.
    if (!(/\bto\b/i.test(text) && !startsWithVerb && scanKnownPlaces(text).length >= 2)) return null;
  }
  let t = text;
  const fi = t.toLowerCase().indexOf("from ");
  if (fi >= 0) t = t.slice(fi + 5); // start after the first "from"
  t = t.replace(/\b(show|create|make|animate|the|my|a|an|i|we|us|travel(?:led|ed)?|trip|journey|route|road ?trip|flight|then|expedition|voyage)\b/gi, " ");
  const seq = t.split(/→|->|—|–|\bto\b|\bthrough\b|\bvia\b|,/i).map((s) => resolvePlace(s)).filter((s): s is string => !!s);
  const uniq = seq.filter((s, i) => seq.indexOf(s) === i);
  if (uniq.length < 2) return null;
  return { from: uniq[0], to: uniq[uniq.length - 1], via: uniq.slice(1, -1) };
}

function textAfterAction(text: string): string {
  const m = text.match(/\b(highlight|mark|focus on|emphasi[sz]e|show|colou?r|fill|outline|reveal|display|zoom (?:to|into)|into)\b([\s\S]+)/i);
  return m ? m[2] : text;
}

/* ── Top-level interpret ──────────────────────────────────────────────────── */

export function interpret(prompt: string): Interpretation {
  const raw = prompt;
  const { corrected, corrections } = spellfix(prompt);
  const style = detectStyle(corrected);
  const wantsCamera = CAMERA_RE.test(corrected);
  const wantsHighlight = HIGHLIGHT_RE.test(corrected);

  // 1) Continent expansion ("all countries in South America")
  let locations: string[] = [];
  let expandedFrom: string | null = null;
  let context: string | null = null;
  const ck = continentKey(corrected);
  const wantsAll = /\b(all|every|each)\b/i.test(corrected) && /\bcountr/i.test(corrected);
  if (ck && wantsAll) {
    locations = [...CONTINENTS[ck]];
    expandedFrom = ck.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // 2) Route
  const route = locations.length ? null : extractRoute(corrected);

  // 3) Multi-entity / single locations
  if (!locations.length && !route) {
    const known = scanKnownPlaces(corrected);
    if (known.length >= 1) {
      locations = known;
    } else if (wantsHighlight || wantsCamera) {
      // list-split fallback for UNKNOWN places, but only when there's a clear
      // action verb — otherwise random/gibberish input must NOT become locations.
      const part = textAfterAction(corrected);
      locations = part.split(/,|\band\b|\bthen\b|\binto\b/i).map(resolvePlace).filter((s): s is string => !!s);
    }
    // If a continent/region leads a "from X into Y…" framing, treat it as context.
    if (ck && locations.length > 1 && locations[0].toLowerCase() === ck) {
      context = locations.shift() ?? null;
    } else if (ck && locations.length > 1 && CONTINENTS[ck] && /\bfrom\b/i.test(corrected) && locations.some((l) => l.toLowerCase() === ck)) {
      context = locations.find((l) => l.toLowerCase() === ck) ?? null;
      locations = locations.filter((l) => l.toLowerCase() !== ck);
    }
  }

  // 4) Action
  let action: ActionKind = "unknown";
  if (route) action = "route";
  else if (wantsCamera && (wantsHighlight || locations.length)) action = "mixed";
  else if (wantsHighlight) action = "highlight";
  else if (wantsCamera) action = "camera";
  else if (locations.length) action = "highlight"; // a bare place list ⇒ highlight intent
  if ((action === "camera" || action === "mixed") && context == null && ck && locations.length && !locations.some((l) => l.toLowerCase() === ck)) {
    context = ck.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // 5) Confidence
  const knownCount = locations.filter((l) => PLACE_SET.has(l.toLowerCase())).length + (route ? [route.from, route.to, ...route.via].filter((l) => PLACE_SET.has(l.toLowerCase())).length : 0);
  const total = locations.length + (route ? 2 + route.via.length : 0);
  let confidence = 0.4;
  if (total > 0) confidence += 0.35 * Math.min(1, knownCount / Math.max(1, total)) + 0.1;
  if (action !== "unknown") confidence += 0.1;
  if (style) confidence += 0.05;
  if (expandedFrom) confidence = Math.max(confidence, 0.9);
  if (!total) confidence = Math.min(confidence, 0.45);
  confidence = Math.max(0, Math.min(1, confidence));

  // 6) Duration
  const n = total || 1;
  const durationSec = route ? Math.min(24, 8 + (2 + route.via.length) * 2) : Math.min(28, Math.max(6, Math.round(6 + n * 1.5)));

  // 7) Preview checklist
  const preview: string[] = [];
  if (context) preview.push(`Establish ${context}`);
  if (route) preview.push(`Route ${route.from} → ${[...route.via, route.to].join(" → ")}`);
  for (const l of locations) preview.push(`${action === "camera" ? "Fly to" : "Highlight"} ${l}`);
  if (style) { preview.push(`Style: ${style.style}`, `Camera: ${style.camera}`, `Map theme: ${style.mapTheme}`); }
  preview.push(`Length: ~${durationSec}s`);

  return {
    raw, corrected, corrections, action, locations, context, expandedFrom, route, style, durationSec,
    confidence, needsClarification: confidence < 0.55, preview,
  };
}
