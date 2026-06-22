/**
 * Shared types for the track-ingest pipeline (GPX/TCX/KML/GeoJSON → normalized).
 * Adapters emit `RawTrack`; the preprocessor turns it into `NormalizedTrack`,
 * which maps 1:1 onto the `track` layer's data fields in the document schema.
 */

/** A single raw sample straight out of a format adapter (before any cleaning). */
export interface RawPoint {
  lon: number;
  lat: number;
  ele: number | null;  // metres, null if the source has no elevation
  t: number | null;    // epoch ms (UTC), null if the source has no timestamps
}

/** An adapter's only output: a name + ordered raw points. */
export interface RawTrack {
  name: string;
  points: RawPoint[];
}

/** The cleaned, resampled, simplified track the renderer/camera/inspector read. */
export interface NormalizedTrack {
  name: string;
  points: RawPoint[];     // resampled + smoothed + simplified, evenly spaced
  segments: number[];     // indices into points where the track was paused/split
  hasElevation: boolean;
  hasTime: boolean;
  stats: {
    rawCount: number;
    cleanCount: number;
    distanceM: number;
    ascentM: number;
    descentM: number;
    durationS: number | null;
    bbox: [number, number, number, number]; // [w, s, e, n]
    midpoint: [number, number];             // [lon, lat]
  };
}

export type TrackFormat = "gpx" | "tcx" | "kml" | "geojson" | "fit" | "kmz" | "unknown";
