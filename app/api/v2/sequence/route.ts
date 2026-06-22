/**
 * POST /api/v2/sequence — prompt-driven STORYBOARD editing.
 *
 * Given the current scenes + a plain-English command, returns a minimal list of
 * operations the client applies to the store ("make scene 2 longer", "add
 * crossfades between everything", "swap scenes 3 and 4", "add a scene about the
 * retreat from Moscow", "delete the last scene"). A deterministic heuristic
 * handles the common commands with NO API key; the configured AI handles nuance.
 */
import { NextRequest, NextResponse } from "next/server";
import { aiComplete, resolveAIConfig, configFromUser } from "@/lib/ai/providers";

type Trans = "cut" | "fade" | "crossfade" | "slide";
type Op =
  | { op: "duration"; scene: number; durationSec: number }
  | { op: "transition"; scene: number | "all"; value: Trans }
  | { op: "reorder"; order: number[] }
  | { op: "remove"; scene: number }
  | { op: "rename"; scene: number; name: string }
  | { op: "add"; after: number; idea: string };

type SceneSummary = { name?: string; focus?: string; durationSec?: number; transition?: string };

const numWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };

/** Resolve a scene reference in text ("scene 2", "the first scene", "Berlin") → 1-based index. */
function refToIndex(token: string, scenes: SceneSummary[]): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Math.max(1, Math.min(scenes.length, parseInt(t, 10)));
  if (t in numWords) return numWords[t] === -1 ? scenes.length : numWords[t];
  if (t === "last") return scenes.length;
  if (t === "first") return 1;
  // by name / focus match
  const i = scenes.findIndex((s) => (s.name || "").toLowerCase().includes(t) || (s.focus || "").toLowerCase().includes(t));
  return i >= 0 ? i + 1 : null;
}

