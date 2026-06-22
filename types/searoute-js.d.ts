declare module "searoute-js" {
  type LonLat = [number, number];
  interface PointFeature {
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry: { type: "Point"; coordinates: LonLat };
  }
  interface LineStringFeature {
    type: "Feature";
    properties: { units?: string; length?: number } & Record<string, unknown>;
    geometry: { type: "LineString"; coordinates: LonLat[] };
  }
  /** Shortest sea route between two points (snaps land points to nearest sea). */
  function searoute(origin: PointFeature, destination: PointFeature, units?: string): LineStringFeature;
  export = searoute;
}
