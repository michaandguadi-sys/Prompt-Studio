/**
 * MY ELEMENTS — the user's personal building-block library.
 *
 * Any layer (a styled marker, an AI-drawn sticker, a perfected title card, a
 * tuned range-ring…) can be saved once and re-inserted into ANY project — the
 * platform becomes more personal with every film. Sits beside the AI add-ons
 * registry (parameterised composites); an element is a concrete layer snapshot.
 */

export interface SavedElement {
  id: string;
  name: string;
  /** The layer's `type` — drives the icon + insert behaviour. */
  layerType: string;
  /** Full layer JSON snapshot (id is re-minted on insert). */
  layer: Record<string, unknown>;
  createdAt: number;
}

const KEY = "mapanisy-elements";

export function loadElements(): SavedElement[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && e.layer && e.layerType) : [];
  } catch { return []; }
}

function persist(list: SavedElement[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 120))); } catch { /* quota */ }
}

/** Save (upsert by name) a layer snapshot as a reusable element. */
export function saveElement(name: string, layer: Record<string, unknown>): SavedElement[] {
  const el: SavedElement = {
    id: "el_" + Math.random().toString(36).slice(2, 10),
    name: name.trim().slice(0, 40) || String(layer.type ?? "Element"),
    layerType: String(layer.type ?? "label"),
    layer: JSON.parse(JSON.stringify(layer)),
    createdAt: Date.now(),
  };
  const list = loadElements().filter((x) => x.name.toLowerCase() !== el.name.toLowerCase());
  const next = [el, ...list];
  persist(next);
  return next;
}

export function removeElement(id: string): SavedElement[] {
  const next = loadElements().filter((x) => x.id !== id);
  persist(next);
  return next;
}
