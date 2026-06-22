/**
 * Apply the minimal edit-ops returned by /api/v2/edit to the editor store.
 *
 * This is the CLIENT half of the consistency-preserving edit: the server says
 * *what* changed (the fewest ops), and we apply each through the normal undoable
 * store mutations so everything the user didn't touch stays exactly as it was.
 * Deltas/scales are resolved against the live values here (the server doesn't
 * know absolute numbers), and new elements are anchored to a sensible spot.
 */
import { useEditor } from "../store/editor";
import type { Composition, LayerType } from "../doc/schema";

export type EditOp =
  | { op: "patchLayer"; target: string; patch: Record<string, any> }
  | { op: "addLayer"; layerType: string; props?: Record<string, any>; at?: string }
  | { op: "removeLayer"; target: string }
  | { op: "patchLook"; patch: Record<string, any> }
  | { op: "patchBasemap"; patch: Record<string, any> }
  | { op: "patchComposition"; patch: Record<string, any> }
  | { op: "patchTheme"; patch: Record<string, any> };

export type EditLayerSummary = { id: string; type: string; name?: string; place?: string; text?: string; color?: string };
export type EditContext = {
  layers: EditLayerSummary[];
  look: Record<string, unknown>;
  basemap: Record<string, unknown>;
  camera: { endZoom?: number; endPitch?: number; style?: string; moveFraction?: number };
  durationSec: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Primary colour field for a layer type (for the AI's targeting context). */
function primaryColor(l: any): string | undefined {
  return l.fillColor ?? l.color ?? l.accent ?? undefined;
}
/** A short identifying string for a layer (place/text), for targeting. */
function layerPlace(l: any): string | undefined {
  return l.place || l.labelText || l.from?.name || l.to?.name || undefined;
}
function layerText(l: any): string | undefined {
  return l.text || l.label || undefined;
}

/** Build the compact scene context the edit endpoint reasons over. */
export function buildEditContext(comp: Composition): EditContext {
  const cam: any = comp.layers.find((l) => l.type === "camera");
  return {
    layers: comp.layers.map((l: any) => ({
      id: l.id,
      type: l.type,
      name: l.name || undefined,
      place: layerPlace(l),
      text: layerText(l),
      color: primaryColor(l),
    })),
    look: comp.look as any,
    basemap: comp.basemap as any,
    camera: cam ? { endZoom: cam.end?.zoom, endPitch: cam.end?.pitch, style: cam.style, moveFraction: cam.moveFraction } : {},
    durationSec: comp.durationSec,
  };
}

/** Resolve an op `target` (layer id, type word, or place/text) to a live layer. */
function resolveTarget(target: string, comp: Composition): any | null {
  const layers = comp.layers as any[];
  const byId = layers.find((l) => l.id === target);
  if (byId) return byId;
  const t = (target || "").toLowerCase();
  const byType = layers.find((l) => l.type === t);
  if (byType) return byType;
  return layers.find((l) => {
    const p = (layerPlace(l) || "").toLowerCase();
    const x = (layerText(l) || "").toLowerCase();
    const n = (l.name || "").toLowerCase();
    return (p && t.includes(p)) || (x && t.includes(x)) || (n.length > 2 && t.includes(n));
  }) ?? null;
}

/** Rough centroid of a highlight's geojson, else a layer's own anchor. */
function centroidOf(l: any): { lon: number; lat: number } | null {
  if (l.anchor && typeof l.anchor.lon === "number") return { lon: l.anchor.lon, lat: l.anchor.lat };
  if (l.type === "highlight" && l.geojson) {
    const acc: number[][] = [];
    const walk = (x: any) => {
      if (Array.isArray(x)) {
        if (typeof x[0] === "number" && typeof x[1] === "number") acc.push(x as number[]);
        else x.forEach(walk);
      }
    };
    walk(l.geojson.geometry?.coordinates ?? l.geojson.coordinates ?? l.geojson);
    if (acc.length) {
      const s = acc.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
      return { lon: s[0] / acc.length, lat: s[1] / acc.length };
    }
  }
  if (l.type === "route" && l.to) return { lon: l.to.lon, lat: l.to.lat };
  return null;
}

/** Where to drop a newly-added element given an `at` hint. */
function coordFor(at: string | undefined, comp: Composition): { lon: number; lat: number } {
  const cam: any = comp.layers.find((l) => l.type === "camera");
  const center = cam?.end ? { lon: cam.end.lon, lat: cam.end.lat } : { lon: 0, lat: 0 };
  if (!at || /^(center|centre|middle|screen|here|there|the map)$/i.test(at.trim())) return center;
  const t = at.toLowerCase();
  for (const l of comp.layers as any[]) {
    const p = (layerPlace(l) || "").toLowerCase();
    const n = (l.name || "").toLowerCase();
    if ((p && (t.includes(p) || p.includes(t))) || (n.length > 2 && t.includes(n))) {
      const c = centroidOf(l);
      if (c) return c;
    }
  }
  return center;
}

/** Resolve delta/scale shorthands in a layer patch against the live layer. */
function resolveLayerPatch(layer: any, patch: Record<string, any>): Record<string, any> {
  const p: Record<string, any> = { ...patch };
  const end = { ...(layer.end ?? {}) };
  let touchedEnd = false;
  if (typeof p.endZoomDelta === "number") { end.zoom = clamp((layer.end?.zoom ?? 4) + p.endZoomDelta, 0, 22); touchedEnd = true; delete p.endZoomDelta; }
  if (typeof p.endPitchDelta === "number") { end.pitch = clamp((layer.end?.pitch ?? 0) + p.endPitchDelta, 0, 85); touchedEnd = true; delete p.endPitchDelta; }
  if (typeof p.endPitch === "number") { end.pitch = clamp(p.endPitch, 0, 85); touchedEnd = true; delete p.endPitch; }
  if (typeof p.endZoom === "number") { end.zoom = clamp(p.endZoom, 0, 22); touchedEnd = true; delete p.endZoom; }
  if (touchedEnd) p.end = end;
  if (typeof p.widthDelta === "number") { p.width = clamp((layer.width ?? 8) + p.widthDelta, 1, 60); delete p.widthDelta; }
  if (typeof p.sizePxScale === "number") { p.sizePx = clamp(Math.round((layer.sizePx ?? 100) * p.sizePxScale), 8, 600); delete p.sizePxScale; }
  return p;
}

/** Human label for the result chip (so the user sees WHAT changed). */
function labelFor(op: EditOp, comp: Composition): string | null {
  switch (op.op) {
    case "patchLook": return Object.keys(op.patch).map((k) => ({ mapFilter: "map grade", textureOpacity: "texture", grain: "film grain", vignette: "vignette", letterbox: "letterbox", tintOpacity: "colour grade" } as any)[k] ?? k).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    case "patchBasemap": return Object.keys(op.patch).map((k) => ({ terrainStrength: "terrain", waterColor: "water colour", landColor: "land colour", showStreets: "streets", showLabels: "map labels", mapYear: "map year" } as any)[k] ?? k).join(", ");
    case "patchTheme": return "whole palette";
    case "patchComposition": return op.patch.durationSec != null || op.patch.durationSecDelta != null ? "duration" : "scene";
    case "removeLayer": { const l = resolveTarget(op.target, comp); return l ? `removed ${l.type}` : "removed layer"; }
    case "addLayer": return `added ${op.props?.icon || op.layerType}`;
    case "patchLayer": { const l = resolveTarget(op.target, comp); const keys = Object.keys(op.patch); const t = l?.type ?? "layer"; if (keys.some((k) => /color|colour/i.test(k))) return `${t} colour`; if (keys.includes("animation")) return `${t} animation`; if (keys.includes("text") || keys.includes("sub")) return `${t} text`; if (keys.includes("style") || keys.includes("end")) return `camera`; return t; }
    default: return null;
  }
}

/**
 * Apply a list of edit-ops. Returns how many applied + short labels of each, for
 * the confirmation chip. Reads fresh state per op so deltas compound correctly.
 */
export function applyEditOps(ops: EditOp[]): { applied: number; labels: string[] } {
  const st = useEditor.getState();
  const labels: string[] = [];
  let applied = 0;

  for (const op of ops) {
    try {
      const comp = useEditor.getState().project.composition;
      const label = labelFor(op, comp);
      switch (op.op) {
        case "patchLayer": {
          const l = resolveTarget(op.target, comp);
          if (!l) break;
          st.patchLayer(l.id, resolveLayerPatch(l, op.patch));
          applied++; break;
        }
        case "removeLayer": {
          const l = resolveTarget(op.target, comp);
          if (!l || l.type === "camera") break; // never delete the camera
          st.removeLayer(l.id);
          applied++; break;
        }
        case "addLayer": {
          // Geometry-heavy layers (highlight/route) need geocoding the editor
          // bar can't do — those go through full generation, not a patch.
          if (op.layerType === "highlight" || op.layerType === "route") break;
          const props: Record<string, any> = { ...(op.props ?? {}) };
          const { lon, lat } = coordFor(op.at, comp);
          if (["marker", "flag", "spotlight"].includes(op.layerType)) props.anchor = { lon, lat };
          else if (["label", "image"].includes(op.layerType)) props.anchor = { kind: "coord", lon, lat };
          else if (op.layerType === "annotation") props.anchor = { lon, lat };
          st.addLayer(op.layerType as LayerType, props);
          applied++; break;
        }
        case "patchLook": {
          st.patchComposition({ look: { ...(comp.look as any), ...op.patch } } as any);
          applied++; break;
        }
        case "patchBasemap": {
          const patch = { ...op.patch };
          if (patch.waterColor == null && "waterColor" in patch) patch.waterColor = "";
          if (patch.landColor == null && "landColor" in patch) patch.landColor = "";
          st.patchComposition({ basemap: { ...(comp.basemap as any), ...patch } } as any);
          applied++; break;
        }
        case "patchComposition": {
          const patch = { ...op.patch };
          if (typeof patch.durationSecDelta === "number") { patch.durationSec = clamp(comp.durationSec + patch.durationSecDelta, 1, 60); delete patch.durationSecDelta; }
          st.patchComposition(patch as any);
          applied++; break;
        }
        case "patchTheme": {
          st.setTheme(op.patch as any, true);
          applied++; break;
        }
      }
      if (label && applied) labels.push(label);
    } catch { /* skip a bad op, keep going */ }
  }
  return { applied, labels: labels.filter((v, i, a) => a.indexOf(v) === i) };
}
