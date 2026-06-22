import type { RawTrack, RawPoint } from "../types";
import { parseTime } from "./_util";

/**
 * GeoJSON adapter. Already-geographic data: pulls every LineString /
 * MultiLineString / Point / MultiPoint out of a FeatureCollection, Feature, or
 * bare geometry. Honors `properties.coordTimes` (the @tmcw/togeojson convention)
 * and a 3rd coordinate as elevation.
 */
export function parseGeojson(text: string): RawTrack {
  let gj: any;
  try { gj = JSON.parse(text); } catch { return { name: "", points: [] }; }

  const points: RawPoint[] = [];
  let name = "";

  const pushLine = (coords: any[], times?: any[]) => {
    coords.forEach((c, i) => {
      const lon = Number(c?.[0]), lat = Number(c?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      const ele = c?.[2] != null && Number.isFinite(Number(c[2])) ? Number(c[2]) : null;
      const t = times?.[i] != null ? parseTime(String(times[i])) : null;
      points.push({ lon, lat, ele, t });
    });
  };

  const handleGeom = (g: any, props: any) => {
    if (!g) return;
    const times: any[] | undefined = Array.isArray(props?.coordTimes) ? props.coordTimes : undefined;
    switch (g.type) {
      case "LineString": pushLine(g.coordinates, times); break;
      case "MultiLineString": g.coordinates.forEach((line: any[], li: number) => pushLine(line, Array.isArray(times?.[li]) ? times![li] : undefined)); break;
      case "MultiPoint": pushLine(g.coordinates); break;
      case "Point": pushLine([g.coordinates]); break;
      case "GeometryCollection": (g.geometries || []).forEach((sub: any) => handleGeom(sub, props)); break;
    }
  };

  if (gj?.type === "FeatureCollection") {
    for (const f of gj.features || []) { name ||= f?.properties?.name || ""; handleGeom(f?.geometry, f?.properties); }
  } else if (gj?.type === "Feature") {
    name = gj?.properties?.name || ""; handleGeom(gj.geometry, gj.properties);
  } else {
    handleGeom(gj, undefined);
  }
  return { name: (gj?.name || name || "").toString().trim(), points };
}
