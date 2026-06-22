/**
 * AI Story Director — turns an interpreted intent into a STORYBOARD the way a
 * documentary director would: story first, animation second. It auto-SELECTS a
 * storytelling pattern, lays out scenes with proper establishing beats
 * (World → Continent → Country), assigns camera + pacing, then runs a validation
 * pass that auto-improves the board (always open with context, always end on a
 * payoff). Pure + deterministic — the generator realizes the plan it returns.
 */
import { continentOf } from "./gazetteer";
import type { Interpretation } from "./intent";

export type SceneKind = "establish" | "highlight" | "route" | "reveal" | "hero";
export interface StoryScene { n: number; purpose: string; kind: SceneKind; locations: string[]; camera: string; durationSec: number }
export interface Storyboard { pattern: string; scenes: StoryScene[]; totalSec: number; notes: string[] }

export const STORY_PATTERNS = ["Travel journey", "Migration story", "Historical expansion", "Adventure expedition", "Documentary", "Comparison set", "Single reveal", "Establish only"] as const;

function cam(kind: SceneKind, it: Interpretation): string {
  const energetic = !!it.style && /fast|high|very/i.test(it.style.pacing);
  switch (kind) {
    case "establish": return "Pull back (wide)";
    case "highlight": return energetic ? "Punch in" : "Push in";
    case "route": return energetic ? "Dynamic chase" : "Follow / chase";
    case "reveal": return "Fly in";
    case "hero": return it.style?.camera === "Slow" ? "Slow orbit" : "Orbit";
  }
}
type Pre = Omit<StoryScene, "n" | "durationSec">;
const S = (purpose: string, kind: SceneKind, locations: string[], it: Interpretation): Pre => ({ purpose, kind, locations, camera: cam(kind, it) });

/** Choose the most suitable storytelling structure from the interpreted intent. */
export function selectPattern(it: Interpretation): (typeof STORY_PATTERNS)[number] {
  const t = `${it.corrected} ${it.raw}`.toLowerCase();
  const cue = (re: RegExp) => re.test(t);
  const DOC = /\b(document|explain|history|historical|story of|how |why )/i; // prefix-match (no trailing \b)
  if (it.route) {
    if (cue(/\b(migrat|refugee|diaspora|fled|exodus|displac)/i)) return "Migration story";
    if (cue(/\b(expedition|adventure|climb|hike|summit|trek|trail|explor)/i)) return "Adventure expedition";
    return "Travel journey";
  }
  if (cue(/\b(expansion|expand|empire|grew|grow|conquer|annex|rise of|spread of|territor)/i) && (it.locations.length <= 1 || !!it.expandedFrom)) return "Historical expansion";
  if (it.expandedFrom || it.locations.length > 1) return cue(DOC) ? "Documentary" : "Comparison set";
  if (it.locations.length === 1) return cue(DOC) ? "Documentary" : "Single reveal";
  return "Establish only";
}

