import { NextRequest, NextResponse } from "next/server";

/**
 * Search any place (country, region, district, city, town, neighborhood,
 * ocean, sea, river) and return its GeoJSON polygon.
 *
 * Backed by Nominatim (OpenStreetMap) — free, no token, returns proper
 * polygon geometry for any administrative or natural feature. Per Nominatim
 * policy we set a descriptive User-Agent.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const PLACE_TYPE_GROUP: Record<string, string> = {
  country: "country",
  state: "region",
  region: "region",
  province: "region",
  county: "district",
  district: "district",
  city: "city",
  town: "city",
  village: "city",
  suburb: "neighborhood",
  neighbourhood: "neighborhood",
  hamlet: "neighborhood",
  sea: "ocean",
  ocean: "ocean",
  bay: "ocean",
  strait: "ocean",
  river: "river",
  lake: "river",
};

function classify(item: any): string {
  const type = item.type as string | undefined;
  const cls = item.class as string | undefined;
  if (type && PLACE_TYPE_GROUP[type]) return PLACE_TYPE_GROUP[type];
  if (cls === "boundary") return "region";
  if (cls === "natural") return "ocean";
  if (cls === "waterway") return "river";
  return "custom";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const url = `${NOMINATIM}?format=jsonv2&polygon_geojson=1&addressdetails=1&limit=8&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Guada-Micha-PromptStudio/1.0 (michaandguadi@gmail.com)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json(
        { error: `Nominatim ${res.status}: ${t}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as any[];

    const results = data
      .filter((it) => it.geojson) // only items with polygon geometry
      .map((it) => ({
        id: String(it.place_id),
        name: it.display_name as string,
        shortName: it.name as string | undefined,
        placeType: classify(it),
        // Nominatim returns [minLat, maxLat, minLon, maxLon]
        bbox: it.boundingbox
          ? {
              minLat: parseFloat(it.boundingbox[0]),
              maxLat: parseFloat(it.boundingbox[1]),
              minLon: parseFloat(it.boundingbox[2]),
              maxLon: parseFloat(it.boundingbox[3]),
            }
          : null,
        center: {
          lat: parseFloat(it.lat),
          lon: parseFloat(it.lon),
        },
        // ISO 3166-1 alpha-2 (uppercased) — used to source a flag for the
        // highlight. Present for countries and anything inside one.
        countryISO: it.address?.country_code
          ? String(it.address.country_code).toUpperCase()
          : null,
        geojson: it.geojson, // raw geometry: Polygon / MultiPolygon / LineString / …
      }));

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
