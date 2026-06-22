import type { RawTrack, RawPoint } from "../types";
import { num, parseTime } from "./_util";

/**
 * GPX adapter (most phone apps + trackers). Handles both track points
 * (`<trkpt>`) and route points (`<rtept>`), attribute order independent, with or
 * without `<ele>`/`<time>` children and self-closing tags. Regex-based on purpose:
 * GPX is well-structured and this stays dependency-free + identical in Node and
 * the browser. All format quirks are quarantined here.
 */
export function parseGpx(xml: string): RawTrack {
  const name = (xml.match(/<name>\s*([\s\S]*?)\s*<\/name>/i)?.[1] || "").trim();
  const points: RawPoint[] = [];

  const tagRe = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const attrs = m[2] || "";
    const inner = m[3] || "";
    const lat = num(attrs.match(/\blat\s*=\s*["']([-\d.eE]+)["']/)?.[1]);
    const lon = num(attrs.match(/\blon\s*=\s*["']([-\d.eE]+)["']/)?.[1]);
    if (lat == null || lon == null) continue;
    const ele = num(inner.match(/<ele>\s*([-\d.eE]+)\s*<\/ele>/i)?.[1]);
    const t = parseTime(inner.match(/<time>\s*([^<]+?)\s*<\/time>/i)?.[1]);
    points.push({ lon, lat, ele, t });
  }
  return { name, points };
}
