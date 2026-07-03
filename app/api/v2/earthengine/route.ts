/**
 * POST /api/v2/earthengine  → { tileUrl, compareUrl?, attribution, meta }
 *
 * Earth-observation tile resolver. Returns a MapLibre-compatible WMTS tile URL
 * for a given dataset alias, date, and operation.
 *
 * PRIMARY: NASA GIBS (free, no auth, production-grade from NASA Earthdata).
 * 500+ datasets — vegetation, fire, nighttime lights, sea temperature, snow,
 * precipitation, aerosol, true-color imagery and more.
 *
 * FUTURE (disabled — add credentials to enable):
 *   Google Earth Engine + AlphaEarth Foundations
 *   (GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL — 64-dim ML embeddings, 10m, 2017-2024)
 *   → Uncomment the GEE block below and set env vars:
 *       GEE_SERVICE_ACCOUNT=your-sa@project.iam.gserviceaccount.com
 *       GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   GEE enables: change detection, semantic land-cover classification, temporal
 *   animation of embeddings, and true per-pixel ML-derived earth data.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rateLimit";

// ── GIBS dataset catalogue ──────────────────────────────────────────────────
type GibsMeta = { id: string; fmt: "jpg" | "png"; matrix: string; maxzoom: number; label: string; attribution: string; static?: boolean };

const GIBS: Record<string, GibsMeta> = {
  "true-color":      { id: "MODIS_Terra_CorrectedReflectance_TrueColor",              fmt: "jpg", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "True Color (MODIS Terra)",       attribution: "NASA Terra MODIS / Earthdata GIBS" },
  "true-color-aqua": { id: "MODIS_Aqua_CorrectedReflectance_TrueColor",               fmt: "jpg", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "True Color (MODIS Aqua)",        attribution: "NASA Aqua MODIS / Earthdata GIBS" },
  "landsat":         { id: "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", fmt: "jpg", matrix: "GoogleMapsCompatible_Level12", maxzoom: 12, label: "True Color — Landsat (Annual)",  attribution: "NASA Landsat / Earthdata GIBS" },
  "ndvi":            { id: "MODIS_Terra_NDVI_8Day",                                    fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Vegetation Index — NDVI",        attribution: "NASA Terra MODIS NDVI / Earthdata GIBS" },
  "evi":             { id: "MODIS_Terra_EVI_8Day",                                     fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Enhanced Vegetation Index",      attribution: "NASA Terra MODIS EVI / Earthdata GIBS" },
  "fire":            { id: "MODIS_Terra_Thermal_Anomalies_All",                        fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Active Fire / Thermal Hotspots", attribution: "NASA Terra MODIS Thermal / Earthdata GIBS" },
  "fire-aqua":       { id: "MODIS_Aqua_Thermal_Anomalies_All",                         fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Active Fire (MODIS Aqua)",       attribution: "NASA Aqua MODIS Thermal / Earthdata GIBS" },
  "nightlights":     { id: "VIIRS_SNPP_DayNightBand_ENCC",                             fmt: "png", matrix: "GoogleMapsCompatible_Level8",  maxzoom: 8,  label: "Nighttime City Lights — VIIRS",  attribution: "NASA VIIRS SNPP Day-Night Band / Earthdata GIBS" },
  "sea-temp":        { id: "MODIS_Aqua_Sea_Surface_Temp_Night",                        fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Sea Surface Temperature",        attribution: "NASA Aqua MODIS SST / Earthdata GIBS" },
  "chlorophyll":     { id: "MODIS_Aqua_Chlorophyll_A",                                 fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Ocean Chlorophyll-A",            attribution: "NASA Aqua MODIS Chlorophyll / Earthdata GIBS" },
  "snow":            { id: "MODIS_Terra_Snow_Cover_Daily_L3_Global_500m",              fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Snow & Ice Cover",               attribution: "NASA Terra MODIS Snow / Earthdata GIBS" },
  "sea-ice":         { id: "NSIDC_VIIRS_NOAA20_Sea_Ice_Concentration",                 fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Sea Ice Concentration",          attribution: "NSIDC VIIRS / Earthdata GIBS" },
  "aerosol":         { id: "MODIS_Terra_Aerosol_Optical_Depth",                        fmt: "png", matrix: "GoogleMapsCompatible_Level9",  maxzoom: 9,  label: "Aerosol & Smoke Opacity",        attribution: "NASA Terra MODIS Aerosol / Earthdata GIBS" },
  "rain":            { id: "GPM_L3_Half_Hourly_06",                                    fmt: "png", matrix: "GoogleMapsCompatible_Level5",  maxzoom: 5,  label: "Precipitation — GPM",           attribution: "NASA GPM / Earthdata GIBS" },
  "blue-marble":     { id: "BlueMarble_NextGeneration",                                 fmt: "jpg", matrix: "GoogleMapsCompatible_Level8",  maxzoom: 8,  label: "Blue Marble",                   attribution: "NASA Blue Marble / Earthdata GIBS", static: true },
};

/** Best fallback for each semantic operation. */
const OP_FALLBACK: Record<string, string> = {
  change: "ndvi", truecolor: "true-color", urban: "nightlights",
  embedding: "ndvi", vegetation: "ndvi", fire: "fire",
};

