import { NextRequest, NextResponse } from "next/server";

/**
 * Forward geocoding via OpenStreetMap **Nominatim** — free, no API key (same
 * source the highlight search already uses). Returns ranked results with name,
 * place type, lon/lat, a suggested camera zoom, bbox and country ISO, matching
 * the shape the studio dropped Mapbox geocoding into.
 *
 * Note: Nominatim asks for a descriptive User-Agent and ~1 req/s. For high
 * volume, self-host Nominatim or use a paid provider — the client shape is
 * unchanged, so only this file swaps.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mapanisy/1.0 (cinematic map studio)", "Accept-Language": "en" },
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Nominatim ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();

    const results = (Array.isArray(data) ? data : []).map((f: any) => {
      const lon = parseFloat(f.lon);
      const lat = parseFloat(f.lat);
      // Nominatim boundingbox is [south, north, west, east] (strings).
      const bb = Array.isArray(f.boundingbox) ? f.boundingbox.map(Number) : null;
      const bbox: [number, number, number, number] | undefined =
        bb && bb.length === 4 && bb.every((n: number) => isFinite(n)) ? [bb[2], bb[0], bb[3], bb[1]] : undefined; // → [minLon,minLat,maxLon,maxLat]

      // Suggested camera zoom from the feature's geographic span.
      let zoom = 9;
      if (bbox) {
        const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
        zoom = span > 30 ? 3.0 : span > 12 ? 4.2 : span > 5 ? 5.5 : span > 1.5 ? 7.5 : span > 0.4 ? 9.5 : span > 0.1 ? 11.5 : 13.5;
      }

      const iso = f.address?.country_code ? String(f.address.country_code).toUpperCase() : null;
      const placeType: string = f.addresstype || (f.class === "boundary" ? "region" : f.type) || "place";
      const shortName = f.name || String(f.display_name ?? "").split(",")[0];

      return {
        id: f.place_id,
        name: f.display_name ?? shortName ?? "Unknown",
        shortName,
        placeType,
        lon,
        lat,
        zoom,
        bbox,
        countryISO: iso,
      };
    });

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
