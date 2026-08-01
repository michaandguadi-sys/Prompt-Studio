/**
 * POST /api/v2/storyarc  → { subject, goal, thesis, lockedStyleId, sequences, source }
 *
 * The STORY ARCHITECT. When the user writes several sequences, they are ONE
 * film, not separate clips. This endpoint reads ALL the sequence prompts at
 * once, understands the whole story FIRST, then breaks it back into the
 * requested sequences as a coherent arc — one locked style, a shared goal, and
 * each chapter aware of the others (so e.g. "remove the unethical viewing
 * spots" knows what the previous sequence showed).
 *
 * Pure planning only (no geography / no project build): fast + cheap. Degrades
 * to the deterministic `buildArc` when no AI provider is configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rateLimit";
import { aiComplete, resolveAIConfig, configFromUser } from "@/lib/ai/providers";
import { buildArc, pickLockedStyle, type StoryArc } from "@/lib/parse";

const SYSTEM = `You are the STORY ARCHITECT for "Mapanisy", a cinematic map-animation studio (Vox / Johnny Harris style).
The user gives you an ORDERED list of sequence requests that together form ONE film. Your job:
1. Read ALL the sequences and work out the WHOLE story first — the real subject and the through-line.
2. Then break it back into exactly the same number of sequences, as a coherent dramatic arc.
Each sequence is one chapter: it keeps the SAME visual style as the others, and LATER sequences may build on, extend, or REMOVE/REFINE what earlier ones showed (e.g. "remove the unethical viewing spots" filters the places shown before — it does not start over).
Return STRICT JSON only, no prose:
{
  "subject": "<the concrete subject, e.g. 'giant pandas'>",
  "goal": "<one sentence: what the whole film makes the viewer understand>",
  "thesis": "<one vivid editorial thesis line for the film>",
  "sequences": [
    { "intent": "<this chapter's job in one line>", "beats": ["<ordered beat>", "<beat>", "..."] }
  ]
}
The "sequences" array MUST have exactly one entry per input sequence, in order. Keep beats concrete and map-able (places, movements, reveals). Do not include any other keys.`;

interface ArchPlan {
  subject?: string;
  goal?: string;
  thesis?: string;
  sequences?: { intent?: string; beats?: string[] }[];
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("storyarc", clerkId, { maxRequests: 10, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests — max 10 per minute." }, { status: 429 });
  }

  let body: { ideas?: string[]; style?: string; ai?: any; useAI?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  // Cap count + per-idea length so the arc prompt to the AI can't be inflated.
  const ideas = (Array.isArray(body.ideas) ? body.ideas : []).map((s) => String(s ?? "").trim().slice(0, 600)).filter(Boolean).slice(0, 12);
  if (ideas.length < 2) return NextResponse.json({ error: "Provide at least two sequences." }, { status: 400 });

  // Deterministic backbone — always valid, used as-is on the no-AI path and as
  // the merge target for the AI architect's enrichment.
  const base: StoryArc = buildArc(ideas, { styleId: body.style });

  const aiCfg = body.useAI === false ? null : (configFromUser(body.ai) ?? resolveAIConfig());
  if (!aiCfg) return NextResponse.json(base);

  const user = `These ${ideas.length} sequences form one film. Plan the arc.\n` +
    ideas.map((s, i) => `Sequence ${i + 1}: ${s}`).join("\n");
  // Arc JSON is moderate-sized (~600-900 tokens) — 1500 is enough with room to spare.
  const { text } = await aiComplete(SYSTEM, user, aiCfg, { maxTokens: 1500, temperature: 0.3 });
  if (!text) return NextResponse.json(base); // AI failed → deterministic arc

  let plan: ArchPlan | null = null;
  try {
    const s = text.replace(/^```[a-z]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    plan = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)) as ArchPlan;
  } catch { /* keep base */ }
  if (!plan || !Array.isArray(plan.sequences) || plan.sequences.length !== ideas.length) {
    return NextResponse.json(base);
  }

  // Merge the AI's understanding onto the deterministic shape. Style stays the
  // arc's single locked look (the architect plans story, not art direction).
  const arc: StoryArc = {
    subject: (plan.subject || base.subject).slice(0, 120),
    goal: (plan.goal || base.goal).slice(0, 240),
    thesis: (plan.thesis || "").slice(0, 200),
    lockedStyleId: pickLockedStyle(`${plan.subject ?? ""} ${ideas.join(". ")}`, body.style),
    count: ideas.length,
    sequences: ideas.map((idea, i) => ({
      index: i,
      idea,
      role: base.sequences[i].role,
      intent: (plan!.sequences![i]?.intent || "").slice(0, 200) || undefined,
      beats: Array.isArray(plan!.sequences![i]?.beats) ? plan!.sequences![i]!.beats!.slice(0, 8).map((b) => String(b).slice(0, 160)) : undefined,
    })),
    source: "ai",
  };
  return NextResponse.json(arc);
}
