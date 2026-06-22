/**
 * Story Arc — when the user builds MULTIPLE sequences, they are NOT independent
 * clips: together they are ONE bigger film. This module reads all the sequence
 * prompts as a whole, locks a single consistent style for the entire arc, and
 * gives each sequence a dramatic role — so the panda story is understood first,
 * then told as the requested chapters (keeping style, remembering beats + goal,
 * and letting later sequences build on / refine earlier ones).
 *
 * Pure + deterministic — usable on the client AND as the server-side fallback
 * when no AI provider is available. The AI "story architect" (/api/v2/storyarc)
 * enriches this with the real subject/goal/thesis + per-sequence intent.
 */

export interface ArcSequence {
  index: number;
  idea: string;
  /** This sequence's job in the arc ("Opening — establish the world", …). */
  role: string;
  /** Optional AI-planned intent / beats for this chapter. */
  intent?: string;
  beats?: string[];
}

export interface StoryArc {
  /** The overarching subject the whole film is about ("giant pandas"). */
  subject: string;
  /** The through-line goal ("tell the story of where pandas live and how to see them ethically"). */
  goal: string;
  /** One-line editorial thesis (AI fills this; empty on the logic path). */
  thesis?: string;
  /** ONE concrete style id used for EVERY sequence — never "auto", so the look
   *  never drifts across the film. */
  lockedStyleId: string;
  count: number;
  sequences: ArcSequence[];
  source: "ai" | "logic";
}

/** Context passed to the generate route per sequence so it advances ONE film. */
export interface ArcContext {
  subject: string;
  goal: string;
  thesis?: string;
  index: number;
  count: number;
  /** One-line summaries of what the EARLIER sequences already showed. */
  prior: string[];
  intent?: string;
  beats?: string[];
}

// Subject/mood cues → a signature look, so even "auto" picks ONE style for the
// whole arc (consistency is the whole point of a multi-sequence film).
const STYLE_CUES: [RegExp, string][] = [
  [/\b(war|conflict|battle|military|invasion|front|troops?|siege|combat)\b/i, "war-room"],
  [/\b(ancient|histor(y|ic|ical)|empire|medieval|expedition|explorer|antique|colonial|\b1[0-9]{3}\b|century)\b/i, "expedition-1900"],
  [/\b(trade|econom(y|ic)|nature|wildlife|animals?|species|forest|jungle|rain ?forest|ocean|reef|climate|eco|panda|tiger|whale|migration|habitats?|conservation|wetland|savann?a)\b/i, "terra-verde"],
  [/\b(tech|future|futuristic|data|network|modern|grid|digital|cyber|space|satellite)\b/i, "neo-atlas"],
  [/\b(news|report|breaking|investigation|dossier|noir|crime|leak|classified)\b/i, "noir-dossier"],
];

/** Pick the single locked style for the whole arc: the user's choice wins; an
 *  "auto" arc derives ONE concrete look from the combined prompts. */
export function pickLockedStyle(combined: string, styleId?: string): string {
  if (styleId && styleId !== "auto") return styleId;
  for (const [re, id] of STYLE_CUES) if (re.test(combined)) return id;
  return "editorial"; // clean, neutral default
}

/** Dramatic role for chapter i of n — a clean three/four-act shape. */
function roleFor(i: number, n: number): string {
  if (i === 0) return "Opening — establish the world";
  if (i === n - 1) return "Resolution — land the payoff";
  if (n >= 4 && i === n - 2) return "Turn — the complication";
  return "Development — go deeper";
}

/** Best-effort deterministic subject from the combined prompts: strip leading
 *  command words and keep the meaningful noun phrase. Crude — the AI architect
 *  supplies the real subject; this is the safe fallback. */
function crudeSubject(ideas: string[]): string {
  const first = (ideas[0] ?? "").toLowerCase()
    .replace(/^\s*(show me|show|tell me|give me|i want|make|create|build|highlight|the story of|let'?s see|can you)\b/i, "")
    .replace(/^\s*(the|a|an|all|where|how|why|when)\b/i, "")
    .replace(/\b(habitats?|places?|regions?|areas?|spots?|where)\b/gi, "")
    // drop trailing helper verbs so "pandas live" → "pandas"
    .replace(/\b(live|lives|lived|are|is|was|were|can|could|be|been|seen|see|found|located|exist|roam)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  return first.split(/\s+/).slice(0, 6).join(" ") || (ideas[0] ?? "the story");
}

/** Deterministic arc — the safe fallback (and the shape the AI architect fills). */
export function buildArc(ideas: string[], opts: { styleId?: string } = {}): StoryArc {
  const clean = ideas.map((s) => s.trim()).filter(Boolean);
  const combined = clean.join(". ");
  const lockedStyleId = pickLockedStyle(combined, opts.styleId);
  const subject = crudeSubject(clean);
  const goal = `Tell one cohesive story about ${subject} across ${clean.length} connected sequences.`;
  return {
    subject,
    goal,
    thesis: "",
    lockedStyleId,
    count: clean.length,
    sequences: clean.map((idea, index) => ({ index, idea, role: roleFor(index, clean.length) })),
    source: "logic",
  };
}

/** Condense a generated sequence into one continuity line for the NEXT sequence:
 *  what places / focus / framing it established, so chapter K+1 can build on it. */
export function summarizeSequence(genResponse: any, idea: string, index: number): string {
  const plan = genResponse?.plan ?? {};
  const stops: string[] = Array.isArray(plan.cameraStops) ? plan.cameraStops : [];
  const focus = plan.focus ? String(plan.focus) : "";
  const places = Array.from(new Set([focus, ...stops].filter(Boolean))).slice(0, 6);
  const titles = (plan.layers ?? [])
    .filter((l: any) => l?.kind === "title" && l.text)
    .map((l: any) => String(l.text))
    .slice(0, 2);
  const shown = places.length ? `showed ${places.join(", ")}` : (titles.length ? `titled “${titles.join(" / ")}”` : "established the scene");
  return `Sequence ${index + 1} ("${idea.slice(0, 60)}") ${shown}.`;
}
