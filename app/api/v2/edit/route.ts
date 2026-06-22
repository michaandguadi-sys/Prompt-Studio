/**
 * POST /api/v2/edit — consistency-preserving, in-editor AI edit of ONE scene.
 *
 * The whole point: when a generated scene is ALMOST right, the user fixes it in
 * plain English ("make the route red", "add crossing swords on the border",
 * "make it look like an old map", "zoom in more", "remove the title") and we
 * return the FEWEST possible operations — patches to existing layers, not a new
 * composition. Everything the user didn't mention stays exactly as it was.
 *
 * A deterministic heuristic covers the common edits with NO API key; the
 * configured model handles the long tail. Both speak the same minimal op list,
 * which the client applies through the normal undoable store mutations.
 */
import { NextRequest, NextResponse } from "next/server";
import { aiComplete, resolveAIConfig, configFromUser } from "@/lib/ai/providers";

type Patch = Record<string, unknown>;
type EditOp =
  | { op: "patchLayer"; target: string; patch: Patch }
  | { op: "addLayer"; layerType: string; props?: Patch; at?: string }
  | { op: "removeLayer"; target: string }
  | { op: "patchLook"; patch: Patch }
  | { op: "patchBasemap"; patch: Patch }
  | { op: "patchComposition"; patch: Patch }
  | { op: "patchTheme"; patch: Patch };

type LayerSummary = {
  id: string;
  type: string;
  name?: string;
  /** A few identifying fields so heuristic + model can target by place/text. */
  place?: string;
  text?: string;
  color?: string;
};
type Ctx = {
  layers: LayerSummary[];
  look?: Record<string, unknown>;
  basemap?: Record<string, unknown>;
  camera?: { endZoom?: number; endPitch?: number; style?: string; moveFraction?: number };
  durationSec?: number;
};

// ── small lexicons ───────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  red: "#ef4444", crimson: "#dc2626", scarlet: "#ff3b30", blood: "#b91c1c",
  orange: "#f97316", amber: "#f59e0b", gold: "#FFD700", golden: "#FFD700",
  yellow: "#facc15", lime: "#84cc16", green: "#22c55e", emerald: "#10b981",
  teal: "#14b8a6", cyan: "#06b6d4", sky: "#38bdf8", blue: "#3b82f6",
  navy: "#1e3a8a", indigo: "#6366f1", iris: "#6E7BFF", violet: "#8b5cf6",
  purple: "#a855f7", magenta: "#ec4899", pink: "#f472b6", rose: "#fb7185",
  brown: "#92400e", tan: "#d6b370", white: "#ffffff", black: "#0a0a0a",
  gray: "#9ca3af", grey: "#9ca3af", silver: "#cbd5e1", slate: "#64748b",
};
function colorIn(text: string): string | null {
  for (const [name, hex] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return hex;
  }
  const hx = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  return hx ? hx[0] : null;
}

const MARKER_WORDS: Record<string, string> = {
  sword: "swords", swords: "swords", battle: "swords", war: "swords", fight: "swords",
  conflict: "swords", clash: "swords", combat: "swords",
  explosion: "explosion", blast: "explosion", bomb: "explosion", strike: "explosion",
  fire: "fire", flame: "fire", burning: "fire", wildfire: "fire",
  skull: "skull", death: "skull", casualt: "skull",
  alert: "alert", warning: "alert", danger: "alert",
  radiation: "radiation", nuclear: "radiation", radioactive: "radiation",
  biohazard: "biohazard", virus: "biohazard", disease: "biohazard", outbreak: "biohazard",
  crown: "crown", king: "crown", monarch: "crown", royal: "crown", empire: "crown",
  anchor: "anchor", port: "anchor", harbor: "anchor", harbour: "anchor", naval: "anchor",
  plane: "plane", airstrike: "plane", aircraft: "plane", flight: "plane",
  tank: "tank", army: "tank", military: "tank", invasion: "tank", troops: "tank",
  ship: "ship", fleet: "ship", boat: "ship",
  oil: "oil", petroleum: "oil", drilling: "oil",
  money: "money", economy: "money", wealth: "money", trade: "money", finance: "money",
  factory: "factory", industry: "factory", manufacturing: "factory", industrial: "factory",
  landmark: "landmark", capital: "landmark", city: "landmark", monument: "landmark",
  target: "target", objective: "target", aim: "target",
  star: "star", heart: "heart", cross: "cross",
};
function markerIconIn(text: string): string | null {
  for (const [word, icon] of Object.entries(MARKER_WORDS)) {
    if (new RegExp(`\\b${word}`).test(text)) return icon;
  }
  return null;
}