function resolveDate(date?: string | number, isStatic = false): string {
  if (isStatic) return "";
  if (!date || date === "latest") {
    const d = new Date(); d.setDate(d.getDate() - 2); // GIBS typically lags ~1-2 days
    return d.toISOString().slice(0, 10);
  }
  if (typeof date === "number") return `${date}-06-15`; // year → mid-year composite
  return String(date).slice(0, 10);
}

function buildTileUrl(meta: GibsMeta, date: string): string {
  const datePart = (meta.static || !date) ? "/default" : `/${date}`;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${meta.id}/default${datePart}/${meta.matrix}/{z}/{y}/{x}.${meta.fmt}`;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("earthengine", clerkId, { maxRequests: 30, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { op?: string; dataset?: string; year_a?: number | string; year_b?: number | string; date?: string; compareDataset?: string; compareDate?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const op = body.op ?? "truecolor";
  const dsKey = body.dataset ?? OP_FALLBACK[op] ?? "true-color";
  const meta = GIBS[dsKey] ?? GIBS["true-color"];
  const date = resolveDate(body.date ?? body.year_b, meta.static);
  const tileUrl = buildTileUrl(meta, date);

  // Optional compare (before/after):
  let compareUrl: string | undefined;
  let compareMeta: GibsMeta | undefined;
  const cmpKey = body.compareDataset ?? (op === "change" ? dsKey : undefined);
  if (cmpKey) {
    compareMeta = GIBS[cmpKey] ?? meta;
    const cDate = resolveDate(body.compareDate ?? body.year_a, compareMeta.static);
    compareUrl = buildTileUrl(compareMeta, cDate);
  }

  /* ── GOOGLE EARTH ENGINE (disabled — too expensive for current usage) ─────
   *
   * When you're ready to enable GEE change-detection / embedding visualisation,
   * set GEE_SERVICE_ACCOUNT + GEE_PRIVATE_KEY in .env.local and uncomment this:
   *
   * const GEE_SA   = process.env.GEE_SERVICE_ACCOUNT ?? "";
   * const GEE_KEY  = (process.env.GEE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
   * if (GEE_SA && GEE_KEY) {
   *   try {
   *     const jwt   = await signGeeJwt(GEE_SA, GEE_KEY);
   *     const token = await getAccessToken(jwt);
   *     // Build an Earth Engine expression:
   *     //   - op === "change"   → dot-product of AlphaEarth embeddings (year_a vs year_b)
   *     //   - op === "ndvi"     → Landsat NDVI composite for year_b
   *     //   - op === "truecolor"→ Landsat true-color composite
   *     const expression = buildGeeExpression(op, body.year_a, body.year_b);
   *     const res = await fetch(
   *       "https://earthengine.googleapis.com/v1/projects/earthengine-public/maps",
   *       { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
   *         body: JSON.stringify({ expression }) },
   *     );
   *     if (res.ok) {
   *       const { name } = await res.json();
   *       const mapId = name?.split("/").pop();
   *       if (mapId) {
   *         const geeTileUrl = `https://earthengine.googleapis.com/v1/projects/earthengine-public/maps/${mapId}/tiles/{z}/{x}/{y}`;
   *         return NextResponse.json({ tileUrl: geeTileUrl, attribution: "Google Earth Engine / AlphaEarth Foundations", source: "gee" });
   *       }
   *     }
   *   } catch (e) { console.error("[earthengine] GEE tile generation failed:", e); }
   * }
   *
   * GEE dataset: ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL")
   * 64-dimensional AlphaEarth Foundations embeddings, 10m pixel, 2017–2024.
   * CC-BY 4.0. Bands A00–A63. Unit-sphere distributed (dot-product = similarity).
   * Change detection: subtract(year_a, year_b).select("A03") → vegetation proxy.
   *
   * ── END GEE BLOCK ────────────────────────────────────────────────────────── */

  return NextResponse.json({
    tileUrl,
    compareUrl,
    attribution: meta.attribution,
    source: "gibs",
    dataset: dsKey,
    label: meta.label,
    maxzoom: meta.maxzoom,
    tileFormat: meta.fmt,
    date,
    op,
  });
}
