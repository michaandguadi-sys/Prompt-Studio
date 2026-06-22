/**
 * Story Framework — the scaffold EVERY AI prompt flows through. It runs the
 * deterministic engine (interpret → planStory) to fix the STRUCTURE (pattern,
 * scene beats) and STYLE up front, then hands the AI a strict instruction to
 * RESEARCH facts + write narration that FILLS that structure. The result:
 * per-prompt adaptation (the AI's content) with consistent quality + structure +
 * style (the framework). Not repetitive, but never structureless.
 */
import { interpret, type Interpretation } from "./intent";
import { planStory, type Storyboard } from "./director";

export interface StoryFramework {
  idea: string;
  interpretation: Interpretation;
  storyboard: Storyboard;
  signatureStyleId?: string;
  interview?: Record<string, string>;
  /** True when the story is best told as a sequenced multi-scene film. */
  multiScene: boolean;
}

export function buildFramework(idea: string, opts: { styleId?: string; interview?: Record<string, string> } = {}): StoryFramework {
  const interpretation = interpret(idea);
  const storyboard = planStory(interpretation);
  // Bias TOWARD splitting into beats. Users want distinct story phases as
  // separate, tweakable scenes — even when the motion flows continuously — so
  // anything with ≥2 beats that isn't a bare establish-only shot is multi-scene.
  // (Previously required ≥3 beats AND excluded Single reveal, which is why it
  // "almost never suggested 2 scenes".)
  const multiScene = storyboard.scenes.length >= 2 && storyboard.pattern !== "Establish only";
  return { idea, interpretation, storyboard, signatureStyleId: opts.styleId, interview: opts.interview, multiScene };
}

/** The instruction appended to the AI planner — turns the model into a creative
 *  director that FILLS the determined storyboard rather than free-forming. */
export function frameworkInstruction(fw: StoryFramework): string {
  const it = fw.interpretation, sb = fw.storyboard;
  const L: string[] = [];
  L.push("## DIRECTOR FRAMEWORK — follow this exactly (the story engine determined the STRUCTURE; you adapt the CONTENT, never the structure or style).");
  L.push(`Storytelling pattern: ${sb.pattern}.`);
  L.push("Realize these beats IN ORDER — same count, same purpose:");
  for (const s of sb.scenes) {
    L.push(`  ${s.n}. ${s.purpose} — [${s.kind}]${s.locations.length ? ` · ${s.locations.join(", ")}` : ""} · camera: ${s.camera} · ~${s.durationSec}s`);
  }
  if (it.style) L.push(`Visual style: ${it.style.style} (camera ${it.style.camera}, motion ${it.style.motion}, pacing ${it.style.pacing}, map theme ${it.style.mapTheme}) — keep it identical across every beat for consistency.`);
  if (fw.signatureStyleId && fw.signatureStyleId !== "auto") L.push(`Locked signature look: ${fw.signatureStyleId} — do not override its palette/grade.`);
  if (fw.interview && Object.keys(fw.interview).length) L.push(`Creative choices from the user: ${Object.entries(fw.interview).map(([k, v]) => `${k}=${v}`).join(" · ")}.`);
  L.push("Your job (creative director): RESEARCH the real facts, dates and exact places; write ONE vivid narration line per beat; pick precise locations. Return the plan that realizes these beats in order. Do NOT add, drop, reorder or merge beats, and do NOT change the style. Story first — every camera move must serve the story.");
  return "\n\n" + L.join("\n");
}

/** A short human-readable storyboard summary (for a "here's the plan" preview). */
export function storyboardSummary(fw: StoryFramework): string[] {
  return [`${fw.storyboard.pattern} · ${fw.storyboard.scenes.length} scenes · ~${fw.storyboard.totalSec}s`,
    ...fw.storyboard.scenes.map((s) => `${s.n}. ${s.purpose}`)];
}