// Common country → ISO-2 for flag/highlight adds. The model fills any gaps.
const ISO: Record<string, string> = {
  france: "FR", germany: "DE", italy: "IT", spain: "ES", portugal: "PT",
  "united kingdom": "GB", uk: "GB", britain: "GB", england: "GB",
  ireland: "IE", netherlands: "NL", belgium: "BE", switzerland: "CH",
  austria: "AT", poland: "PL", ukraine: "UA", russia: "RU", "united states": "US",
  usa: "US", us: "US", america: "US", canada: "CA", mexico: "MX", brazil: "BR",
  argentina: "AR", china: "CN", japan: "JP", india: "IN", pakistan: "PK",
  "south korea": "KR", korea: "KR", "north korea": "KP", vietnam: "VN",
  thailand: "TH", indonesia: "ID", australia: "AU", "new zealand": "NZ",
  egypt: "EG", "south africa": "ZA", nigeria: "NG", kenya: "KE", turkey: "TR",
  "saudi arabia": "SA", iran: "IR", iraq: "IQ", israel: "IL", greece: "GR",
  sweden: "SE", norway: "NO", denmark: "DK", finland: "FI", czechia: "CZ",
};
function isoIn(text: string): string | null {
  const t = text.toLowerCase();
  for (const [name, iso] of Object.entries(ISO)) if (t.includes(name)) return iso;
  return null;
}

// ── layer targeting ──────────────────────────────────────────────────────────

const TYPE_WORDS: Record<string, string[]> = {
  route: ["route", "journey", "path", "line", "trip", "trail", "arrow"],
  highlight: ["highlight", "country", "region", "area", "border", "fill", "shape", "territory", "nation", "state", "province"],
  title: ["title", "heading", "headline", "header"],
  label: ["label", "caption", "pin", "tag", "name tag", "callout box", "banner"],
  marker: ["marker", "symbol", "icon", "swords", "sword", "explosion", "fire", "skull", "emoji"],
  flag: ["flag"],
  chart: ["chart", "graph", "counter", "number", "bar", "line chart", "stat"],
  connections: ["connection", "connections", "network", "arc", "arcs", "links", "web"],
  spotlight: ["spotlight", "spot", "focus circle"],
  annotation: ["annotation", "callout", "leader", "note"],
  image: ["image", "photo", "picture", "logo"],
  camera: ["camera", "shot", "view", "framing"],
};

/** Resolve a free-text reference to a concrete layer id (or null). */
function targetLayer(ref: string, layers: LayerSummary[], preferType?: string): LayerSummary | null {
  const t = ref.toLowerCase();
  // explicit place/text/name match first (most specific)
  let byName = layers.find(
    (l) => (l.place && t.includes(l.place.toLowerCase())) || (l.text && l.text.length > 2 && t.includes(l.text.toLowerCase())) || (l.name && l.name.length > 2 && t.includes(l.name.toLowerCase())),
  );
  if (byName && (!preferType || byName.type === preferType)) return byName;
  // by type word
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) {
      const hit = layers.find((l) => l.type === type);
      if (hit) return hit;
    }
  }
  if (preferType) { const hit = layers.find((l) => l.type === preferType); if (hit) return hit; }
  return byName ?? null;
}

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── the deterministic heuristic ──────────────────────────────────────────────

