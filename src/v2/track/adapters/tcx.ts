import type { RawTrack, RawPoint } from "../types";
import { num, parseTime } from "./_util";

/**
 * TCX adapter (Garmin Training Center). Each `<Trackpoint>` carries a
 * `<Position>` with Latitude/LongitudeDegrees plus optional AltitudeMeters/Time.
 */
export function parseTcx(xml: string): RawTrack {
  const name = (xml.match(/<Activity\b[^>]*\bSport\s*=\s*["']([^"']+)["']/i)?.[1]
    || xml.match(/<Id>\s*([\s\S]*?)\s*<\/Id>/i)?.[1]
    || "").trim();
  const points: RawPoint[] = [];

  const tagRe = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const inner = m[1];
    const lat = num(inner.match(/<LatitudeDegrees>\s*([-\d.eE]+)/i)?.[1]);
    const lon = num(inner.match(/<LongitudeDegrees>\s*([-\d.eE]+)/i)?.[1]);
    if (lat == null || lon == null) continue; // skip indoor/no-GPS points
    const ele = num(inner.match(/<AltitudeMeters>\s*([-\d.eE]+)/i)?.[1]);
    const t = parseTime(inner.match(/<Time>\s*([^<]+?)\s*<\/Time>/i)?.[1]);
    points.push({ lon, lat, ele, t });
  }
  return { name, points };
}
