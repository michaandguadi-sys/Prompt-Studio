"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Sparkles, Loader2, ArrowRight, KeyRound, Plus, X, Wand2, Film, Check } from "lucide-react";
import { SettingsModal, loadAISettings } from "@/v2/ui/SettingsModal";
import { SIGNATURE_STYLES } from "@/lib/presets/signatureStyles";
import { fontStack } from "@/v2/doc/themes";
import { STYLE_KEY } from "@/components/home/OnboardingModal";
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

const PLACEHOLDER_EXAMPLES = [
  "✈️ Animate my backpacking trip through Japan — Tokyo, Kyoto, Osaka, golden hour",
  "The fall of the Berlin Wall, November 1989 — show the division, then the moment it crumbled",
  "🚗 A cinematic Route 66 road trip from Chicago to Los Angeles, vintage atlas style",
  "Show the Amazon disappearing — deforestation from 1985 to today, year by year",
  "🚁 Fly from New York to Iceland with smooth camera moves, cold blue mood",
  "Trade routes that built the Silk Road, from Chang'an to Constantinople — 100 AD",
  "🌍 Highlight every country I've visited: France, Italy, Japan, Brazil and Morocco",
  "A storm is forming in the Atlantic — track it, show the landfall, map the aftermath",
  "🌋 Animate my volcano expedition in Guatemala — trek to the crater at dawn",
];

/** Detect what kind of input the user has provided so the Director can be told
 *  upfront how to interpret it — and so we can show a helpful hint in the UI. */
function detectInputType(text: string): "voiceover" | "brief" | "idea" | null {
  const t = text.trim();
  if (t.length < 18) return null;
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const voiceoverMarkers = /\b(in \d{4}|as the|it was|when|then|until|across the|along the|through the|for decades|for centuries|overnight|suddenly|by \d{4}|at that moment|this is the story|here in|back in \d{4}|today|the story of)\b/i;
  if (sentences.length >= 2 && voiceoverMarkers.test(t) && sentences.every((s) => s.length > 12)) return "voiceover";
  if (t.includes("\n\n") || sentences.length >= 4) return "brief";
  return "idea";
}

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

type IVQ = { id: string; question: string; options: { label: string; value: string; recommended?: boolean }[] };
type IVState = { questions: IVQ[]; answers: Record<string, string>; provider: string; thesisHint?: string };