function heuristicEdits(cmd: string, ctx: Ctx): EditOp[] | null {
  const c = cmd.trim();
  const lc = " " + c.toLowerCase() + " ";
  const L = ctx.layers;
  const ops: EditOp[] = [];
  const has = (re: RegExp) => re.test(lc);
  const remove = has(/\b(remove|delete|drop|hide|get rid of|no more|take out|kill)\b/);
  const more = has(/\b(more|increase|stronger|harder|heavier|bigger|larger|thicker|bolder|taller|higher|deeper|intense|intensify|boost|punch)\b/);
  const less = has(/\b(less|reduce|weaker|softer|lighter|smaller|thinner|subtle|gentle|lower|flatten|tone down|dial)\b/);

  // ════ LOOK / GRADE ════
  {
    const lookPatch: Patch = {};
    if (has(/\b(old|antique|aged|vintage|historical|parchment|ancient)\b/) && has(/\bmap\b|\blook\b|\bstyle\b|\bmake it\b/)) { lookPatch.mapFilter = "antique"; lookPatch.mapFilterAmount = 0.9; }
    else if (has(/\bsepia\b/)) { lookPatch.mapFilter = "sepia"; lookPatch.mapFilterAmount = 0.85; }
    else if (has(/\b(noir|black ?and ?white|b ?& ?w|monochrome|grayscale|greyscale)\b/)) { lookPatch.mapFilter = "noir"; lookPatch.mapFilterAmount = 0.95; }
    else if (has(/\bblueprint\b/)) { lookPatch.mapFilter = "blueprint"; lookPatch.mapFilterAmount = 0.9; }
    else if (has(/\bcool(er)?\b/) && has(/\bgrade|tone|colou?r|look\b/)) lookPatch.mapFilter = "cool";
    else if (has(/\bwarm(er)?\b/) && has(/\bgrade|tone|colou?r|look\b/)) lookPatch.mapFilter = "warm";
    else if (has(/\b(true ?colou?r|real colou?r|no grade|natural|reset (the )?(grade|look)|remove (the )?grade)\b/)) { lookPatch.mapFilter = "none"; lookPatch.mapFilterAmount = 0; }

    if (has(/\bgrain\b|\bfilm grain\b|\bnoise\b/)) lookPatch.grain = remove || less ? 0 : more ? 0.55 : 0.32;
    if (has(/\bvignette\b/)) lookPatch.vignette = remove || less ? 0 : more ? 0.55 : 0.38;
    if (has(/\b(letterbox|cinematic bars|widescreen bars|black bars|cinema bars)\b/)) lookPatch.letterbox = remove ? 0 : more ? 0.16 : 0.11;
    if (has(/\b(paper|parchment)\b/) && has(/\btexture\b/)) { lookPatch.texture = "paper"; lookPatch.textureOpacity = 0.5; }
    if (has(/\bhalftone\b/)) { lookPatch.texture = "halftone"; lookPatch.textureOpacity = 0.45; }
    if (has(/\bscanlines?\b/)) { lookPatch.texture = "scanlines"; lookPatch.textureOpacity = 0.4; }

    if (has(/\b(cinematic|moody|dramatic|filmic|movie|epic|atmospheric)\b/)) {
      lookPatch.vignette = 0.4; lookPatch.grain = 0.16; lookPatch.letterbox = 0.1; lookPatch.tintOpacity = 0.18;
    }
    // ── 3-way colour grade (shadows / mids / highlights) ──
    if (has(/\b(teal ?(?:and|&|\/)? ?orange|orange ?(?:and|&|\/)? ?teal|blockbuster|hollywood)\b/)) { lookPatch.gradeShadow = "#1f6f7a"; lookPatch.gradeHigh = "#e8852e"; }
    else {
      const bandHex = colorIn(lc) || (has(/\bwarm\b/) ? "#f0a83c" : has(/\b(cool|cold)\b/) ? "#3a78c8" : null);
      if (bandHex) {
        if (has(/\bshadows?\b/)) lookPatch.gradeShadow = bandHex;
        if (has(/\b(highlights?|brights?|whites?)\b/)) lookPatch.gradeHigh = bandHex;
        if (has(/\b(mids?|midtones?)\b/)) lookPatch.gradeMid = bandHex;
      }
    }
    if (has(/\b(reset|remove|clear) (the )?(grade|colou?r ?grade|wheels?|tint)\b/)) { lookPatch.gradeShadow = ""; lookPatch.gradeMid = ""; lookPatch.gradeHigh = ""; }
    if (Object.keys(lookPatch).length) ops.push({ op: "patchLook", patch: lookPatch });
  }

  // ════ BASEMAP (map itself, not the grade) ════
  {
    const bm: Patch = {};
    if (has(/\b(terrain|mountains?|relief|elevation|3 ?d terrain)\b/)) {
      if (remove || less || has(/\bflat|flatten\b/)) { bm.terrainStrength = 0; }
      else { bm.terrain = true; bm.terrainStrength = more ? 3.5 : 2.2; }
      if (!(remove || less)) bm.terrain = true;
    }
    const waterM = lc.match(/\b(?:water|ocean|sea|oceans)\b[^.]*?\b(red|crimson|orange|amber|gold|golden|yellow|lime|green|emerald|teal|cyan|sky|blue|navy|indigo|violet|purple|magenta|pink|rose|brown|tan|white|black|gray|grey|silver|slate)\b/);
    if (waterM) bm.waterColor = COLORS[waterM[1]] ?? null;
    const landM = lc.match(/\b(?:land|continents?|ground|terrain colou?r)\b[^.]*?\b(red|crimson|orange|amber|gold|golden|yellow|lime|green|emerald|teal|cyan|sky|blue|navy|indigo|violet|purple|magenta|pink|rose|brown|tan|white|black|gray|grey|silver|slate)\b/);
    if (landM) bm.landColor = COLORS[landM[1]] ?? null;
    if (has(/\b(show|add) (the )?(streets?|roads?)\b/)) bm.showStreets = true;
    if (has(/\b(hide|remove|no) (the )?(streets?|roads?)\b/)) bm.showStreets = false;
    if (has(/\b(hide|remove|no) (the )?labels?\b/)) bm.showLabels = false;
    if (has(/\b(show|add) (the )?labels?\b/)) bm.showLabels = true;
    const yearM = c.match(/\b(?:year|in|as of|set (?:the )?year to|borders? (?:of|in))\s+(1[0-9]{3}|20[0-2][0-9])\b/i);
    if (yearM) bm.mapYear = yearM[1];
    if (Object.keys(bm).length) ops.push({ op: "patchBasemap", patch: bm });
  }

  // ════ CAMERA ════
  {
    const cam = L.find((l) => l.type === "camera");
    if (cam) {
      const camPatch: Patch = {};
      if (has(/\b(zoom in|closer|tighter|push in)\b/)) camPatch.endZoomDelta = more ? 2 : 1.3;
      else if (has(/\b(zoom out|wider|further|pull back|further out|back out)\b/)) camPatch.endZoomDelta = -(more ? 2 : 1.3);
      if (has(/\borbit\b/)) camPatch.style = "orbit";
      else if (has(/\bfly ?in\b/)) camPatch.style = "fly-in";
      else if (has(/\bpush ?in\b/)) camPatch.style = "push-in";
      else if (has(/\bpan\b/)) camPatch.style = "pan";
      else if (has(/\b(hold|static|locked|stop moving|no (camera )?(move|movement|motion)|don'?t move|freeze)\b/)) camPatch.style = "hold";
      else if (has(/\bzoom out\b/) && has(/\breveal\b/)) camPatch.style = "zoom-out";
      if (has(/\bslow(er)?\b/) && has(/\bcamera|move|pan|zoom|motion\b/)) camPatch.moveFraction = 1;
      if (has(/\bfast(er)?\b/) && has(/\bcamera|move|pan|zoom|motion\b/)) camPatch.moveFraction = 0.6;
      if (has(/\b(more )?(tilt|pitch|3 ?d angle|angle)\b/) && !less && !remove) camPatch.endPitchDelta = more ? 25 : 15;
      if (has(/\b(flat|top ?down|no tilt|straight down|overhead|birds? ?eye)\b/)) camPatch.endPitch = 0;
      if (Object.keys(camPatch).length) ops.push({ op: "patchLayer", target: cam.id, patch: camPatch });
    }
    if (remove && has(/\bcamera|camera move|camera movement\b/)) {
      // "remove the camera move" → hold instead of deleting (every comp needs a camera)
      const camL = L.find((l) => l.type === "camera");
      if (camL) ops.push({ op: "patchLayer", target: camL.id, patch: { style: "hold", moveFraction: 1 } });
    }
  }

  // ════ DURATION ════
  {
    const secM = c.match(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/);
    if (secM && has(/\b(long|short|duration|second|sec|make it|set)\b/) && !has(/\bdelay|fade|hold for\b/)) {
      ops.push({ op: "patchComposition", patch: { durationSec: clampNum(parseFloat(secM[1]), 1, 60) } });
    } else if (has(/\bmake it (much )?longer\b|\bslow(er)? overall\b/)) {
      ops.push({ op: "patchComposition", patch: { durationSecDelta: ctx.durationSec ? Math.max(2, ctx.durationSec * 0.5) : 3 } });
    } else if (has(/\bmake it (much )?shorter\b|\bspeed it up\b/)) {
      ops.push({ op: "patchComposition", patch: { durationSecDelta: -(ctx.durationSec ? Math.max(1.5, ctx.durationSec * 0.35) : 2) } });
    }
  }

  // ════ ADD an element ════
  {
    const addM = has(/\b(add|put|place|drop|insert|show|mark|stick)\b/);
    if (addM && !remove) {
      const icon = markerIconIn(lc);
      // "add crossing swords on the border / on India / there"
      if (icon || has(/\b(swords?|crossing swords|explosion|conflict|war symbol)\b/)) {
        const atRef = c.match(/\b(?:on|over|at|in|near|along)\s+(?:the\s+)?([A-Z][\w'’\- ]+?)(?:\s+(?:border|coast|region|area|front|line))?\s*$/);
        const at = atRef ? atRef[1].trim() : (L.find((l) => l.type === "highlight")?.place || "center");
        ops.push({ op: "addLayer", layerType: "marker", at, props: { icon: icon ?? "swords", animation: "pop", color: has(/\b(war|conflict|battle|fight|blood)\b/) ? "#ef4444" : "#ff5a44" } });
      } else if (has(/\bflag\b/)) {
        const iso = isoIn(lc);
        const atRef = c.match(/\b(?:on|over|of|for)\s+(?:the\s+)?([A-Z][\w'’\- ]+)\s*$/);
        ops.push({ op: "addLayer", layerType: "flag", at: atRef ? atRef[1].trim() : (L.find((l) => l.type === "highlight")?.place || "center"), props: iso ? { iso } : {} });
      } else if (has(/\b(spotlight|focus circle|darken everything except)\b/)) {
        const atRef = c.match(/\b(?:on|over|at)\s+(?:the\s+)?([A-Z][\w'’\- ]+)\s*$/);
        ops.push({ op: "addLayer", layerType: "spotlight", at: atRef ? atRef[1].trim() : "center", props: {} });
      } else if (has(/\b(label|caption|pin|name tag)\b/)) {
        const textM = c.match(/["“]([^"”]+)["”]/) || c.match(/\b(?:saying|labelled|labeled|that says|reading|with text)\s+(.+?)\s*$/i);
        const atRef = c.match(/\b(?:on|over|at|near)\s+(?:the\s+)?([A-Z][\w'’\- ]+)\s*$/);
        ops.push({ op: "addLayer", layerType: "label", at: atRef ? atRef[1].trim() : "center", props: textM ? { text: textM[1].slice(0, 40) } : {} });
      } else if (has(/\b(annotation|callout|leader line|note)\b/)) {
        const textM = c.match(/["“]([^"”]+)["”]/);
        ops.push({ op: "addLayer", layerType: "annotation", at: "center", props: textM ? { text: textM[1].slice(0, 60) } : {} });
      } else if (has(/\b(title|heading)\b/) && !L.some((l) => l.type === "title")) {
        const textM = c.match(/["“]([^"”]+)["”]/) || c.match(/\b(?:titled|title|saying|that says)\s+(.+?)\s*$/i);
        ops.push({ op: "addLayer", layerType: "title", props: textM ? { text: textM[1].slice(0, 60).toUpperCase() } : {} });
      }
    }
  }

  // ════ REMOVE an element ════
  if (remove) {
    const tgt = targetLayer(c, L);
    if (tgt && tgt.type !== "camera") ops.push({ op: "removeLayer", target: tgt.id });
  }

  // ════ RECOLOUR ════
  {
    const col = colorIn(lc);
    const recolorVerb = has(/\b(make|colou?r|turn|paint|set|change|recolou?r|tint)\b/);
    if (col && recolorVerb && !ops.some((o) => o.op === "patchLook" || o.op === "patchBasemap")) {
      // "everything" / "all" / "whole palette" → theme accent + recolour each primary
      if (has(/\b(everything|all of it|whole (thing|palette|map)|the palette|all the colou?rs?)\b/)) {
        ops.push({ op: "patchTheme", patch: { accent: col, fill: col, border: col, glow: col } });
      } else {
        const onlyBorder = has(/\bborder\b/) && !has(/\bfill\b/);
        const onlyFill = has(/\bfill\b/) && !has(/\bborder\b/);
        const tgt = targetLayer(c, L);
        if (tgt) {
          if (tgt.type === "highlight") {
            const p: Patch = {};
            if (onlyBorder) p.borderColor = col;
            else if (onlyFill) p.fillColor = col;
            else { p.fillColor = col; p.borderColor = col; p.glowColor = col; }
            ops.push({ op: "patchLayer", target: tgt.id, patch: p });
          } else if (tgt.type === "route" || tgt.type === "connections") {
            ops.push({ op: "patchLayer", target: tgt.id, patch: { color: col } });
          } else if (tgt.type === "title" || tgt.type === "label" || tgt.type === "annotation") {
            ops.push({ op: "patchLayer", target: tgt.id, patch: has(/\btext\b/) ? { color: col } : { accent: col } });
          } else if (tgt.type === "marker") {
            ops.push({ op: "patchLayer", target: tgt.id, patch: { color: col } });
          } else if (tgt.type === "chart") {
            ops.push({ op: "patchLayer", target: tgt.id, patch: { accent: col } });
          }
        }
      }
    }
  }

  // ════ TEXT edits ════
  {
    const titleL = L.find((l) => l.type === "title");
    // change the title to "X"  /  title: X  /  rename title to X
    let m = c.match(/\b(?:change|set|rename|make)\s+(?:the\s+)?title\s+(?:to|=|:)\s*["“]?(.+?)["”]?\.?\s*$/i)
      || c.match(/\btitle\s*[:=]\s*(.+?)\s*$/i);
    if (m && titleL) ops.push({ op: "patchLayer", target: titleL.id, patch: { text: m[1].trim().slice(0, 80) } });
    m = c.match(/\b(?:change|set)\s+(?:the\s+)?subtitle\s+(?:to|=|:)\s*["“]?(.+?)["”]?\.?\s*$/i);
    if (m && titleL) ops.push({ op: "patchLayer", target: titleL.id, patch: { sub: m[1].trim().slice(0, 100) } });
    // shadows / outline on text
    if (has(/\b(shadow|drop ?shadow)\b/) && has(/\btext|title|label|word|caption\b/)) {
      const t = targetLayer(c, L, "title") ?? titleL ?? L.find((l) => l.type === "label");
      if (t) ops.push({ op: "patchLayer", target: t.id, patch: { shadow: remove ? 0 : more ? 0.85 : 0.6 } });
    }
    if (has(/\b(outline|stroke)\b/) && has(/\btext|title|label|word\b/)) {
      const t = targetLayer(c, L, "title") ?? titleL ?? L.find((l) => l.type === "label");
      if (t) ops.push({ op: "patchLayer", target: t.id, patch: { outline: !remove } });
    }
    // bigger / smaller label/title
    if (has(/\bbigger|larger|smaller|tiny|huge|massive\b/) && has(/\btitle|label|text|caption\b/)) {
      const t = targetLayer(c, L) ?? titleL;
      if (t && (t.type === "label" || t.type === "marker" || t.type === "annotation" || t.type === "flag")) {
        const dir = has(/\bsmaller|tiny\b/) ? -1 : 1;
        ops.push({ op: "patchLayer", target: t.id, patch: { sizePxScale: dir > 0 ? 1.4 : 0.7 } });
      } else if (t && t.type === "title") {
        ops.push({ op: "patchLayer", target: t.id, patch: { template: "impact" } });
      }
    }
  }

  // ════ HIGHLIGHT animation / fill ════
  {
    const hi = targetLayer(c, L, "highlight");
    if (hi && hi.type === "highlight") {
      const p: Patch = {};
      // "spread"/"advance" are intentionally NOT here — they're ambiguous with
      // diffusion/movement. These words are unambiguous "territory grows".
      if (has(/\b(grow|grows|growing|expand|expands|expanding|expansion|enlarge|annex|annexes|conquer|conquers|conquered|takes over|take over)\b/)) p.animation = "grow";
      else if (has(/\b(shrink|shrinks|shrinking|recede|recedes|receding|contract|contracts|contracting|collapse|collapses|retreat|retreats|retreating|lose|loses|losing)\b/) && has(/\bhighlight|country|fill|region|territory|empire|border\b/)) p.animation = "shrink";
      else if (has(/\bpulse|pulsing|throb|breathe\b/)) p.animation = "pulse";
      else if (has(/\bborder ?first|outline first|draw the border first\b/)) p.animation = "border-first";
      else if (has(/\bsweep|wipe\b/)) p.animation = "sweep";
      else if (has(/\bfade in\b/) && !ops.some((o) => o.op === "patchLook")) p.animation = "fade";
      else if (has(/\b(static|no animation|don'?t animate|instant)\b/) && has(/\bhighlight|country|fill|region\b/)) p.animation = "static";
      if (has(/\b(faster|quick|quicker|snappy)\b/) && (p.animation === "grow" || p.animation === "shrink")) p.growSpanSec = 1.8;
      if (has(/\b(slower|gradual|slowly)\b/) && (p.animation === "grow" || p.animation === "shrink")) p.growSpanSec = 6;
      if (has(/\bhatch(ing)?\b/)) p.fillType = "hatch";
      else if (has(/\bcross ?hatch\b/)) p.fillType = "crosshatch";
      else if (has(/\bdots|dotted fill|stipple\b/)) p.fillType = "dots";
      else if (has(/\bstripes?\b/)) p.fillType = "stripes";
      else if (has(/\bsolid fill\b/)) p.fillType = "solid";
      if (has(/\b(extrude|raise|3 ?d|lift|block|pop up)\b/) && has(/\bcountry|region|highlight|area\b/)) p.extrude = remove || less ? 0 : 35;
      if (has(/\bglow\b/) && has(/\bhighlight|country|border|region\b/)) p.glowWidth = remove || less ? 0 : more ? 40 : 26;
      if (has(/\b(more|less|fully|barely)? ?(filled|opaque|transparent|see ?through|faded|solid colou?r)\b/) && has(/\bhighlight|country|fill|region|area\b/)) {
        p.fillOpacity = has(/\btransparent|see ?through|faded|less\b/) ? 0.14 : has(/\bfull|fully|opaque|solid\b/) ? 0.6 : more ? 0.5 : 0.28;
      }
      if (has(/\b(thick|thicker|bold|bolder|thin|thinner)\b/) && has(/\bborder|outline|edge\b/)) p.borderWidth = has(/\bthin/) ? 2 : more ? 6 : 5;
      if (Object.keys(p).length) ops.push({ op: "patchLayer", target: hi.id, patch: p });
    }
  }

  // ════ ASPECT RATIO (instant, no AI) ════
  // ("story"/"phone" excluded — too ambiguous; users say "tell the story…" often.)
  if (has(/\b(vertical|portrait|9 ?: ?16|tik ?tok|reels?|shorts?)\b/)) ops.push({ op: "patchComposition", patch: { aspect: "9:16" } });
  else if (has(/\b(square|1 ?: ?1|instagram post)\b/)) ops.push({ op: "patchComposition", patch: { aspect: "1:1" } });
  else if (has(/\b(widescreen|landscape|16 ?: ?9|horizontal|youtube)\b/) && has(/\baspect|ratio|format|wide|landscape|vertical|square\b/)) ops.push({ op: "patchComposition", patch: { aspect: "16:9" } });

  // ════ TITLE / LABEL position + alignment (instant) ════
  {
    const tl = L.find((x) => x.type === "title") || L.find((x) => x.type === "label");
    if (tl && has(/\btitle|heading|text|caption|label\b/)) {
      const tp: Patch = {};
      // Require a real positional phrase ("to/at/on the top") so an incidental
      // "top" (e.g. "move top-left") doesn't reposition the title.
      if (has(/\b(?:to|at|on)\s+(?:the\s+)?top\b/)) tp.position = "top";
      else if (has(/\b(?:to|at|on)\s+(?:the\s+)?(?:bottom|lower)\b/)) tp.position = "bottom";
      else if (has(/\b(center|middle|centre)\b/) && has(/\btitle|heading|text\b/) && !has(/\balign|left|right\b/)) tp.position = "center";
      if (has(/\bleft ?align|align left|to the left\b/)) tp.align = "left";
      else if (has(/\bright ?align|align right|to the right\b/)) tp.align = "right";
      else if (has(/\bcenter ?align|align cent|centre ?align\b/)) tp.align = "center";
      if (Object.keys(tp).length) ops.push({ op: "patchLayer", target: tl.id, patch: tp });
    }
  }

  // ════ ROUTE styling ════
  {
    const rt = targetLayer(c, L, "route");
    if (rt && rt.type === "route") {
      const p: Patch = {};
      if (has(/\bdraw\b/) && has(/\bslow(er)?\b/)) p.drawFraction = 0.95;
      if (has(/\bdraw\b/) && has(/\bfast(er)?\b/)) p.drawFraction = 0.45;
      if (has(/\bdotted\b/)) p.dashStyle = "dotted";
      else if (has(/\bdashed\b/)) p.dashStyle = "dashed";
      else if (has(/\bsolid line\b/)) p.dashStyle = "solid";
      if (has(/\bthick(er)?|bold(er)?\b/) && has(/\bline|route|path\b/)) p.widthDelta = 4;
      if (has(/\bthin(ner)?\b/) && has(/\bline|route|path\b/)) p.widthDelta = -3;
      if (has(/\bno dots?\b|\b(hide|remove) (the )?(endpoints?|markers?|dots?)\b|\bwithout (dots?|markers?|endpoints?)\b|\bclean (path|line|route)\b/)) p.showEndpoints = false;
      if (has(/\b(show|add) (the )?(endpoints?|dots?)\b/)) p.showEndpoints = true;
      if (has(/\bplane|flight|fly\b/) && has(/\broute|journey|path|line\b/)) { p.icon = "plane"; p.transport = "aircraft"; }
      else if (has(/\bcar|driving\b/)) { p.icon = "car"; }
      else if (has(/\bboat|ship|sail\b/)) { p.icon = "boat"; p.transport = "boat"; }
      else if (has(/\btrain\b/)) p.icon = "train";
      if (has(/\bstraight|direct line|as the crow\b/)) p.pathStyle = "direct";
      if (has(/\bglow\b/) && has(/\broute|line|path\b/)) p.glow = remove || less ? 0 : more ? 1.2 : 0.7;
      if (Object.keys(p).length) ops.push({ op: "patchLayer", target: rt.id, patch: p });
    }
  }

  return ops.length ? ops : null;
}

// ── AI fallback ──────────────────────────────────────────────────────────────

const SYS = `You are a precise MAP-ANIMATION scene editor. The user wants to ADJUST an existing scene — change ONLY what they ask and keep everything else identical. Output ONLY a minified JSON array of operations, no prose.

Ops:
{"op":"patchLayer","target":"<layer id>","patch":{...changed fields only...}}
{"op":"addLayer","layerType":"marker|flag|label|annotation|spotlight|title|highlight|route|chart|connections|image","props":{...},"at":"<place name or 'center'>"}
{"op":"removeLayer","target":"<layer id>"}
{"op":"patchLook","patch":{...}}        // vignette,letterbox,grain(0-1); texture:"none|paper|halftone|scanlines|grid|noise"; mapFilter:"none|sepia|antique|noir|cool|warm|blueprint|duotone"; mapFilterAmount,tintOpacity(0-1); tintColor,bgColor(hex)
{"op":"patchBasemap","patch":{...}}     // terrain(bool),terrainStrength(0-5),landColor,waterColor(hex or ""),showStreets,showLabels(bool),mapYear("YYYY")
{"op":"patchComposition","patch":{"durationSec":num}}
{"op":"patchTheme","patch":{"accent":hex,"fill":hex,"border":hex,"glow":hex}}

Layer fields you may patch:
- camera: style("fly-in|zoom-out|orbit|push-in|pan|hold"), moveFraction(0.1-1); end pose via patch {"endZoomDelta":num} or {"endPitch":num}
- highlight: fillColor,borderColor,glowColor(hex), fillType("solid|hatch|crosshatch|dots|stripes|flag"), animation("fade|sweep|pulse|border-first|static"), extrude(0-100), glowWidth, borderWidth, labelText
- route: color(hex), width, drawFraction(0-1), dashStyle("solid|dotted|dashed"), icon, transport, showEndpoints(bool), glow(0-1.5), pathStyle("auto|direct")
- title/label/annotation: text, sub, color, accent(hex), shadow(0-1), outline(bool)
- marker: icon, emoji, color(hex), animation("pop|drop|pulse|spin|flash|throb|none"), label
- flag: iso, sizePx
- chart: variant, value, prefix, suffix, accent

Rules: target layers by their exact id from the list. Return the FEWEST ops. If a request needs a new element, ADD it (don't recreate the scene). If nothing maps to a real edit, return [].`;

async function aiEdits(cmd: string, ctx: Ctx, cfg: any): Promise<EditOp[] | null> {
  if (!cfg) return null;
  const list = ctx.layers.map((l) => `- id:${l.id} type:${l.type}${l.place ? ` place:"${l.place}"` : ""}${l.text ? ` text:"${l.text}"` : ""}${l.color ? ` color:${l.color}` : ""}`).join("\n");
  const state = `Layers:\n${list}\n\nLook: ${JSON.stringify(ctx.look ?? {})}\nBasemap: ${JSON.stringify(ctx.basemap ?? {})}\nDuration: ${ctx.durationSec ?? 6}s`;
  const { text } = await aiComplete(SYS, `${state}\n\nEdit: """${cmd.slice(0, 400)}"""`, cfg);
  if (!text) return null;
  try {
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  let body: { command?: string; context?: Ctx; ai?: any; useAI?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const command = (body.command ?? "").trim();
  const ctx: Ctx = body.context ?? { layers: [] };
  if (!command) return NextResponse.json({ error: "Type what to change." }, { status: 400 });
  if (!Array.isArray(ctx.layers)) ctx.layers = [];

  // ENGINE CHOICE — honor it strictly (matches the generate route):
  //  · AI-directed (default)  → the MODEL interprets the edit; never the keyword
  //    parser. Fail loudly if no provider is connected.
  //  · Smart (no AI)          → the instant deterministic keyword parser only.
  const aiRequested = body.useAI !== false;
  if (aiRequested) {
    const cfg = configFromUser(body.ai) ?? resolveAIConfig();
    if (!cfg) {
      return NextResponse.json({ error: "AI-directed mode is on, but no AI provider is connected. Add your API key in Settings, or switch the engine to “Smart (no AI)”.", aiConfigured: false }, { status: 400 });
    }
    const ai = await aiEdits(command, ctx, cfg);
    if (ai && ai.length) return NextResponse.json({ ops: ai, provider: "ai" });
    return NextResponse.json({ ops: [], note: "The AI couldn't turn that into an edit — try rephrasing, or switch the engine to “Smart (no AI)” for the instant keyword editor." });
  }

  // Smart (no AI): the deterministic keyword parser, instant + key-free.
  const ops = heuristicEdits(command, ctx);
  if (!ops || !ops.length) {
    return NextResponse.json({ ops: [], note: "The instant editor didn't recognise that. Try e.g. \"make the route red\", \"add crossing swords on the border\", \"make it look like an old map\", \"zoom in more\", or \"remove the title\" — or switch the engine to AI-directed for free-form edits." });
  }
  return NextResponse.json({ ops, provider: "heuristic" });
}
