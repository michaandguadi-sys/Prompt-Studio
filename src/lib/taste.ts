/**
 * THE TASTE ENGINE — the studio learns you.
 *
 * Every meaningful creative choice (a style applied, a font picked, an accent
 * colour set, a render preset chosen, film vs still…) is recorded as a tiny
 * event. From those events we derive a PREFERENCE PROFILE, and a compact
 * summary of it rides along with every generation request — so the AI director
 * biases style, pacing and palette toward what this user actually keeps
 * choosing. The more you make, the more it feels like YOUR studio.
 *
 * Privacy: events never leave the browser except as the short derived summary
 * inside your own generation requests. One click wipes it.
 */

export type TasteKind =
  | "style"       // map style id applied (pro or creative)
  | "signature"   // signature style chosen at generate time
  | "font"        // display font picked
  | "accent"      // accent colour set
  | "aspect"      // 16:9 / 9:16 / 1:1
  | "mode"        // film | still
  | "renderPreset" // youtube | shorts | square | draft
  | "layer"       // layer type manually added
  | "duration";   // chosen film length (seconds, bucketed)

export interface TasteEvent { k: TasteKind; v: string; t: number }

const KEY = "mapanisy-taste";
const MAX = 500;

function load(): TasteEvent[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Record one creative choice. Cheap, fire-and-forget, SSR-safe. */
export function recordTaste(k: TasteKind, v: string | number | undefined | null): void {
  if (typeof window === "undefined" || v == null || v === "") return;
  try {
    const list = load();
    list.push({ k, v: String(v).slice(0, 48), t: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* quota/private mode — taste is a bonus, never an error */ }
}

export function clearTaste(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Top values for a kind, weighted so RECENT choices count more. */
function top(list: TasteEvent[], k: TasteKind, n: number): { v: string; w: number }[] {
  const now = Date.now();
  const w = new Map<string, number>();
  for (const e of list) {
    if (e.k !== k) continue;
    const ageDays = (now - e.t) / 86_400_000;
    const weight = Math.exp(-ageDays / 30); // ~monthly half-life
    w.set(e.v, (w.get(e.v) ?? 0) + weight);
  }
  return [...w.entries()].map(([v, weight]) => ({ v, w: weight })).sort((a, b) => b.w - a.w).slice(0, n);
}

export interface TasteProfile {
  styles: string[];
  fonts: string[];
  accents: string[];
  aspect: string | null;
  mode: string | null;
  layers: string[];
  events: number;
}

export function tasteProfile(): TasteProfile {
  const list = load();
  return {
    styles: [...top(list, "style", 3), ...top(list, "signature", 2)].map((x) => x.v).slice(0, 4),
    fonts: top(list, "font", 2).map((x) => x.v),
    accents: top(list, "accent", 3).map((x) => x.v),
    aspect: top(list, "aspect", 1)[0]?.v ?? null,
    mode: top(list, "mode", 1)[0]?.v ?? null,
    layers: top(list, "layer", 4).map((x) => x.v),
    events: list.length,
  };
}

/** Compact one-line summary injected into generation requests (≤ ~350 chars).
 *  Returns "" until there's enough signal to be worth biasing on. */
export function tasteSummary(): string {
  const p = tasteProfile();
  if (p.events < 4) return "";
  const bits: string[] = [];
  if (p.styles.length) bits.push(`favourite looks: ${p.styles.join(", ")}`);
  if (p.accents.length) bits.push(`palette leans: ${p.accents.join(" ")}`);
  if (p.fonts.length) bits.push(`fonts: ${p.fonts.join(", ")}`);
  if (p.layers.length) bits.push(`often uses: ${p.layers.join(", ")}`);
  if (p.aspect) bits.push(`usually ${p.aspect}`);
  return bits.join(" · ").slice(0, 350);
}