export function planStory(it: Interpretation): Storyboard {
  const pattern = selectPattern(it);
  let scenes: Pre[] = [];

  if (pattern === "Travel journey" && it.route) {
    const stops = [it.route.from, ...it.route.via, it.route.to];
    scenes.push(S("Set the scale", "establish", [], it));
    const c = continentOf(it.route.from); if (c) scenes.push(S(`Context — ${c}`, "establish", [c], it));
    scenes.push(S(`Start — ${it.route.from}`, "highlight", [it.route.from], it));
    for (let i = 1; i < stops.length; i++) {
      scenes.push(S(`Journey ${stops[i - 1]} → ${stops[i]}`, "route", [stops[i - 1], stops[i]], it));
      if (i < stops.length - 1) scenes.push(S(`Arrive ${stops[i]}`, "highlight", [stops[i]], it));
    }
    scenes.push(S(`Reveal ${it.route.to}`, "reveal", [it.route.to], it));
    scenes.push(S(`Hero — ${it.route.to}`, "hero", [it.route.to], it));
  } else if (pattern === "Migration story" && it.route) {
    const o = it.route.from, d = it.route.to;
    scenes.push(S(`Origin — ${o}`, "highlight", [o], it));
    for (const v of it.route.via) scenes.push(S(`Through ${v}`, "route", [o, v], it));
    scenes.push(S(`Movement ${o} → ${d}`, "route", [o, d], it));
    scenes.push(S(`Destination — ${d}`, "reveal", [d], it));
    scenes.push(S("The scale of the movement", "establish", [], it));
  } else if (pattern === "Adventure expedition" && it.route) {
    const stops = [it.route.from, ...it.route.via, it.route.to];
    scenes.push(S("Overview of the expedition", "establish", [], it));
    scenes.push(S(`Departure — ${it.route.from}`, "highlight", [it.route.from], it));
    for (let i = 1; i < stops.length; i++) {
      scenes.push(S(`Leg ${stops[i - 1]} → ${stops[i]}`, "route", [stops[i - 1], stops[i]], it));
      if (i < stops.length - 1) scenes.push(S(`Key stop — ${stops[i]}`, "highlight", [stops[i]], it));
    }
    scenes.push(S(`Destination — ${it.route.to}`, "reveal", [it.route.to], it));
    scenes.push(S(`Hero — ${it.route.to}`, "hero", [it.route.to], it));
  } else if (pattern === "Historical expansion") {
    const place = it.locations[0] ?? it.expandedFrom ?? "the empire";
    const c = continentOf(place); if (c) scenes.push(S(`Context — ${c}`, "establish", [c], it));
    scenes.push(S(`Origin — ${place}`, "highlight", [place], it));
    scenes.push(S(`The growth of ${place}`, "highlight", [place], it));
    scenes.push(S("Greatest extent", "reveal", [place], it));
    scenes.push(S(`Hero — ${place}`, "hero", [place], it));
  } else if (pattern === "Documentary") {
    const ctx = it.context || it.expandedFrom || (it.locations[0] ? continentOf(it.locations[0]) : null);
    scenes.push(S(ctx ? `Context — ${ctx}` : "Set the context", "establish", ctx ? [ctx] : [], it));
    for (const l of it.locations.slice(0, 8)) scenes.push(S(`Focus — ${l}`, "highlight", [l], it));
    const last = it.locations[it.locations.length - 1];
    scenes.push(S("Insight — close-up", "reveal", last ? [last] : (ctx ? [ctx] : []), it));
    scenes.push(S("Conclusion — pull back", "establish", ctx ? [ctx] : [], it));
  } else if (pattern === "Comparison set") {
    scenes.push(S(it.context ? `Establish ${it.context}` : "Set the context", "establish", it.context ? [it.context] : [], it));
    for (const l of it.locations.slice(0, 12)) scenes.push(S(`Highlight ${l}`, "highlight", [l], it));
    scenes.push(S("Pull back to compare", "establish", it.context ? [it.context] : [], it));
  } else if (pattern === "Single reveal") {
    const place = it.locations[0];
    const c = it.context || continentOf(place); if (c) scenes.push(S(`Context — ${c}`, "establish", [c], it));
    scenes.push(S(`Reveal ${place}`, "reveal", [place], it));
    scenes.push(S(`Hero — ${place}`, "hero", [place], it));
  } else {
    scenes.push(S("World overview", "establish", [], it));
  }

  // ── Story validation layer (auto-improve) ──
  const notes: string[] = [];
  if (scenes[0]?.kind !== "establish") { scenes.unshift(S("Set the scene", "establish", [], it)); notes.push("Added an establishing shot so the audience knows where we are."); }
  const lastKind = scenes[scenes.length - 1]?.kind;
  if (lastKind !== "hero" && lastKind !== "reveal") {
    const lastLoc = [...scenes].reverse().find((s) => s.locations.length)?.locations ?? [];
    scenes.push(S("Hero shot", "hero", lastLoc, it));
    notes.push("Added a payoff/hero ending for a satisfying close.");
  }
  if (scenes.length < 2) notes.push("Single beat — consider giving it more context.");

  // Distribute the duration across scenes (2.5–6s each).
  const per = Math.max(2.5, Math.min(6, Math.round((it.durationSec / scenes.length) * 10) / 10));
  const out: StoryScene[] = scenes.map((s, i) => ({ ...s, n: i + 1, durationSec: per }));
  return { pattern, scenes: out, totalSec: Math.round(per * out.length), notes };
}
