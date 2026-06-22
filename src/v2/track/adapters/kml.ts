import type { RawTrack, RawPoint } from "../types";
import { parseTime } from "./_util";

/**
 * KML adapter (Google Earth). Prefers a `<gx:Track>` (which interleaves `<when>`
 * timestamps with `<gx:coord>lon lat ele</gx:coord>`); otherwise falls back to a
 * `<LineString>`'s `<coordinates>` block (whitespace-separated `lon,lat,ele`).
 * NOTE: KMZ is a zipped KML — unzip to its doc.kml before calling this.
 */
export function parseKml(xml: string): RawTrack {
  const name = (xml.match(/<name>\s*([\s\S]*?)\s*<\/name>/i)?.[1] || "").trim();
  const points: RawPoint[] = [];

  // gx:Track — has per-point timestamps.
  const whens = [...xml.matchAll(/<when>\s*([^<]+?)\s*<\/when>/gi)].map((x) => x[1]);
  const coords = [...xml.matchAll(/<gx:coord>\s*([-\d.eE]+)\s+([-\d.eE]+)(?:\s+([-\d.eE]+))?\s*<\/gx:coord>/gi)];
  if (coords.length) {
    coords.forEach((c, i) => {
      points.push({
        lon: parseFloat(c[1]), lat: parseFloat(c[2]),
        ele: c[3] != null ? parseFloat(c[3]) : null,
        t: parseTime(whens[i]),
      });
    });
    return { name, points };
  }

  // LineString <coordinates> — no timestamps.
  const block = xml.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/i)?.[1] || "";
  for (const tok of block.trim().split(/\s+/)) {
    if (!tok) continue;
    const [lon, lat, ele] = tok.split(",").map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      points.push({ lon, lat, ele: Number.isFinite(ele) ? ele : null, t: null });
    }
  }
  return { name, points };
}
