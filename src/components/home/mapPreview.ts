/**
 * Map-preview helpers that carry NO maplibre dependency — so pages can compute
 * the preview flavor (and hold the type) without pulling the heavy MapLibre
 * bundle into their first-load JS. The LiveStoryMap component itself is
 * dynamically imported; this module is the light, always-available half.
 */

/** How the typed story previews on the map: flowing route arcs, plain pins,
 *  glowing territory highlights, a heat scatter, or a water-hugging sea lane. */
export type PreviewFlavor = "route" | "pins" | "highlight" | "heat" | "sea";

/** A parsed "place" that still carries filler/verb tokens is a mis-parsed span
 *  (e.g. "Sailing Barcelona", "Athens At Golden Hour") — not a name we should
 *  assert. Used to keep the confident understanding UI from surfacing noise. */
export function looksNoisy(name: string): boolean {
  return /\b(at|to|the|of|in|and|from|with|sailing|flying|driving|walking|hiking|trip)\b/i.test(name);
}

/** Pick the preview flavor from the prompt text + the intent engine's action. */
export function flavorForPrompt(text: string, action?: string | null): PreviewFlavor {
  if (/heat ?map|earthquake|wildfire|outbreak|cases|crime|density|incidents|hotspots?|events\b/i.test(text)) return "heat";
  if (/\b(sail|sailing|boat|ferry|cruise|ship|voyage|by sea)\b/i.test(text)) return "sea";
  if (action === "highlight" || /highlight|every country|countries i|visited|territory|empire|region/i.test(text)) return "highlight";
  return "route";
}