export const AiIdeaBox: React.FC<{
  onPromptChange?: (text: string) => void;
  /** Dark glass mode — used when placed on the dark hero background. */
  darkMode?: boolean;
  /** Fired the moment real generation begins — lets the page start its own
   *  transition (e.g. the living map dives toward the first destination). */
  onGenerateStart?: () => void;
}> = ({ onPromptChange, darkMode = false, onGenerateStart }) => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const addSceneFromComposition = useEditor((s) => s.addSceneFromComposition);
  const [prompts, setPrompts] = useState<string[]>([""]);
  const [styleId, setStyleId] = useState<string>(() => {
    try { return localStorage.getItem(STYLE_KEY) ?? "auto"; } catch { return "auto"; }
  });
  const [useAI, setUseAI] = useAiEngine();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [step, setStep] = useState<{ current: number; total: number }>({ current: 1, total: 1 });
  const [phase, setPhase] = useState<"director" | "composer" | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationWarning, setGenerationWarning] = useState<string | null>(null);
  const [aiNudge, setAiNudge] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [iv, setIv] = useState<IVState | null>(null);
  const [ivLoading, setIvLoading] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const apply = (idea?: string) => { if (idea && idea.trim()) { setPrompts([idea]); setIv(null); } };
    try { const seed = localStorage.getItem("mapanisy-seed-prompt"); if (seed) { apply(seed); localStorage.removeItem("mapanisy-seed-prompt"); } } catch { /* SSR */ }
    const h = (e: Event) => { try { localStorage.removeItem("mapanisy-seed-prompt"); } catch {} apply((e as CustomEvent).detail); };
    window.addEventListener("mapanisy-seed", h);
    return () => window.removeEventListener("mapanisy-seed", h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setStyleId(id);
    };
    window.addEventListener("mapanisy-style", h);
    return () => window.removeEventListener("mapanisy-style", h);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STYLE_KEY, styleId); } catch { /* SSR */ }
  }, [styleId]);

  useEffect(() => {
    if (!loading) {
      setPhase(null);
      if (phaseTimerRef.current) { clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null; }
    }
  }, [loading]);

  const multi = prompts.length > 1;
  const filled = prompts.map((p) => p.trim()).filter(Boolean);
  // Cycling placeholder shows whenever the box is empty — even while focused,
  // so the page can autofocus (cursor ready) and still inspire with examples.
  const showPlaceholder = (prompts[0]?.trim() ?? "") === "" && !multi && !iv;

  useEffect(() => {
    if (!showPlaceholder) return;
    const t = setInterval(() => setPlaceholderIdx((n) => (n + 1) % PLACEHOLDER_EXAMPLES.length), 3600);
    return () => clearInterval(t);
  }, [showPlaceholder]);

  useEffect(() => { onPromptChange?.(prompts[0] ?? ""); }, [prompts, onPromptChange]);

  const setPrompt = (i: number, v: string) => { setPrompts((ps) => ps.map((p, k) => (k === i ? v : p))); if (iv) setIv(null); };
  const addPrompt = () => setPrompts((ps) => [...ps, ""]);
  const removePrompt = (i: number) => setPrompts((ps) => (ps.length > 1 ? ps.filter((_, k) => k !== i) : ps));

  const styleArg = styleId !== "auto" ? styleId : undefined;
  const ai = () => loadAISettings() ?? undefined;

  const estimatedTokens = React.useMemo(() => {
    if (!useAI || filled.length === 0) return 0;
    const ideaTokens = Math.ceil((filled.join(" ").length) / 4);
    const dirTokens = 900 + ideaTokens + 1400;
    const compTokens = 1500 + 700 + 3200;
    return Math.round((dirTokens + compTokens) * filled.length / 100) * 100;
  }, [useAI, filled]);

  const genOne = async (idea: string, mode?: "story", interview?: { answers: Record<string, string>; text: string }, opts?: { style?: string; arc?: ArcContext }) => {
    const res = await fetch("/api/v2/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, mode, style: opts?.style ?? styleArg, ai: useAI ? ai() : undefined, useAI, interview: interview?.answers, interviewText: interview?.text, arc: opts?.arc }),
    });
    const d = await res.json();
    try { if (Array.isArray(d?.addons)) for (const a of d.addons as Addon[]) if (a?.name) addAddon(a); } catch { /* registry full / SSR */ }
    return d;
  };

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

  const ivLabel = (q: IVQ, val: string) => q.options.find((o) => o.value === val)?.label ?? val;
  const ivPayload = () => iv ? { answers: iv.answers, text: iv.questions.map((q) => `• ${q.question} → ${ivLabel(q, iv.answers[q.id])}`).join("\n") } : undefined;
  const setAnswer = (qid: string, value: string) => setIv((s) => (s ? { ...s, answers: { ...s.answers, [qid]: value } } : s));

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

  const generate = async () => {
    if (loading || ivLoading || filled.length === 0) return;
    if (filled.length === 1 && useAI && !iv) { await startInterview(filled[0]); return; }
    runGenerate();
  };

  const runGenerate = async () => {
    if (loading || filled.length === 0) return;
    onGenerateStart?.();
    setStep({ current: 1, total: filled.length });
    setLoading(true); setError(null); setProgress(null); setAiNudge(false); setGenerationWarning(null);
    if (filled.length === 1 && useAI) {
      setPhase("director");
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = setTimeout(() => setPhase("composer"), 4200);
    }
    try {
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
          prior.push(summarizeSequence(d, seq.idea, i));
        }
        if (!started) { setError(lastErr ?? "Couldn't build those scenes — try clearer ideas."); setLoading(false); return; }
        router.push("/studio2");
        return;
      }

      const d = await genOne(filled[0], undefined, ivPayload());
      if (!d?.project) { setError(d?.error ?? "Couldn't generate that — try a clearer idea."); setLoading(false); return; }
      if (useAI && d.aiConfigured === false) setAiNudge(true);
      if (d._meta?.warning) setGenerationWarning(d._meta.warning);
      if (d.story && d.plan) { setReview({ project: d.project, plan: d.plan, narration: d.narration ?? [], styleId, idea: filled[0], verification: d.verification, storyboard: d.storyboard, dirScript: d.dirScript }); setLoading(false); return; }
      if (d.plan || d.verification) {
        // Only pause at the single-scene review when AI research produced a
        // Director's Brief worth reading (thesis + facts). Smart Director goes
        // straight to the editor — no extra click needed.
        const hasResearch = !!(d.dirScript?.beats?.length || (d.verification?.thesis && d.verification?.facts?.length > 0));
        if (hasResearch) { setReview({ project: d.project, plan: d.plan, narration: d.narration ?? [], styleId, idea: filled[0], verification: d.verification, storyboard: d.storyboard, dirScript: d.dirScript, single: true }); setLoading(false); return; }
      }
      openInEditor(d.project, d.narration ?? []);
    } catch { setError("Network error — please try again."); setLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  const dm = darkMode; // shorthand

  const containerCls = dm
    ? "relative overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
    : "card-light rounded-2xl p-2 shadow-floaty";

  const textCls = dm
    ? "text-white/90 placeholder:text-white/22"
    : "text-graphite placeholder:text-graphite/30";

  const mutedCls = dm ? "text-white/30" : "text-graphite/40";
  const labelCls = dm ? "text-white/28" : "text-graphite/35";
  const borderCls = dm ? "border-white/[0.09]" : "border-black/5";

  const refColor = (id: string) => ({
    "war-room": "#ff5a44", "expedition-1900": "#c9a35c", "editorial": "#6E7BFF",
    "neo-atlas": "#4ab8ff", "noir-dossier": "#999", "terra-verde": "#2ec4b6",
  } as Record<string, string>)[id] ?? "#888";

  const refLabel = (id: string) => ({
    "war-room": "Al Jazeera · Reuters", "expedition-1900": "Nat Geo · PBS",
    "editorial": "NYT · Vox · BBC", "neo-atlas": "FiveThirtyEight · WIRED",
    "noir-dossier": "Investigative · Film", "terra-verde": "Travel · Nature",
  } as Record<string, string>)[id] ?? "";

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      <style>{`
        @keyframes phFade {
          0%   { opacity: 0; transform: translateY(7px); }
          14%  { opacity: 1; transform: translateY(0); }
          78%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(110,123,255,0.35); }
          50%       { box-shadow: 0 0 32px rgba(110,123,255,0.60); }
        }
      `}</style>
      <div
        className={`${containerCls} transition-all duration-300${isFocused && dm ? " ring-2 ring-iris/22 shadow-[0_0_48px_rgba(110,123,255,0.18)]" : ""}`}
      >
        {/* ── TEXTAREA ROWS ─────────────────────────────────────────────────── */}
        <div className={dm ? "space-y-1 px-4 pt-4" : "space-y-1.5"}>
          {prompts.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              {/* Icon: numbered circle in multi mode; sparkle in light single mode; hidden in dark single mode */}
              {(multi || !dm) && (
                <div className="ml-1.5 mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {multi
                    ? <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${dm ? "bg-iris/20 text-iris" : "bg-iris/15 text-iris"}`}>{i + 1}</span>
                    : <Sparkles size={18} className="text-iris" />}
                </div>
              )}
              <div className="relative flex-1">
                <textarea
                  value={p}
                  onChange={(e) => setPrompt(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  autoFocus={i === 0 && !multi}
                  rows={dm ? (multi ? 2 : 5) : (multi ? 2 : 3)}
                  placeholder={
                    multi
                      ? `Scene ${i + 1}… e.g. "${(["The Allies land at Normandy", "Push inland through France", "Liberate Paris"] as string[])[i] ?? "the next beat of your story"}"`
                      : "" /* single mode uses the cycling animated placeholder below */
                  }
                  className={`w-full resize-none bg-transparent py-2.5 text-[15px] leading-relaxed focus:outline-none ${dm ? "px-0" : "px-1"} ${textCls}`}
                />
                {/* Cycling animated placeholder — rotates through real example prompts */}
                {showPlaceholder && i === 0 && (
                  <div
                    key={`ph-${placeholderIdx}`}
                    className={`pointer-events-none absolute inset-x-0 top-2.5 text-[15px] italic leading-relaxed ${dm ? "text-white/20" : "text-graphite/40"} ${dm ? "" : "px-1"}`}
                    style={{ animation: "phFade 3.6s ease both forwards" }}
                    aria-hidden
                  >
                    &ldquo;{PLACEHOLDER_EXAMPLES[placeholderIdx]}&rdquo;
                  </div>
                )}
              </div>
              {multi && (
                <button
                  onClick={() => removePrompt(i)}
                  className={`mt-2.5 mr-1 shrink-0 transition-colors ${dm ? "text-white/22 hover:text-red-400" : "text-graphite/30 hover:text-red-400"}`}
                  title="Remove scene"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ── INPUT TYPE HINT ───────────────────────────────────────────────── */}
        {!multi && !iv && (() => {
          const type = detectInputType(prompts[0]);
          if (!type) return null;
          const cfg = {
            voiceover: { tag: "Narration", hint: "I'll follow your story arc exactly", color: dm ? "#A78BFA" : "#7C3AED" },
            brief:     { tag: "Story brief", hint: "I'll extract the story structure",    color: dm ? "#60A5FA" : "#2563EB" },
            idea:      { tag: "Topic idea",  hint: "I'll craft the strongest editorial angle", color: dm ? "#34D399" : "#059669" },
          }[type];
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: dm ? 16 : 34, paddingBottom: 4, paddingTop: 2, animation: "dvRise .35s ease" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: cfg.color, textTransform: "uppercase" as const, opacity: 0.85 }}>{cfg.tag}</span>
              <span style={{ fontSize: 11, color: dm ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)" }}>· {cfg.hint}</span>
            </div>
          );
        })()}

        {/* ── INTERVIEW ─────────────────────────────────────────────────────── */}
        {iv && (
          <div className={`mx-2 mb-2 mt-2 rounded-xl border p-3 ${dm ? "border-iris/18 bg-iris/[0.07]" : "border-iris/25 bg-iris/[0.04]"}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${dm ? "text-white/75" : "text-graphite"}`}>
                <Sparkles size={13} className="text-iris" /> Let&apos;s nail the vision
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${dm ? "bg-white/[0.08] text-white/45" : "bg-white/70 text-graphite/55"}`}>
                  {iv.provider === "ai" ? "✦ tailored to your idea" : "⚡ smart defaults"}
                </span>
              </div>
              <button onClick={() => setIv(null)} className={`transition-colors ${dm ? "text-white/28 hover:text-white" : "text-graphite/35 hover:text-graphite"}`} title="Back">
                <X size={14} />
              </button>
            </div>
            {iv.thesisHint && (
              <div className={`mb-2.5 text-[11px] italic leading-snug ${dm ? "text-white/38" : "text-graphite/50"}`}>
                &ldquo;{iv.thesisHint}&rdquo;
              </div>
            )}
            <div className="space-y-2.5">
              {iv.questions.map((q) => (
                <div key={q.id}>
                  <div className={`mb-1 text-[11px] font-medium ${dm ? "text-white/55" : "text-graphite/70"}`}>{q.question}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => {
                      const on = iv!.answers[q.id] === o.value;
                      return (
                        <button
                          key={o.value}
                          onClick={() => setAnswer(q.id, o.value)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            on
                              ? "border-iris bg-iris text-white shadow-glow-iris"
                              : dm
                                ? "border-white/14 bg-white/[0.06] text-white/55 hover:border-iris/45"
                                : "border-line bg-white text-graphite/65 hover:border-iris/50"
                          }`}
                        >
                          {on && <Check size={11} />}{o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={runGenerate} className={`mt-2.5 text-[11px] font-medium transition-colors ${dm ? "text-white/28 hover:text-iris" : "text-graphite/40 hover:text-iris"}`}>
              Skip — just use the recommended picks →
            </button>
          </div>
        )}

        {/* ── BOTTOM BAR ────────────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between gap-2 ${dm ? "px-4 pb-4 pt-2.5" : "mt-1 px-1.5"}`}>
          {dm ? (
            /* Dark mode: compact text link */
            <button
              onClick={addPrompt}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-white/24 transition-colors hover:text-white/65"
              title="Add another sequence"
            >
              <Plus size={12} /> {multi ? "Add scene" : "Multi-scene story"}
            </button>
          ) : (
            /* Light mode: dashed border button */
            <button
              onClick={addPrompt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite/55 transition-colors hover:border-iris hover:text-iris"
              title="Add another sequence — turns this into a multi-scene story"
            >
              <Plus size={13} /> {multi ? "Add sequence" : "Make it a story (add sequences)"}
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {/* Engine toggle — compact in dark mode, tucked into bar */}
            {dm && (
              <div className="flex items-center rounded-lg border border-white/[0.09] bg-white/[0.05] p-0.5">
                <button
                  onClick={() => setUseAI(true)}
                  title="AI-directed — researches & art-directs"
                  className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] font-semibold transition-colors ${useAI ? "bg-brand text-white shadow-glow-iris" : "text-white/32 hover:text-white/60"}`}
                >
                  <Wand2 size={10} /> AI
                </button>
                <button
                  onClick={() => setUseAI(false)}
                  title="Smart director — instant, no API key"
                  className={`inline-flex items-center gap-0.5 rounded-[6px] px-2 py-1 text-[10px] font-semibold transition-colors ${!useAI ? "bg-emerald-500 text-white" : "text-white/32 hover:text-white/60"}`}
                >
                  ⚡ Smart
                </button>
              </div>
            )}

            {/* Generate button */}
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={generate}
                disabled={loading || ivLoading || filled.length === 0}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40 disabled:hover:translate-y-0 ${
                  dm
                    ? "px-5 py-2.5 hover:-translate-y-0.5"
                    : "bg-brand px-5 py-2 shadow-glow-iris hover:-translate-y-0.5"
                }`}
                style={dm ? {
                  background: "linear-gradient(135deg, #6E7BFF 0%, #B57BFF 100%)",
                  animation: filled.length > 0 && !loading ? "btnPulse 2.2s ease-in-out infinite" : undefined,
                } : undefined}
              >
                {loading || ivLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : iv ? <ArrowRight size={14} />
                  : multi ? <Film size={14} />
                  : <Sparkles size={14} />}
                {loading
                  ? (progress ?? "Creating…")
                  : ivLoading ? "Reading…"
                  : iv ? "Build animation"
                  : multi ? `Build ${filled.length} scenes`
                  : "Generate"}
              </button>
              {useAI && estimatedTokens > 0 && !loading && !iv && (
                <span className={`text-[9.5px] tabular-nums ${dm ? "text-white/20" : "text-graphite/28"}`} title="Estimated AI token usage">
                  ~{estimatedTokens >= 1000 ? `${Math.round(estimatedTokens / 1000)}k` : estimatedTokens} tokens
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── STYLE PICKER ──────────────────────────────────────────────────── */}
        <div className={`border-t ${borderCls} ${dm ? "px-4 pb-4 pt-3" : "mt-1 px-2 pb-2 pt-2.5"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${labelCls}`}>Visual style</span>
            <span className={`truncate pl-2 text-[10px] ${mutedCls}`}>
              {styleId === "auto" ? "AI director picks the look" : SIGNATURE_STYLES.find((s) => s.id === styleId)?.tagline}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Director's choice */}
            <button
              onClick={() => setStyleId("auto")}
              title="AI director picks the best look for your story"
              className={`group w-[102px] shrink-0 text-left transition-all hover:-translate-y-0.5 ${styleId === "auto" ? "" : "opacity-75 hover:opacity-100"}`}
            >
              <div
                className={`relative flex h-[58px] items-center justify-center overflow-hidden rounded-xl border ${styleId === "auto" ? "border-iris ring-2 ring-iris/35" : dm ? "border-white/[0.11] hover:border-iris/30" : "border-black/10 hover:border-iris/30"}`}
                style={{ background: "conic-gradient(from 210deg at 60% 40%,#0a0303,#161009,#02060c,#05060e,#03100c,#0a0303)" }}
              >
                <Wand2 size={16} className="text-white/85 drop-shadow" />
                {styleId === "auto" && (
                  <div className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-iris">
                    <Check size={8} color="white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className={`mt-1 truncate text-[10.5px] font-semibold ${styleId === "auto" ? "text-iris" : dm ? "text-white/48" : "text-graphite/55"}`}>
                Director&apos;s choice
              </div>
              <div className={`truncate text-[9.5px] ${dm ? "text-white/28" : "text-graphite/35"}`}>AI picks the look</div>
            </button>

            {/* Signature style cards */}
            {SIGNATURE_STYLES.map((s) => {
              const active = styleId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  title={`${s.name} — ${s.tagline}`}
                  className={`group w-[102px] shrink-0 text-left transition-all hover:-translate-y-0.5 ${active ? "" : "opacity-75 hover:opacity-100"}`}
                >
                  <div
                    className={`relative h-[58px] overflow-hidden rounded-xl border ${active ? "border-iris ring-2 ring-iris/35" : dm ? "border-white/[0.11] hover:border-iris/30" : "border-black/10 hover:border-iris/30"}`}
                    style={{ background: `linear-gradient(140deg,${s.swatches[0]} 0%,${s.swatches[0]} 52%,${s.swatches[1]} 52%,${s.swatches[1]} 78%,${s.swatches[2]} 78%)` }}
                  >
                    <div className="absolute inset-0" style={cardTexture(s.id)} />
                    <span
                      className="absolute bottom-1 left-1.5 text-[17px] font-bold leading-none text-white drop-shadow"
                      style={{ fontFamily: fontStack(s.fontDisplay), textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}
                    >
                      Aa
                    </span>
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: s.swatches[2], boxShadow: `0 0 8px ${s.swatches[2]}` }} />
                    {active && (
                      <div className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-iris">
                        <Check size={8} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className={`mt-1 truncate text-[10.5px] font-semibold ${active ? "text-iris" : dm ? "text-white/48" : "text-graphite/65"}`}>{s.name}</div>
                  <div className="truncate text-[9.5px]" style={{ color: refColor(s.id), opacity: 0.8 }}>{refLabel(s.id)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ENGINE TOGGLE (light mode only — dark mode has it in the bar) ─── */}
        {!dm && (
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-black/5 px-2 pb-0.5 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/35">Engine</span>
            <div className="flex items-center rounded-lg border border-line bg-paper-100/60 p-0.5">
              <button
                onClick={() => setUseAI(true)}
                title="Your AI model researches, fact-checks and art-directs the whole animation"
                className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${useAI ? "bg-brand text-white shadow-glow-iris" : "text-graphite/45 hover:text-graphite"}`}
              >
                <Wand2 size={11} /> AI-directed
              </button>
              <button
                onClick={() => setUseAI(false)}
                title="Built-in director logic — instant, no API key, fully private"
                className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${!useAI ? "bg-emerald-500 text-white shadow-sm" : "text-graphite/45 hover:text-graphite"}`}
              >
                ⚡ Smart (no AI)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── EXAMPLE CHIPS ───────────────────────────────────────────────────── */}
      {!multi && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`text-[11px] ${dm ? "text-white/25" : "text-graphite/30"}`}>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(0, ex)}
              className={`max-w-full truncate rounded-full border px-3 py-1 text-[11px] transition-colors ${
                dm
                  ? "border-white/[0.09] bg-white/[0.05] text-white/40 hover:border-iris/40 hover:text-white/75"
                  : "border-black/10 bg-black/[0.03] text-graphite/55 hover:border-iris/40 hover:text-graphite"
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {multi && (
        <div className={`mt-2 px-1 text-[11px] leading-relaxed ${dm ? "text-white/28" : "text-graphite/40"}`}>
          Each box becomes a scene on the timeline — one cohesive style, transitions between them, fully editable after.
        </div>
      )}

      {/* ── ERROR & WARNINGS ────────────────────────────────────────────────── */}
      {error && (
        <div className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${dm ? "border-red-500/18 bg-red-900/15 text-red-400/80" : "border-red-200/60 bg-red-50/80 text-red-600/80"}`}>
          <span className="mt-px shrink-0">✕</span>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => { setError(null); runGenerate(); }}
            className={`ml-1 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${dm ? "border border-red-500/25 text-red-400/70 hover:text-red-300" : "border border-red-300/50 text-red-500/70 hover:text-red-600"}`}
            title="Try again with the same prompt"
          >
            Retry
          </button>
        </div>
      )}
      {generationWarning && !loading && (
        <div className={`mt-2 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-[11px] ${
          dm
            ? "border-amber-400/18 bg-amber-900/18 text-amber-300/75"
            : "border-amber-200/60 bg-amber-50/80 text-amber-700/80"
        }`}>
          <span className="mt-px shrink-0">⚠</span>
          <span>{generationWarning}</span>
          <button onClick={() => setGenerationWarning(null)} className="ml-auto shrink-0 opacity-50 hover:opacity-100"><X size={12} /></button>
        </div>
      )}
      {aiNudge && (
        <div className={`mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] ${
          dm
            ? "border-amber-400/18 bg-amber-900/18 text-amber-300/75"
            : "border-amber-200/60 bg-amber-50/80 text-amber-700/80"
        }`}>
          <span>⚡ Generated with Smart Director.</span>
          <button onClick={() => setSettingsOpen(true)} className="font-semibold underline underline-offset-2 hover:text-iris">Add an AI key</button>
          <span>for AI research &amp; fact-checking.</span>
          <button onClick={() => setAiNudge(false)} className="ml-auto shrink-0 opacity-50 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      {/* ── FOOTER LINKS ────────────────────────────────────────────────────── */}
      <div className={`mt-3 flex items-center justify-between gap-1.5 text-[11px] ${dm ? "text-white/22" : "text-graphite/40"}`}>
        <div className="flex items-center gap-1.5">
          <span>or</span>
          <button
            onClick={() => router.push("/studio2")}
            className={`inline-flex items-center gap-1 transition-colors ${dm ? "text-white/38 hover:text-iris" : "text-graphite/55 hover:text-iris"}`}
          >
            start from a blank map <ArrowRight size={11} />
          </button>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className={`inline-flex items-center gap-1 transition-colors ${dm ? "text-white/28 hover:text-iris" : "text-graphite/45 hover:text-iris"}`}
          title="Connect your AI provider & API key"
        >
          <KeyRound size={11} /> AI keys &amp; providers
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {review && (
        <StoryboardReview
          data={review}
          onClose={() => setReview(null)}
          onOpen={(project, narration) => { setReview(null); openInEditor(project, narration); }}
        />
      )}
      <GeneratingOverlay
        open={loading}
        idea={filled[Math.min(step.current - 1, Math.max(0, filled.length - 1))] ?? filled[0]}
        styleName={styleId === "auto" ? "Director's choice" : SIGNATURE_STYLES.find((s) => s.id === styleId)?.name}
        current={step.current}
        total={step.total}
        phase={phase ?? undefined}
        warning={generationWarning}
        estimatedTokens={estimatedTokens}
      />
    </div>
  );
};
