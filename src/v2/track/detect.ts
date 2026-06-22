import type { TrackFormat } from "./types";

/**
 * Detect a track format from filename + content sniff. Extension wins; content
 * sniffing is the fallback for mislabeled or extension-less uploads.
 */
export function detectFormat(filename: string, data: string | Uint8Array): TrackFormat {
  const ext = (filename.toLowerCase().split(".").pop() || "").trim();

  // Binary formats (FIT/KMZ) — by extension or magic bytes.
  if (typeof data !== "string") {
    if (ext === "fit") return "fit";
    if (ext === "kmz") return "kmz";
    if (data.length > 12 && data[8] === 0x2e && data[9] === 0x46 && data[10] === 0x49 && data[11] === 0x54) return "fit"; // ".FIT"
    if (data.length > 3 && data[0] === 0x50 && data[1] === 0x4b) return "kmz"; // PK zip → KMZ
    return "unknown";
  }

  const text = data;
  if (ext === "gpx") return "gpx";
  if (ext === "tcx") return "tcx";
  if (ext === "kml") return "kml";
  if (ext === "geojson") return "geojson";
  if (ext === "json") {
    // .json could be GeoJSON — confirm by content before claiming it.
    if (/"type"\s*:\s*"(FeatureCollection|Feature|LineString|MultiLineString|Point|MultiPoint|GeometryCollection)"/.test(text)) return "geojson";
  }

  const head = text.slice(0, 4000);
  if (/<gpx[\s>]/i.test(head)) return "gpx";
  if (/<TrainingCenterDatabase|<Trackpoint\b/i.test(head)) return "tcx";
  if (/<kml[\s>]|<gx:Track\b|<coordinates>/i.test(head)) return "kml";
  if (/^\s*[{[]/.test(head) && /"type"\s*:\s*"(FeatureCollection|Feature|LineString|MultiLineString|Point|MultiPoint|GeometryCollection)"/.test(text)) return "geojson";
  return "unknown";
}
