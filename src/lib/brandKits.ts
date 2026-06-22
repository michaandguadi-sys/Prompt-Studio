import type { Theme, Look } from "@/v2/doc/schema";

/**
 * A Brand Kit — a creator's reusable visual identity: palette + fonts (Theme),
 * the cinematic grade (a slice of Look), and an optional logo (data-URL). Stored
 * in localStorage like saved palettes/folders; applied across the editor in one
 * tap so every animation a creator makes is on-brand.
 */
export interface BrandKit {
  id: string;
  name: string;
  theme: Theme;
  look?: Partial<Look>;
  /** Logo image as a data-URL (rendered as a screen-anchored watermark layer). */
  logo?: string;
}

const KEY = "mapanisy-brand-kits";

export function loadBrandKits(): BrandKit[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function saveBrandKits(kits: BrandKit[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(kits)); } catch { /* quota — ignore */ }
}
