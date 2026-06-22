/**
 * AI-defined ADD-ONS — the extensibility superpower.
 *
 * A strong AI shouldn't be limited to our fixed primitives: it can INVENT a new
 * reusable feature (a named, parameterised composition of layers + look + camera)
 * the FIRST time a story needs it, and we SAVE it permanently so it becomes a
 * one-click building block forever after — e.g. "Siege" = a red city highlight +
 * encircling arrows + a pulsing marker + a day-counter, parameterised by {{city}}.
 *
 * An add-on is DECLARATIVE (a plan-fragment with {{token}} placeholders), never
 * code — so it's safe to persist, share, and expand. Expanding an add-on
 * substitutes the user's param values, yielding a normal plan fragment that the
 * generate pipeline geocodes + builds exactly like any AI plan.
 */

export type AddonParamType = "place" | "text" | "color" | "number";
export interface AddonParam {
  key: string;            // token name, used as {{key}} in the templates
  label: string;          // human label in the apply form
  type: AddonParamType;
  default?: string;
}
export interface Addon {
  id: string;
  name: string;           // "Siege"
  description: string;    // one line — what it shows
  icon?: string;          // optional lucide icon name
  params: AddonParam[];
  /** PlanLayer templates (the AI's plan-layer vocabulary) with {{token}} holes. */
  layers: Record<string, unknown>[];
  look?: Record<string, unknown>;
  motion?: string;
  createdBy: "ai" | "user";
  createdAt: number;
}

const KEY = "mapanisy-addons";

export function loadAddons(): Addon[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveAddons(list: Addon[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota — ignore */ }
}
/** Upsert by name (so re-saving the same feature updates rather than duplicates). */
export function addAddon(a: Addon): Addon[] {
  const list = loadAddons().filter((x) => x.name.toLowerCase() !== a.name.toLowerCase());
  const next = [a, ...list].slice(0, 100);
  saveAddons(next);
  return next;
}
export function removeAddon(id: string): Addon[] {
  const next = loadAddons().filter((x) => x.id !== id);
  saveAddons(next);
  return next;
}

/** Validate + normalise an AI-emitted add-on into a safe Addon (or null). */
export function normalizeAddon(raw: unknown): Addon | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, 40);
  const layers = Array.isArray(o.layers) ? (o.layers as Record<string, unknown>[]).slice(0, 8) : [];
  if (!name || !layers.length) return null;
  const params: AddonParam[] = Array.isArray(o.params)
    ? (o.params as Record<string, unknown>[]).slice(0, 6).map((p) => ({
        key: String(p.key ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "place",
        label: String(p.label ?? p.key ?? "Value").slice(0, 40),
        type: (["place", "text", "color", "number"].includes(String(p.type)) ? p.type : "text") as AddonParamType,
        default: p.default != null ? String(p.default).slice(0, 80) : undefined,
      }))
    : [];
  return {
    id: "addon_" + Math.random().toString(36).slice(2, 10),
    name,
    description: String(o.description ?? "").slice(0, 120),
    icon: o.icon ? String(o.icon).slice(0, 24) : undefined,
    params: params.length ? params : [{ key: "place", label: "Place", type: "place" }],
    layers,
    look: o.look && typeof o.look === "object" ? (o.look as Record<string, unknown>) : undefined,
    motion: o.motion ? String(o.motion) : undefined,
    createdBy: "ai",
    createdAt: Date.now(),
  };
}

/** Substitute {{token}} placeholders throughout a value tree with param values. */
function substitute<T>(value: T, values: Record<string, string>): T {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? "") as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, values)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v, values)])) as unknown as T;
  }
  return value;
}

export interface ExpandedAddon { focus: string; layers: Record<string, unknown>[]; look?: Record<string, unknown>; motion?: string }

/** Expand a saved add-on with concrete param values → a normal plan fragment. */
export function expandAddon(addon: Addon, values: Record<string, string>): ExpandedAddon {
  // Fill missing params with their declared defaults.
  const filled: Record<string, string> = {};
  for (const p of addon.params) filled[p.key] = (values[p.key] ?? p.default ?? "").toString();
  const layers = addon.layers.map((l) => substitute(l, filled));
  // The first "place" param (or the first layer's place) frames the camera.
  const placeKey = addon.params.find((p) => p.type === "place")?.key;
  const focus = (placeKey && filled[placeKey]) || String((layers.find((l) => typeof l.place === "string") as any)?.place ?? "");
  return { focus, layers, look: addon.look, motion: addon.motion };
}
