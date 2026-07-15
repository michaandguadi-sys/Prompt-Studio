/**
 * The narrative-interview endpoint — the front half of "one prompt → a few
 * answers → the best result".
 *
 *   POST /api/v2/interview  { idea, ai?, useAI? }
 *     → { questions: Question[], provider: "ai" | "heuristic", thesisHint? }
 *
 * Given a one-line idea it returns the 3–4 highest-leverage questions to pin the
 * vision (tone, camera energy, the SPECIFIC focus/angle, length). When an AI
 * provider is configured the questions are tailored to the idea; otherwise a
 * strong archetype-driven heuristic supplies them. The answers are later POSTed
 * to /api/v2/generate as `interview` and shape the plan.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rateLimit";
import { aiComplete, resolveAIConfig, configFromUser } from "@/lib/ai/providers";
import { matchArchetype } from "@/lib/ai/directorDoctrine";

export type IVOption = { label: string; value: string; recommended?: boolean };
export type IVQuestion = { id: "tone" | "energy" | "focus" | "length" | string; question: string; options: IVOption[] };

const TONE: IVQuestion = {
  id: "tone", question: "What should it feel like?",
  options: [
    { label: "Cinematic & dramatic", value: "cinematic", recommended: true },
    { label: "Calm & informational", value: "calm" },
    { label: "Urgent, news-style", value: "urgent" },
    { label: "Epic & sweeping", value: "epic" },
  ],
};
const LENGTH: IVQuestion = {
  id: "length", question: "How long?",
  options: [
    { label: "~8s · social clip", value: "8" },
    { label: "~15s · standard", value: "15", recommended: true },
    { label: "~30s · explainer", value: "30" },
  ],
};

/** Focus options tailored to the matched story archetype (the heuristic path). */
function focusQuestion(idea: string): IVQuestion {
  const name = matchArchetype(idea)?.name ?? "";
  const has = (s: string) => name.toLowerCase().includes(s);
  let opts: IVOption[];
  if (has("expansion")) opts = [{ label: "The growth over time", value: "growth", recommended: true }, { label: "Its greatest extent", value: "peak" }, { label: "The turning points", value: "moments" }];
  else if (has("contraction")) opts = [{ label: "Then vs now", value: "thennow", recommended: true }, { label: "The decline over time", value: "decline" }, { label: "What was lost", value: "lost" }];
  else if (has("movement")) opts = [{ label: "The full route, start to end", value: "route", recommended: true }, { label: "The key stops", value: "stops" }, { label: "The terrain crossed", value: "terrain" }];
  else if (has("spread") || has("diffusion")) opts = [{ label: "How it spread outward", value: "spread", recommended: true }, { label: "Where it reached", value: "reach" }, { label: "The timeline", value: "timeline" }];
  else if (has("influence") || has("network")) opts = [{ label: "The network of ties", value: "network", recommended: true }, { label: "Who's aligned", value: "aligned" }, { label: "The sphere of reach", value: "sphere" }];
  else if (has("conflict")) opts = [{ label: "The front line", value: "frontline", recommended: true }, { label: "Key flashpoints", value: "flashpoints" }, { label: "Territory changing hands", value: "territory" }];
  else if (has("comparison")) opts = [{ label: "The contrast between places", value: "contrast", recommended: true }, { label: "The outliers", value: "outliers" }, { label: "The overall pattern", value: "pattern" }];
  else if (has("chokepoint")) opts = [{ label: "Why this spot matters", value: "why", recommended: true }, { label: "What it controls", value: "controls" }, { label: "The surrounding area", value: "context" }];
  else if (has("scale")) opts = [{ label: "Its true size", value: "size", recommended: true }, { label: "Compared to somewhere familiar", value: "compare" }, { label: "The bird's-eye view", value: "birdseye" }];
  else opts = [{ label: "The big picture", value: "overview", recommended: true }, { label: "The key locations", value: "locations" }, { label: "How it changed over time", value: "change" }];
  return { id: "focus", question: "What's the heart of the story?", options: opts };
}

// SHORT by design: exactly 3 taps between idea and film. Camera energy is
// derived from tone downstream (generate/applyInterview), so we don't spend a
// question on it — focus (the story's heart) is the one that matters most.
function heuristicQuestions(idea: string): IVQuestion[] {
  return [TONE, focusQuestion(idea), LENGTH];
}

const IV_SYSTEM = `You are a documentary map director's assistant (Vox / Johnny Harris style). Given a one-line idea for an animated map, ask EXACTLY 3 quick questions — the highest-leverage creative decisions BEFORE building it. Every answer becomes a BINDING directive for the story director, so options must be real directorial choices. Cover, in this order, using EXACTLY these ids:
- "tone": the emotional feel.
- "focus": the SPECIFIC narrative heart — tailor the options to THIS idea (name real, concrete choices a director would weigh, not generic ones).
- "length": duration.
Each question has 3–4 short options (≤5 words each) with a stable lowercase "value" and exactly ONE marked "recommended": true (your expert default). Return ONLY JSON: {"questions":[{"id","question","options":[{"label","value","recommended"?}]}],"thesisHint":"a one-line guess at the single point the map should make"}. No prose.`;

function sanitize(qs: any): IVQuestion[] | null {
  if (!Array.isArray(qs)) return null;
  const out: IVQuestion[] = [];
  for (const q of qs.slice(0, 3)) {
    if (!q?.id || !q?.question || !Array.isArray(q.options)) continue;
    const options = q.options.slice(0, 4).map((o: any) => ({
      label: String(o?.label ?? "").slice(0, 40),
      value: String(o?.value ?? o?.label ?? "").toLowerCase().slice(0, 30),
      recommended: !!o?.recommended,
    })).filter((o: IVOption) => o.label && o.value);
    if (options.length < 2) continue;
    if (!options.some((o: IVOption) => o.recommended)) options[0].recommended = true;
    out.push({ id: String(q.id).slice(0, 16), question: String(q.question).slice(0, 120), options });
  }
  return out.length >= 2 ? out : null;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("interview", clerkId, { maxRequests: 20, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests — max 20 per minute." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const idea = (body?.idea ?? "").toString().trim();
  if (!idea) return NextResponse.json({ error: "Describe your idea first." }, { status: 400 });

  const aiCfg = body?.useAI === false ? null : (configFromUser(body?.ai) ?? resolveAIConfig());

  if (aiCfg) {
    try {
      // Interview JSON is small (~400 tokens) — 800 is plenty and keeps cost low.
      const { text } = await aiComplete(IV_SYSTEM, `Idea: """${idea.slice(0, 600)}"""`, aiCfg, { maxTokens: 800 });
      if (text) {
        const s = text.replace(/^```[a-z]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
        const json = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
        const questions = sanitize(json?.questions);
        if (questions) return NextResponse.json({ questions, provider: "ai", thesisHint: (json?.thesisHint ?? "").toString().slice(0, 200) });
      }
    } catch { /* fall through to heuristic */ }
  }

  return NextResponse.json({ questions: heuristicQuestions(idea), provider: "heuristic" });
}
