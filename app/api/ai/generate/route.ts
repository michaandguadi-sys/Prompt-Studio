/**
 * POST /api/ai/generate
 * Body: { idea: string }
 *
 * Turns a rough text idea into a real, fully-customizable MAP animation scene
 * the user can immediately tweak. Pipeline:
 *   1. (optional) Claude extracts structured intent {place, title, subtitle,
 *      mood, durationSec} when ANTHROPIC_API_KEY is set.
 *   2. Heuristic fallback parses the idea when no key is present.
 *   3. Mapbox geocoding resolves the place → camera target.
 *   4. (optional) Nominatim resolves a country/region polygon for a highlight.
 *   5. We assemble a valid SceneSpec (kind:"map") and return it.
 *
 * Designed to degrade gracefully: any step can fail and we still return a
 * sensible, renderable scene centered on the best guess.
 */
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MAP_SCENE } from "@/lib/defaults";
import { defaultHighlightStyle } from "@/lib/highlightStyle";
import { HIGHLIGHT_PRESETS } from "@/lib/presets/highlightPresets";
import type { SceneSpec, MapSceneSpec, HighlightSpec } from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Intent = {
  place: string;
  title: string;
  subtitle: string;
  mood: string;       // conflict | historical | trade | empire | neutral
  durationSec: number;
};

const MOOD_TO_PRESET: Record<string, string> = {
  conflict: "conflict",
  war: "conflict",
  historical: "historical",
  history: "historical",
  empire: "empire",
  trade: "trade",
  economy: "trade",
  neutral: "neutral",
};

/** Cheap keyword mood sniff for the no-LLM path. */
function sniffMood(text: string): string {
  const t = text.toLowerCase();
  if (/\b(war|conflict|invasion|battle|military|front|occupa)/.test(t)) return "conflict";
  if (/\b(empire|dynasty|kingdom|caliphate|colonial)/.test(t)) return "empire";
  if (/\b(history|historical|ancient|medieval|century|ago)/.test(t)) return "historical";
  if (/\b(trade|economy|export|gdp|market|route|silk)/.test(t)) return "trade";
  return "neutral";
}

/** Pull a plausible place string from a freeform idea (no-LLM fallback). */
function guessPlace(idea: string): string {
  // Prefer a "in/of/about <Place>" tail; else the longest Capitalized run.
  const m = idea.match(/\b(?:in|of|about|over|across|through)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})/);
  if (m) return m[1];
  const caps = idea.match(/[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3}/g);
  if (caps && caps.length) return caps.sort((a, b) => b.length - a.length)[0];
  return idea.split(/[.,;\n]/)[0].trim().slice(0, 60);
}

async function extractIntent(idea: string): Promise<Intent> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 300,
          messages: [{
            role: "user",
            content:
              `From this map-animation idea, return ONLY minified JSON with keys ` +
              `place (the single best geographic place to fly to), title (<=24 chars, uppercase ok), ` +
              `subtitle (<=40 chars), mood (one of conflict|historical|trade|empire|neutral), ` +
              `durationSec (4-10 integer). Idea: """${idea.slice(0, 500)}"""`,
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.content?.[0]?.text ?? "";
        const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        return {
          place: String(json.place || guessPlace(idea)),
          title: String(json.title || guessPlace(idea)).slice(0, 28).toUpperCase(),
          subtitle: String(json.subtitle || "").slice(0, 48),
          mood: MOOD_TO_PRESET[String(json.mood).toLowerCase()] ? String(json.mood).toLowerCase() : "neutral",
          durationSec: Math.min(10, Math.max(4, Math.round(Number(json.durationSec) || 6))),
        };
      }
    } catch {
      /* fall through to heuristic */
    }
  }
  const place = guessPlace(idea);
  return {
    place,
    title: place.toUpperCase().slice(0, 28),
    subtitle: idea.trim().slice(0, 48),
    mood: sniffMood(idea),
    durationSec: 6,
  };
}

