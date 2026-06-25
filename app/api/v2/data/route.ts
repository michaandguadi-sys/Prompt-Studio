/**
 * The DATA SKILL — one robust ingestion path for data-driven map layers
 * (choropleth · bubble · flow · heatmap). Takes EITHER a description ("GDP per
 * capita of EU countries") OR raw pasted rows, and always returns strict,
 * sanitized JSON the layer can use. This is the "always works with least
 * effort" endpoint the editor's Data panel calls.
 *
 *   POST { kind, prompt?, raw?, max?, ai? }
 *     kind  "choropleth" | "bubble" | "flow"
 *     →     { metric, unit, rows: [...] }   (shape depends on kind)
 *
 * Pro-gated server-side (defense in depth; the UI gates too).
 */
import { NextRequest, NextResponse } from "next/server";
import { aiComplete, resolveAIConfig, configFromUser } from "@/lib/ai/providers";
import { resolveUserId } from "@/lib/auth/resolveUserId";
import { checkQuota } from "@/lib/quota";

export const runtime = "nodejs";

// Pro · Studio · Enterprise (internal tier ids). Free + Creator can't use data layers.
const PRO_TIERS = new Set(["teams", "custom", "agency"]);

type Kind = "choropleth" | "bubble" | "flow";

export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const kind: Kind = body?.kind === "bubble" ? "bubble" : body?.kind === "flow" ? "flow" : "choropleth";
  const prompt = String(body?.prompt ?? "").slice(0, 600).trim();
  const raw = String(body?.raw ?? "").slice(0, 8000).trim();
  const max = Math.min(150, Math.max(3, Number(body?.max) || 40));
  if (!prompt && !raw) return NextResponse.json({ error: "Describe the data, or paste some rows." }, { status: 400 });

  // Pro-gate (skip the gate when there's no DB — local dev — so it's testable).
  try {
    const q = await checkQuota(userId);
    if (q && !PRO_TIERS.has(q.tier)) {
      return NextResponse.json({ error: "Data layers are a Pro feature — upgrade to unlock real-data maps.", upgrade: true }, { status: 402 });
    }
  } catch { /* quota unavailable → allow (dev) */ }

  const cfg = configFromUser(body?.ai) ?? resolveAIConfig();
  if (!cfg) return NextResponse.json({ error: "No AI provider configured — add a key in Settings to use data layers." }, { status: 400 });

  const shape =
    kind === "bubble"
      ? `{"metric": string, "unit": string, "rows": [{"place": string, "lon": number, "lat": number, "value": number, "label": string}]}`
      : kind === "flow"
        ? `{"metric": string, "unit": string, "rows": [{"from": string, "fromLon": number, "fromLat": number, "to": string, "toLon": number, "toLat": number, "value": number}]}`
        : `{"metric": string, "unit": string, "rows": [{"place": string, "iso": string, "value": number, "label": string}]}`;

  const geoRule =
    kind === "bubble" ? "give lon/lat for each place (lon ∈ [-180,180], lat ∈ [-90,90])"
      : kind === "flow" ? "give fromLon/fromLat and toLon/toLat for each pair"
        : "give the ISO-3166-1 alpha-2 country code (UPPERCASE) for each place";

  const task = raw
    ? `Clean and normalize this raw data into the schema. Infer the geography (${geoRule}) and a sensible metric + unit.\n\nRAW DATA:\n${raw}`
    : `Produce accurate, real-world data for: "${prompt}". Use your knowledge; ${geoRule}. Up to ${max} rows.`;

  const system =
    `You are a precise geographic-data assistant. Output ONLY one JSON object — no prose, no markdown — matching exactly:\n${shape}\n` +
    `Rules: "value" is a plain number (no units inside the number); "unit" is a short suffix like "%", " M", "°C", " (USD bn)"; ` +
    `"metric" is a concise legend label; at most ${max} rows; omit any row you are not confident about.`;

  const { text, error } = await aiComplete(system, task, cfg);
  if (!text) return NextResponse.json({ error: error ?? "The AI returned nothing — try again." }, { status: 502 });

  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return NextResponse.json({ error: "Couldn't read the AI response — try rephrasing." }, { status: 502 });
  let parsed: any;
  try { parsed = JSON.parse(text.slice(s, e + 1)); } catch { return NextResponse.json({ error: "Couldn't read the AI response — try rephrasing." }, { status: 502 }); }

  const inRows: any[] = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const num = (v: any) => Number(typeof v === "string" ? v.replace(/[, ]/g, "") : v);
  let rows: any[];
  if (kind === "bubble") {
    rows = inRows
      .map((r) => ({ place: String(r.place ?? "").slice(0, 60), value: num(r.value), lon: num(r.lon), lat: num(r.lat), label: String(r.label ?? "").slice(0, 40) }))
      .filter((r) => r.place && Number.isFinite(r.value) && Number.isFinite(r.lon) && Number.isFinite(r.lat) && Math.abs(r.lon) <= 180 && Math.abs(r.lat) <= 90);
  } else if (kind === "flow") {
    rows = inRows
      .map((r) => ({ from: String(r.from ?? "").slice(0, 60), fromLon: num(r.fromLon), fromLat: num(r.fromLat), to: String(r.to ?? "").slice(0, 60), toLon: num(r.toLon), toLat: num(r.toLat), value: num(r.value) }))
      .filter((r) => r.from && r.to && Number.isFinite(r.value) && Number.isFinite(r.fromLon) && Number.isFinite(r.fromLat) && Number.isFinite(r.toLon) && Number.isFinite(r.toLat));
  } else {
    rows = inRows
      .map((r) => ({ place: String(r.place ?? "").slice(0, 60), value: num(r.value), iso: String(r.iso ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2), label: String(r.label ?? "").slice(0, 40) }))
      .filter((r) => r.place && Number.isFinite(r.value) && r.iso.length === 2);
  }

  if (!rows.length) return NextResponse.json({ error: "No usable rows came back — try rephrasing or adjust your data." }, { status: 422 });

  return NextResponse.json({
    metric: String(parsed?.metric ?? "").slice(0, 60),
    unit: String(parsed?.unit ?? "").slice(0, 12),
    rows: rows.slice(0, max),
    provider: cfg.provider,
  });
}
