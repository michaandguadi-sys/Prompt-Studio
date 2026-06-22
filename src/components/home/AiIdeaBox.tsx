"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Sparkles, Loader2, ArrowRight, KeyRound, Plus, X, Wand2, Film, Check } from "lucide-react";
import { SettingsModal, loadAISettings } from "@/v2/ui/SettingsModal";
import { SIGNATURE_STYLES } from "@/lib/presets/signatureStyles";
import { fontStack } from "@/v2/doc/themes";
import { StoryboardReview, type ReviewData } from "./StoryboardReview";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { buildArc, summarizeSequence, type StoryArc, type ArcContext } from "@/lib/parse";
import { addAddon, type Addon } from "@/lib/addons";
import { useAiEngine } from "@/lib/aiEngine";

const EXAMPLES = [
  "The fall of the Berlin Wall, 1989",
  "Fly into Tokyo at night",
  "Trade routes across the South China Sea",
  "Conflict on the India–Pakistan border",
];

/** Tiny CSS texture hint layered over a style card's gradient. */
function cardTexture(id: string): React.CSSProperties | undefined {
  switch (id) {
    case "noir-dossier": return { backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0 1px, transparent 1px 3px)" };
    case "neo-atlas":    return { backgroundImage: "linear-gradient(rgba(255,255,255,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.14) 1px,transparent 1px)", backgroundSize: "9px 9px" };
    case "war-room":     return { backgroundImage: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)" };
    case "expedition-1900": return { backgroundImage: "radial-gradient(ellipse at center, rgba(243,230,200,0.18) 0%, transparent 60%), radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 110%)" };
    default: return { backgroundImage: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.35) 115%)" };
  }
}

/**
 * The Story Studio — one box for a single animation, or hit "+" to add more
 * sequences and build a whole story. No quick/story toggle: a simple request
 * is one sequence; a multi-sequence request is the timeline, ready to go. Pick
 * a Signature Style up front so every result is cohesively graded.
 */
type IVQ = { id: string; question: string; options: { label: string; value: string; recommended?: boolean }[] };
type IVState = { questions: IVQ[]; answers: Record<string, string>; provider: string; thesisHint?: string };

