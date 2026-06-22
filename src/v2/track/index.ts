/**
 * Track ingest — public entry point.
 *   parseTrack(filename, data)    → detect → adapter → preprocess → NormalizedTrack
 *   parseTrackFile(file)          → reads a File (text or binary) → parseTrack
 *   buildTrackProject(track, ...) → a ready-to-edit Project with one `track` layer
 *
 * Runs entirely client-side (text formats decode in place; FIT is a binary
 * decoder; KMZ unzips in the browser) so the file never leaves the device. The
 * result is a normal Project the editor/renderer/library already understand.
 */
import { Composition, Project, SCHEMA_VERSION, type TrackStyle, type TrackVariant } from "../doc/schema";
import { createLayer, id } from "../doc/factory";
import { detectFormat } from "./detect";
import { preprocess, type PreprocessOpts } from "./preprocess";
import type { NormalizedTrack, RawTrack, TrackFormat } from "./types";
import { STYLE_PRESETS, VARIANT_PRESETS } from "./presets";
import { parseGpx } from "./adapters/gpx";
import { parseTcx } from "./adapters/tcx";
import { parseKml } from "./adapters/kml";
import { parseGeojson } from "./adapters/geojson";
import { parseFit } from "./adapters/fit";
import { parseKmz } from "./adapters/kmz";

export { detectFormat } from "./detect";
export { preprocess } from "./preprocess";
export type { NormalizedTrack, RawPoint, TrackFormat } from "./types";
export { STYLE_PRESETS, VARIANT_PRESETS } from "./presets";

export class UnsupportedTrackError extends Error {}

const asText = (d: string | Uint8Array) => (typeof d === "string" ? d : new TextDecoder().decode(d));
const asBytes = (d: string | Uint8Array) => (typeof d === "string" ? new TextEncoder().encode(d) : d);

/** Detect + parse + normalize a track (string for markup/JSON, bytes for FIT/KMZ). */
export async function parseTrack(filename: string, data: string | Uint8Array, opts?: PreprocessOpts): Promise<{ track: NormalizedTrack; format: TrackFormat }> {
  const format = detectFormat(filename, data);
  let raw: RawTrack;
  switch (format) {
    case "gpx": raw = parseGpx(asText(data)); break;
    case "tcx": raw = parseTcx(asText(data)); break;
    case "kml": raw = parseKml(asText(data)); break;
    case "geojson": raw = parseGeojson(asText(data)); break;
    case "fit": raw = parseFit(asBytes(data)); break;
    case "kmz": raw = await parseKmz(asBytes(data)); break;
    default: throw new UnsupportedTrackError(`Unsupported or unreadable track file: ${filename}`);
  }
  if (!raw.points.length) throw new UnsupportedTrackError(`No GPS points found in ${filename}.`);

  const track = preprocess(raw, opts);
  if (track.points.length < 2) throw new UnsupportedTrackError(`Track in ${filename} has too few points.`);
  if (!track.name) track.name = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Imported track";
  return { track, format };
}

/** Read a browser File (text or binary, sniffing magic bytes) and parse it. */
export async function parseTrackFile(file: File, opts?: PreprocessOpts): Promise<{ track: NormalizedTrack; format: TrackFormat }> {
  const ext = (file.name.toLowerCase().split(".").pop() || "").trim();
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b;
  const isFit = buf.length > 12 && buf[8] === 0x2e && buf[9] === 0x46 && buf[10] === 0x49 && buf[11] === 0x54;
  if (ext === "fit" || ext === "kmz" || isZip || isFit) return parseTrack(file.name, buf, opts);
  return parseTrack(file.name, new TextDecoder().decode(buf), opts);
}

/** A reasonable scene length for a flythrough, scaled gently by distance. */
function durationFor(track: NormalizedTrack): number {
  const km = track.stats.distanceM / 1000;
  return Math.min(18, Math.max(6, Math.round(6 + km * 0.3)));
}

/**
 * Build an editable Project from a normalized track. `variant`/`style` seed the
 * camera + look; everything stays editable in the inspector afterward.
 */
export function buildTrackProject(
  track: NormalizedTrack,
  sourceName: string,
  variant: TrackVariant = "overview-draw",
  style: TrackStyle = "vox-dark",
): Project {
  const sb = STYLE_PRESETS[style];
  const vp = VARIANT_PRESETS[variant];

  const layer = createLayer("track", {
    name: track.name || "Track",
    points: track.points,
    segments: track.segments,
    stats: track.stats,
    sourceName,
    hasElevation: track.hasElevation,
    hasTime: track.hasTime,
    variant,
    style,
    routeColor: sb.routeColor,
    routeGlow: sb.routeGlow,
    routeWidth: sb.routeWidth,
    trailColor: sb.trailColor,
    dotColor: sb.dotColor,
    pitch: vp.pitch,
    labels: { start: true, end: true, distance: track.stats.distanceM > 0, elevation: track.hasElevation },
  });

  const composition = Composition.parse({
    aspect: "16:9",
    durationSec: durationFor(track),
    basemap: { styleUrl: sb.baseStyleUrl, terrain: vp.terrain && track.hasElevation, labelDetail: style === "minimal" ? "none" : "cities" },
    look: { bgColor: sb.bgColor, vignette: 0.22 },
    layers: [layer],
  });

  return Project.parse({
    id: id("proj"),
    name: track.name || "Imported track",
    schemaVersion: SCHEMA_VERSION,
    composition,
    scenes: [],
    activeSceneId: "",
    shareToken: null,
  });
}