/** Mapbox forward geocode → { lon, lat, zoom, placeType, name, iso }. */
async function geocode(q: string) {
  if (!MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&limit=1&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lon !== "number") return null;
    const placeType: string = f.properties?.feature_type ?? "place";
    const zoomByType: Record<string, number> = {
      country: 3.4, region: 5.5, district: 8, postcode: 10, place: 9.5,
      locality: 11, neighborhood: 12.5, street: 14, address: 15,
    };
    return {
      lon, lat,
      zoom: zoomByType[placeType] ?? 9,
      placeType,
      name: f.properties?.name ?? q,
      iso: f.properties?.context?.country?.country_code?.toUpperCase() ?? null,
    };
  } catch {
    return null;
  }
}

/** Nominatim polygon for a country/region → inline GeoJSON (for a highlight). */
async function fetchPolygon(q: string) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mapanisy/1.0 (michaandguadi@gmail.com)" } });
    if (!res.ok) return null;
    const arr = await res.json();
    return arr?.[0]?.geojson ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: { idea?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const idea = (body.idea ?? "").trim();
  if (!idea) return NextResponse.json({ error: "Describe your animation idea first." }, { status: 400 });

  const intent = await extractIntent(idea);
  const geo = await geocode(intent.place);

  // Clone the default map scene and retarget it to the resolved place.
  const base = structuredClone(DEFAULT_MAP_SCENE) as SceneSpec;
  const scene = base.scene as MapSceneSpec;
  base.name = intent.title ? `${intent.title.slice(0, 40)}` : "AI Scene";
  base.durationSec = intent.durationSec;

  if (geo) {
    const endZoom = geo.zoom;
    scene.end = { lon: geo.lon, lat: geo.lat, zoom: endZoom, pitch: 45, bearing: -12 };
    scene.mid = { lon: geo.lon, lat: geo.lat, zoom: Math.max(2.5, endZoom - 3.5) };
    scene.start = { lon: geo.lon, lat: geo.lat, zoom: Math.max(1.8, endZoom - 6) };
  }

  // Single clean title label, projected at the place.
  scene.labels = [
    {
      primary: intent.title || (geo?.name ?? "PLACE").toUpperCase(),
      secondary: intent.subtitle || "",
      primaryInFrame: Math.round(base.durationSec * base.fps * 0.18),
      primaryOutFrame: Math.round(base.durationSec * base.fps * 0.92),
      secondaryInFrame: Math.round(base.durationSec * base.fps * 0.18),
      layout: "city-projected",
      projectLon: geo?.lon ?? scene.end.lon,
      projectLat: geo?.lat ?? scene.end.lat,
      enabled: true,
    },
  ];

  // For countries/regions, try to add a highlight polygon with a mood preset.
  scene.highlights = [];
  scene.highlight = null;
  if (geo && (geo.placeType === "country" || geo.placeType === "region")) {
    const poly = await fetchPolygon(geo.name);
    if (poly) {
      const preset = HIGHLIGHT_PRESETS.find((p) => p.id === (MOOD_TO_PRESET[intent.mood] ?? "neutral"))
        ?? HIGHLIGHT_PRESETS.find((p) => p.id === "neutral")!;
      const hl: HighlightSpec = {
        name: geo.name,
        placeType: geo.placeType,
        geojson: poly,
        style: { ...defaultHighlightStyle(base.style.palette), ...preset.style },
        animationStyle: preset.animationStyle,
        ...(geo.iso ? { countryISO: geo.iso } : {}),
        enabled: true,
      };
      scene.highlights = [hl];
    }
  }

  return NextResponse.json({
    scene: base,
    resolved: geo ? { name: geo.name, placeType: geo.placeType } : null,
    usedLLM: !!process.env.ANTHROPIC_API_KEY,
    mood: intent.mood,
  });
}