export const AiIdeaBox: React.FC<{ onPromptChange?: (text: string) => void }> = ({ onPromptChange }) => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const addSceneFromComposition = useEditor((s) => s.addSceneFromComposition);
  const [prompts, setPrompts] = useState<string[]>([""]);
  const [styleId, setStyleId] = useState<string>("auto");
  const [useAI, setUseAI] = useAiEngine();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [step, setStep] = useState<{ current: number; total: number }>({ current: 1, total: 1 });
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [review, setReview] = useState<ReviewData | null>(null);
  // The narrative interview: a few smart questions between the prompt and the build.
  const [iv, setIv] = useState<IVState | null>(null);
  const [ivLoading, setIvLoading] = useState(false);

  // Onboarding seed: when the first-run modal hands off a starter idea, pre-fill
  // the prompt (on mount for a reload, and live via the window event).
  useEffect(() => {
    const apply = (idea?: string) => { if (idea && idea.trim()) { setPrompts([idea]); setIv(null); } };
    try { const seed = localStorage.getItem("mapanisy-seed-prompt"); if (seed) { apply(seed); localStorage.removeItem("mapanisy-seed-prompt"); } } catch { /* SSR */ }
    const h = (e: Event) => { try { localStorage.removeItem("mapanisy-seed-prompt"); } catch {} apply((e as CustomEvent).detail); };
    window.addEventListener("mapanisy-seed", h);
    return () => window.removeEventListener("mapanisy-seed", h);
  }, []);

  const multi = prompts.length > 1;
  const filled = prompts.map((p) => p.trim()).filter(Boolean);

  // Surface the live (first) prompt so an outer "intent reader" can preview what
  // the director understands as the user types — no effect on generation.
  useEffect(() => { onPromptChange?.(prompts[0] ?? ""); }, [prompts, onPromptChange]);

  const setPrompt = (i: number, v: string) => { setPrompts((ps) => ps.map((p, k) => (k === i ? v : p))); if (iv) setIv(null); };
  const addPrompt = () => setPrompts((ps) => [...ps, ""]);
  const removePrompt = (i: number) => setPrompts((ps) => (ps.length > 1 ? ps.filter((_, k) => k !== i) : ps));

  const styleArg = styleId !== "auto" ? styleId : undefined;
  const ai = () => loadAISettings() ?? undefined;

  const genOne = async (idea: string, mode?: "story", interview?: { answers: Record<string, string>; text: string }, opts?: { style?: string; arc?: ArcContext }) => {
    const res = await fetch("/api/v2/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // useAI:false → the server skips the model and uses the built-in director
      // logic (instant, no key). The user chooses, and we stay transparent.
      // opts.style overrides the picker for multi-sequence arcs (locked look).
      body: JSON.stringify({ idea, mode, style: opts?.style ?? styleArg, ai: useAI ? ai() : undefined, useAI, interview: interview?.answers, interviewText: interview?.text, arc: opts?.arc }),
    });
    const d = await res.json();
    // Persist any reusable feature the AI invented for this story so it becomes a
    // one-click building block in the editor's "AI add-ons" panel, forever.
    try { if (Array.isArray(d?.addons)) for (const a of d.addons as Addon[]) if (a?.name) addAddon(a); } catch { /* registry full / SSR */ }
    return d;
  };

  /** Analyse ALL sequences as ONE story → the arc (AI architect, else logic). */
  const fetchArc = async (ideas: string[]): Promise<StoryArc> => {
    try {
      const r = await fetch("/api/v2/storyarc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas, style: styleArg, ai: useAI ? ai() : undefined, useAI }),
      });
      if (r.ok) { const d = await r.json(); if (d?.sequences?.length === ideas.length) return d as StoryArc; }
    } catch { /* fall through to deterministic */ }
    return buildArc(ideas, { styleId: styleArg });
  };

  /** Label of the chosen option for a question (for the human-readable brief). */
  const ivLabel = (q: IVQ, val: string) => q.options.find((o) => o.value === val)?.label ?? val;
  const ivPayload = () => iv ? { answers: iv.answers, text: iv.questions.map((q) => `• ${q.question} → ${ivLabel(q, iv.answers[q.id])}`).join("\n") } : undefined;
  const setAnswer = (qid: string, value: string) => setIv((s) => (s ? { ...s, answers: { ...s.answers, [qid]: value } } : s));

  /** Fetch the tailored questions for a single idea, defaulting each to the
   *  recommended option (so "accept all" is one click). */
  const startInterview = async (idea: string) => {
    setIvLoading(true); setError(null);
    try {
      const r = await fetch("/api/v2/interview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, ai: useAI ? ai() : undefined, useAI }),
      });
      const d = await r.json();
      if (d?.questions?.length) {
        const answers: Record<string, string> = {};
        for (const q of d.questions as IVQ[]) answers[q.id] = (q.options.find((o) => o.recommended) ?? q.options[0]).value;
        setIv({ questions: d.questions, answers, provider: d.provider, thesisHint: d.thesisHint });
      } else { runGenerate(); }
    } catch { runGenerate(); }
    finally { setIvLoading(false); }
  };

  const openInEditor = (project: any, narration: string[] = []) => {
    load(project);
    try {
      const st = (useEditor as any).getState?.();
      const sc = st?.project?.scenes?.[0];
      if (sc && narration.length) st.setSceneNarration(sc.id, narration.join("\n\n"));
    } catch { /* best-effort */ }
    router.push("/studio2");
  };

  /** The button: one prompt + AI on → ask the smart questions first; otherwise
   *  (multi-scene, no-AI, or questions already answered) build straight away. */
  const generate = async () => {
    if (loading || ivLoading || filled.length === 0) return;
    if (filled.length === 1 && useAI && !iv) { await startInterview(filled[0]); return; }
    runGenerate();
  };

  const runGenerate = async () => {
    if (loading || filled.length === 0) return;
    setStep({ current: 1, total: filled.length });
    setLoading(true); setError(null); setProgress(null);
    try {
      // ── MULTIPLE sequences → ONE bigger film, told as connected chapters ──
      // First understand the WHOLE story (the arc), then realize each sequence
      // with the SAME locked style, the shared goal, and a running memory of
      // what earlier chapters showed — so later sequences build on / refine
      // them (e.g. "remove the unethical spots"), never restart from scratch.
      if (filled.length > 1) {
        setProgress("Reading the whole story…");
        const arc = await fetchArc(filled);
        const lockedStyle = arc.lockedStyleId;
        const prior: string[] = [];
        let started = false;
        let lastErr: string | null = null;
        for (let i = 0; i < filled.length; i++) {
          setStep({ current: i + 1, total: filled.length });
          setProgress(`Building sequence ${i + 1} of ${filled.length}…`);
          const seq = arc.sequences[i] ?? { index: i, idea: filled[i], role: "" };
          const arcCtx: ArcContext = {
            subject: arc.subject, goal: arc.goal, thesis: arc.thesis,
            index: i, count: filled.length, prior: [...prior],
            intent: seq.intent, beats: seq.beats,
          };
          const d = await genOne(seq.idea, undefined, undefined, { style: lockedStyle, arc: arcCtx });
          const comp = d?.project?.composition;
          // Strict AI mode can reject a sequence (no key / model error) — surface it.
          if (!comp) { lastErr = d?.error ?? lastErr; continue; }
          const st = (useEditor as any).getState?.();
          if (!started) {
            load(d.project); started = true;
            const sid = st?.project?.scenes?.[0]?.id;
            if (sid && d.narration?.length) st.setSceneNarration(sid, d.narration.join("\n\n"));
          } else {
            const sid = addSceneFromComposition(comp, seq.idea.slice(0, 24));
            if (sid && d.narration?.length) st?.setSceneNarration?.(sid, d.narration.join("\n\n"));
          }
          // Remember what this chapter showed so the next one can build on it.
          prior.push(summarizeSequence(d, seq.idea, i));
        }
        if (!started) { setError(lastErr ?? "Couldn't build those scenes — try clearer ideas."); setLoading(false); return; }
        router.push("/studio2");
        return;
      }

      // ── ONE prompt (+ the interview answers) → the best single result ──
      const d = await genOne(filled[0], undefined, ivPayload());
      if (!d?.project) { setError(d?.error ?? "Couldn't generate that — try a clearer idea."); setLoading(false); return; }
      if (d.story && d.plan) { setReview({ project: d.project, plan: d.plan, narration: d.narration ?? [], styleId, idea: filled[0], verification: d.verification, storyboard: d.storyboard }); setLoading(false); return; }
      // Single scene → the "Director's cut" review (fact brief + runtime + open),
      // so every generation gets a guided moment before the dense editor.
      if (d.plan || d.verification) { setReview({ project: d.project, plan: d.plan, narration: d.narration ?? [], styleId, idea: filled[0], verification: d.verification, storyboard: d.storyboard, single: true }); setLoading(false); return; }
      openInEditor(d.project, d.narration ?? []);
    } catch { setError("Network error — please try again."); setLoading(false); }
  };

  return (
    <div className="relative">
      <div className="card-light rounded-2xl p-2 shadow-floaty">
        {/* Sequence rows — one box, or several for a story */}
        <div className="space-y-1.5">
          {prompts.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="mt-2.5 ml-1.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {multi
                  ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-iris/15 text-[10px] font-bold text-iris">{i + 1}</span>
                  : <Sparkles size={18} className="text-iris" />}
              </div>
              <textarea
                value={p}
                onChange={(e) => setPrompt(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
                rows={multi ? 2 : 3}
                placeholder={multi
                  ? `Scene ${i + 1}…  e.g. “${["The Allies land at Normandy", "Push inland through France", "Liberate Paris"][i] ?? "the next beat of your story"}”`
                  : "Describe your map animation, or paste a whole story…  e.g. “The fall of the Berlin Wall, 1989”"}
                className="flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-graphite placeholder:text-graphite/30 focus:outline-none"
              />
              {multi && (
                <button onClick={() => removePrompt(i)} className="mt-2.5 mr-1 shrink-0 text-graphite/30 hover:text-red-400" title="Remove scene"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {/* ── Narrative interview: a few smart choices → the best result ── */}
        {iv && (
          <div className="mx-1.5 mt-1.5 rounded-xl border border-iris/25 bg-iris/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-graphite">
                <Sparkles size={13} className="text-iris" /> Let’s nail the vision
                <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-graphite/55">{iv.provider === "ai" ? "✦ tailored to your idea" : "⚡ smart defaults"}</span>
              </div>
              <button onClick={() => setIv(null)} className="text-graphite/35 hover:text-graphite" title="Back"><X size={14} /></button>
            </div>
            {iv.thesisHint && <div className="mb-2.5 text-[11px] italic leading-snug text-graphite/50">“{iv.thesisHint}”</div>}
            <div className="space-y-2.5">
              {iv.questions.map((q) => (
                <div key={q.id}>
                  <div className="mb-1 text-[11px] font-medium text-graphite/70">{q.question}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => {
                      const on = iv.answers[q.id] === o.value;
                      return (
                        <button key={o.value} onClick={() => setAnswer(q.id, o.value)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? "border-iris bg-iris text-white shadow-glow-iris" : "border-line bg-white text-graphite/65 hover:border-iris/50"}`}>
                          {on && <Check size={11} />}{o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={runGenerate} className="mt-2.5 text-[11px] font-medium text-graphite/40 hover:text-iris">Skip — just use the recommended picks →</button>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2 px-1.5">
          <button
            onClick={addPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite/55 transition-colors hover:border-iris hover:text-iris"
            title="Add another sequence — turns this into a multi-scene story"
          >
            <Plus size={13} /> {multi ? "Add sequence" : "Make it a story (add sequences)"}
          </button>
          <button
            onClick={generate}
            disabled={loading || ivLoading || filled.length === 0}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-glow-iris transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {loading || ivLoading ? <Loader2 size={15} className="animate-spin" /> : iv ? <ArrowRight size={15} /> : multi ? <Film size={15} /> : <Sparkles size={15} />}
            {loading ? (progress ?? "Creating…") : ivLoading ? "Reading your idea…" : iv ? "Create animation" : multi ? `Build ${filled.length} scenes` : "Generate"}
          </button>
        </div>

        {/* ── Signature Style picker ── */}
        <div className="mt-1 border-t border-black/5 px-2 pb-1.5 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/35">Style</span>
            <span className="truncate pl-2 text-[10px] text-graphite/30">{styleId === "auto" ? "the director picks a look to fit the story" : SIGNATURE_STYLES.find((s) => s.id === styleId)?.tagline}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setStyleId("auto")} title="Let the AI director pick the best look" className={`group w-[86px] shrink-0 text-left transition-transform hover:-translate-y-0.5 ${styleId === "auto" ? "" : "opacity-80 hover:opacity-100"}`}>
              <div className={`relative flex h-12 items-center justify-center overflow-hidden rounded-lg border ${styleId === "auto" ? "border-iris ring-2 ring-iris/40" : "border-black/10"}`} style={{ background: "conic-gradient(from 210deg at 60% 40%, #0a0303, #161009, #02060c, #05060e, #03100c, #0a0303)" }}>
                <Wand2 size={15} className="text-white/85 drop-shadow" />
              </div>
              <div className={`mt-1 truncate text-[10px] font-medium ${styleId === "auto" ? "text-iris" : "text-graphite/55"}`}>Director&apos;s choice</div>
            </button>
            {SIGNATURE_STYLES.map((s) => {
              const active = styleId === s.id;
              return (
                <button key={s.id} onClick={() => setStyleId(s.id)} title={`${s.name} — ${s.tagline}`} className={`group w-[86px] shrink-0 text-left transition-transform hover:-translate-y-0.5 ${active ? "" : "opacity-80 hover:opacity-100"}`}>
                  <div className={`relative h-12 overflow-hidden rounded-lg border ${active ? "border-iris ring-2 ring-iris/40" : "border-black/10"}`} style={{ background: `linear-gradient(140deg, ${s.swatches[0]} 0%, ${s.swatches[0]} 52%, ${s.swatches[1]} 52%, ${s.swatches[1]} 78%, ${s.swatches[2]} 78%)` }}>
                    <div className="absolute inset-0" style={cardTexture(s.id)} />
                    <span className="absolute bottom-0.5 left-1.5 text-[15px] font-bold leading-none text-white" style={{ fontFamily: fontStack(s.fontDisplay), textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>Aa</span>
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: s.swatches[2], boxShadow: `0 0 8px ${s.swatches[2]}` }} />
                  </div>
                  <div className={`mt-1 truncate text-[10px] font-medium ${active ? "text-iris" : "text-graphite/55"}`}>{s.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Engine: your AI vs the built-in director logic (your choice) ── */}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-black/5 px-2 pb-0.5 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/35">Engine</span>
          <div className="flex items-center rounded-lg border border-line bg-paper-100/60 p-0.5">
            <button onClick={() => setUseAI(true)} title="Your AI model researches, fact-checks and art-directs the whole animation" className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${useAI ? "bg-brand text-white shadow-glow-iris" : "text-graphite/45 hover:text-graphite"}`}><Wand2 size={11} /> AI-directed</button>
            <button onClick={() => setUseAI(false)} title="Built-in director logic — instant, no API key, fully private" className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${!useAI ? "bg-emerald-500 text-white shadow-sm" : "text-graphite/45 hover:text-graphite"}`}>⚡ Smart (no AI)</button>
          </div>
        </div>
      </div>

      {!multi && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-graphite/30">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setPrompt(0, ex)} className="max-w-full truncate rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[11px] text-graphite/55 transition-colors hover:border-iris/40 hover:text-graphite">{ex}</button>
          ))}
        </div>
      )}
      {multi && (
        <div className="mt-2 px-1 text-[11px] leading-relaxed text-graphite/40">
          Each box becomes a scene on the timeline — one cohesive style, transitions between them, fully editable after.
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-400/90">{error}</div>}

      <div className="mt-3 flex items-center justify-between gap-1.5 text-[11px] text-graphite/40">
        <div className="flex items-center gap-1.5">
          <span>or</span>
          <button onClick={() => router.push("/studio2")} className="inline-flex items-center gap-1 text-graphite/55 transition-colors hover:text-iris">start from a blank map <ArrowRight size={11} /></button>
        </div>
        <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1 text-graphite/45 transition-colors hover:text-iris" title="Connect your AI provider & API key">
          <KeyRound size={11} /> AI keys & providers
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {review && (
        <StoryboardReview data={review} onClose={() => setReview(null)} onOpen={(project, narration) => { setReview(null); openInEditor(project, narration); }} />
      )}
      <GeneratingOverlay
        open={loading}
        idea={filled[Math.min(step.current - 1, Math.max(0, filled.length - 1))] ?? filled[0]}
        styleName={styleId === "auto" ? "Director’s choice" : SIGNATURE_STYLES.find((s) => s.id === styleId)?.name}
        current={step.current}
        total={step.total}
      />
    </div>
  );
};