/** Deterministic parser for the common commands. Returns null if unmatched. */
function heuristicOps(cmd: string, scenes: SceneSummary[]): Op[] | null {
  const c = cmd.trim();
  const lc = c.toLowerCase();
  const n = scenes.length;
  const ops: Op[] = [];
  const sceneRef = (s: string) => refToIndex(s, scenes);

  // ── reverse ──
  if (/\breverse\b.*\b(scenes?|order|sequence|story)\b|\bin reverse\b/.test(lc)) {
    return [{ op: "reorder", order: Array.from({ length: n }, (_, i) => n - i) }];
  }

  // ── swap A and B ──
  let m = lc.match(/\bswap\b\s+(?:scenes?\s+)?(\w+)\s+(?:and|with|&)\s+(?:scene\s+)?(\w+)/);
  if (m) {
    const a = sceneRef(m[1]), b = sceneRef(m[2]);
    if (a && b && a !== b) {
      const order = Array.from({ length: n }, (_, i) => i + 1);
      order[a - 1] = b; order[b - 1] = a;
      return [{ op: "reorder", order }];
    }
  }

  // ── move scene X to start/end / before/after Y ──
  m = lc.match(/\bmove\s+(?:scene\s+)?([\w]+)\s+to\s+(?:the\s+)?(end|start|beginning|front|first|last)/);
  if (m) {
    const x = sceneRef(m[1]);
    if (x) {
      const rest = Array.from({ length: n }, (_, i) => i + 1).filter((k) => k !== x);
      const toEnd = /end|last/.test(m[2]);
      return [{ op: "reorder", order: toEnd ? [...rest, x] : [x, ...rest] }];
    }
  }

  // ── delete / remove scene ──
  m = lc.match(/\b(?:delete|remove|drop|cut out)\s+(?:the\s+)?(?:scene\s+)?(\w+)(?:\s+scene)?\b/);
  if (m && !/transition|crossfade|fade/.test(lc)) {
    const x = sceneRef(m[1]);
    if (x) return [{ op: "remove", scene: x }];
  }

  // ── add a scene about X (optionally after scene Y) ──
  m = c.match(/\b(?:add|insert|create)\s+(?:a\s+)?(?:new\s+)?scene\s+(?:about|showing|for|of|on|depicting|where)\s+(.+?)(?:\s+(?:after|following)\s+(?:scene\s+)?(\w+))?\.?$/i);
  if (m) {
    const idea = m[1].trim().replace(/["“”]/g, "");
    const after = m[2] ? (sceneRef(m[2]) ?? n) : n;
    if (idea) return [{ op: "add", after, idea }];
  }

  // ── transitions ──
  const transWord: Trans | null = /cross[\s-]?fade|dissolve/.test(lc) ? "crossfade"
    : /dip to black|fade to black|fade between|black fade|\bfades?\b|\bfade\b/.test(lc) ? "fade"
    : /\bslide\b/.test(lc) ? "slide"
    : /hard cut|\bcuts?\b|no transition|straight cut/.test(lc) ? "cut" : null;
  if (transWord && /transition|crossfade|cross-fade|dissolve|fade|slide|\bcut/.test(lc)) {
    const all = /\ball\b|\bevery\b|\beverything\b|\bbetween\b|\beach\b/.test(lc);
    if (all) return [{ op: "transition", scene: "all", value: transWord }];
    const sm = lc.match(/(?:scene|into|to|before)\s+(\w+)/);
    const x = sm ? sceneRef(sm[1]) : null;
    if (x) return [{ op: "transition", scene: x, value: transWord }];
    return [{ op: "transition", scene: "all", value: transWord }];
  }

  // ── duration ──
  // explicit: "scene 2 to 5 seconds" / "make scene 2 5s"
  m = lc.match(/\b(?:scene\s+)?(\w+)\s+(?:to|=|at)?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/);
  if (m && /(scene|long|short|duration|second|\bsec\b)/.test(lc)) {
    const x = sceneRef(m[1]); const sec = parseFloat(m[2]);
    if (x && isFinite(sec)) return [{ op: "duration", scene: x, durationSec: sec }];
  }
  if (/\ball\b|\bevery\b|\beach\b/.test(lc)) {
    const am = lc.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/);
    if (am) { const sec = parseFloat(am[1]); for (let i = 1; i <= n; i++) ops.push({ op: "duration", scene: i, durationSec: sec }); if (ops.length) return ops; }
  }
  // relative: "make scene 2 longer/shorter"
  m = lc.match(/\b(?:make\s+)?(?:scene\s+)?(\w+)\s+(?:much\s+|a bit\s+|a little\s+)?(longer|shorter)/);
  if (m) {
    const x = sceneRef(m[1]);
    if (x) {
      const cur = scenes[x - 1]?.durationSec ?? 6;
      const sec = /longer/.test(m[2]) ? cur + Math.max(2, cur * 0.5) : Math.max(1, cur - Math.max(1.5, cur * 0.4));
      return [{ op: "duration", scene: x, durationSec: Math.round(sec * 10) / 10 }];
    }
  }

  return null;
}

const SYS = `You restructure a MAP-STORY scene sequence. Output ONLY a minified JSON array of operations — no prose. Scenes are 1-based.
Ops:
{"op":"duration","scene":N,"durationSec":num}
{"op":"transition","scene":N|"all","value":"cut"|"fade"|"crossfade"|"slide"}
{"op":"reorder","order":[N,...]}  (every current 1-based scene number, in the NEW order)
{"op":"remove","scene":N}
{"op":"rename","scene":N,"name":"short"}
{"op":"add","after":N,"idea":"a short prompt describing the new scene"}  (after:0 = at the very start)
Return the FEWEST ops that satisfy the command. If nothing applies, return [].`;

async function aiOps(cmd: string, scenes: SceneSummary[], cfg: any): Promise<Op[] | null> {
  if (!cfg) return null;
  const list = scenes.map((s, i) => `${i + 1}. ${s.name || "Scene"} — ${s.focus || "map"} (${s.durationSec ?? 6}s, in:${s.transition ?? "cut"})`).join("\n");
  const { text } = await aiComplete(SYS, `Scenes:\n${list}\n\nCommand: """${cmd.slice(0, 300)}"""`, cfg);
  if (!text) return null;
  try {
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  let body: { command?: string; scenes?: SceneSummary[]; ai?: any };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const command = (body.command ?? "").trim();
  const scenes = Array.isArray(body.scenes) ? body.scenes : [];
  if (!command) return NextResponse.json({ error: "Type a command." }, { status: 400 });
  if (!scenes.length) return NextResponse.json({ error: "No scenes to edit." }, { status: 400 });

  // Heuristic first (deterministic, instant, no key) — falls back to the model.
  let ops = heuristicOps(command, scenes);
  let provider = "heuristic";
  if (!ops || !ops.length) {
    const cfg = configFromUser(body.ai) ?? resolveAIConfig();
    const ai = await aiOps(command, scenes, cfg);
    if (ai && ai.length) { ops = ai; provider = "ai"; }
  }
  if (!ops || !ops.length) {
    return NextResponse.json({ ops: [], note: "I couldn't turn that into an edit. Try e.g. \"make scene 2 longer\", \"add crossfades between everything\", \"swap scenes 1 and 2\", or \"add a scene about the retreat from Moscow\"." });
  }
  return NextResponse.json({ ops, provider });
}
