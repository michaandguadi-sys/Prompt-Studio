"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, Settings2, Wand2, Plus, Check, Zap, ArrowUp } from "lucide-react";
import { useEditor } from "../store/editor";
import { SettingsModal, loadAISettings } from "./SettingsModal";
import { applyEditOps, buildEditContext } from "./applyEdits";
import { useAiEngine } from "@/lib/aiEngine";

const NEW_EXAMPLES = ["The fall of the Berlin Wall, 1989", "Fly into Tokyo at night", "Highlight France in a conflict map", "The Roman Empire at its peak", "My morning run through the old town"];
const EDIT_EXAMPLES = ["make the route red", "add crossing swords on the border", "make it look like an old map", "zoom in closer", "warmer colour grade", "slow the camera down"];

type Mode = "edit" | "new";

/**
 * The editor's AI bar — two minds:
 *  · Edit (default once a scene has content) → /api/v2/edit returns the FEWEST
 *    ops and we patch ONLY what was asked. Style, layers and framing preserved.
 *  · New → regenerate the whole scene from a fresh idea.
 *
 * No suggestion chips — instead the field shows a soft, rotating example as
 * ghost text so the bar stays clean and dynamic.
 */
export const AiBar: React.FC = () => {
  const load = useEditor((s) => s.load);
  const layerCount = useEditor((s) => s.project.composition.layers.filter((l) => l.type !== "camera").length);
  const [mode, setMode] = useState<Mode | null>(null);
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [built, setBuilt] = useState<{ count: number; kinds: string; ai: boolean; provider?: string; aiError?: string; aiConfigured?: boolean } | null>(null);
  const [edited, setEdited] = useState<{ labels: string[]; note?: string; provider?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  // Shared engine choice (AI-directed vs Smart/no-AI) — same preference as home.
  const [useAI, setUseAI] = useAiEngine();

  // Default to "edit" the moment there's something to edit; "new" on a blank map.
  const m: Mode = mode ?? (layerCount > 0 ? "edit" : "new");
  const hints = m === "edit" ? EDIT_EXAMPLES : NEW_EXAMPLES;

  // Ghost-text rotation — pauses while you type, resets when the mode changes.
  useEffect(() => { setHintIdx(0); }, [m]);
  useEffect(() => {
    if (idea) return;
    const t = setInterval(() => setHintIdx((i) => (i + 1) % hints.length), 3400);
    return () => clearInterval(t);
  }, [idea, hints.length]);

  const runEdit = async (text: string) => {
    const comp = useEditor.getState().project.composition;
    const r = await fetch("/api/v2/edit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: text, context: buildEditContext(comp), ai: loadAISettings() ?? undefined, useAI }),
    });
    const d = await r.json();
    if (!r.ok) { setErr(d?.error ?? "Couldn't apply that edit."); return; }
    const ops = Array.isArray(d?.ops) ? d.ops : [];
    if (!ops.length) { setEdited({ labels: [], note: d?.note ?? "Nothing to change — try rephrasing.", provider: d?.provider }); return; }
    const { applied, labels } = applyEditOps(ops);
    if (!applied) { setEdited({ labels: [], note: "Couldn't apply that — try rephrasing.", provider: d?.provider }); return; }
    setEdited({ labels, provider: d?.provider });
    setIdea("");
    setTimeout(() => setEdited(null), 8000);
  };

  const runNew = async (text: string) => {
    const r = await fetch("/api/v2/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: text, ai: loadAISettings() ?? undefined, useAI }) });
    const d = await r.json();
    if (!r.ok || !d?.project) { setErr(d?.error ?? "Couldn't generate that."); return; }
    load(d.project);
    const ls = (d.project.composition?.layers ?? []) as { type: string }[];
    const kinds = Array.from(new Set(ls.map((l) => l.type).filter((t) => t !== "camera")));
    setBuilt({ count: ls.length, kinds: kinds.join(" · "), ai: !!d.usedLLM, provider: d.provider, aiError: d.aiError, aiConfigured: d.aiConfigured });
    setIdea("");
    setTimeout(() => setBuilt(null), 9000);
  };

  const go = async () => {
    const text = idea.trim();
    if (!text || loading) return;
    setLoading(true); setErr(null); setBuilt(null); setEdited(null);
    try { if (m === "edit") await runEdit(text); else await runNew(text); }
    catch { setErr("Network error."); }
    setLoading(false);
  };

  const seg = (on: boolean, tone: "iris" | "emerald" = "iris") =>
    `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 ${
      on
        ? tone === "iris"
          ? "bg-gradient-to-b from-iris to-iris-dim text-white shadow-[0_2px_8px_-2px_rgba(110,123,255,0.6)]"
          : "bg-emerald-500 text-white shadow-[0_2px_8px_-2px_rgba(16,185,129,0.5)]"
        : "text-graphite-muted hover:text-graphite"
    }`;

  return (
    <div className="rounded-2xl border border-line/60 bg-paper/80 px-2 py-1.5 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-shadow duration-300 focus-within:shadow-[0_0_0_3px_rgba(110,123,255,0.16),0_10px_30px_-12px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-2">
        {/* Mode switch — Edit ⇄ New */}
        <div className="flex shrink-0 items-center rounded-full bg-graphite/[0.06] p-0.5">
          <button onClick={() => setMode("edit")} title="Change just what you ask — keeps the scene's style and everything else intact" className={seg(m === "edit")}><Wand2 size={12} /> Edit</button>
          <button onClick={() => setMode("new")} title="Generate a brand-new scene from scratch" className={seg(m === "new")}><Plus size={12} /> New</button>
        </div>

        {/* Input with rotating ghost-text */}
        <div className="relative min-w-0 flex-1">
          {!idea && (
            <div className="pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden whitespace-nowrap text-sm text-graphite-muted/45">
              <span className="shrink-0">{m === "edit" ? "Tell me what to change — " : "Describe your idea — "}</span>
              <span key={`${m}-${hintIdx}`} className="animate-fade-in truncate text-graphite-muted/35">“{hints[hintIdx]}”</span>
            </div>
          )}
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            className="relative z-10 w-full bg-transparent px-0 py-1 text-sm text-graphite caret-iris focus:outline-none"
          />
        </div>

        {/* Engine choice — AI-directed vs Smart (no AI). Strict: AI never falls
            back to the keyword parser. Shared with the home box. */}
        <div className="flex shrink-0 items-center rounded-full bg-graphite/[0.06] p-0.5" title="Choose the engine. AI-directed always uses your AI model — never the built-in parser.">
          <button onClick={() => setUseAI(true)} title="AI-directed — your model interprets everything (never the keyword parser)" className={seg(useAI)}><Wand2 size={11} /> AI</button>
          <button onClick={() => setUseAI(false)} title="Smart (no AI) — instant built-in logic, no API key, fully private" className={seg(!useAI, "emerald")}><Zap size={11} /> Smart</button>
        </div>

        {/* Submit */}
        <button
          onClick={go} disabled={loading || !idea.trim()}
          title={m === "edit" ? "Apply edit (Enter)" : "Generate (Enter)"}
          className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-b from-iris to-iris-dim px-3.5 text-xs font-semibold text-white shadow-[0_4px_14px_-4px_rgba(110,123,255,0.7)] transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : m === "edit" ? <Wand2 size={13} /> : <ArrowUp size={13} className="transition-transform group-hover:-translate-y-0.5" />}
          {loading ? (m === "edit" ? "Editing…" : "Creating…") : m === "edit" ? "Apply" : "Generate"}
        </button>
        <button onClick={() => setSettingsOpen(true)} title="AI providers — bring your own key" className="shrink-0 rounded-full p-1.5 text-graphite-muted/60 transition-colors hover:bg-graphite/[0.06] hover:text-iris">
          <Settings2 size={14} />
        </button>
      </div>

      {err && <div className="mt-1 px-1 text-[11px] text-red-400/90 animate-fade-in">{err}</div>}
      {edited && (
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-graphite-muted animate-fade-in">
          {edited.labels.length ? (
            <>
              <Check size={11} className="text-emerald-500" />
              {edited.provider === "ai"
                ? <span className="inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-1.5 py-px text-[9px] font-semibold text-iris" title="Interpreted by your AI model"><Wand2 size={9} /> AI</span>
                : <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold text-emerald-600" title="Matched instantly by the built-in keyword parser — no AI, no key">⚡ Instant</span>}
              Updated {edited.labels.length} thing{edited.labels.length > 1 ? "s" : ""} <span className="text-graphite-muted/70">· {edited.labels.join(" · ")} · everything else untouched</span>
            </>
          ) : (
            <span className="text-orange-500">{edited.note}</span>
          )}
        </div>
      )}
      {built && (
        <div className="mt-1 space-y-0.5 px-1 animate-fade-in">
          <div className="flex items-center gap-1.5 text-[11px] text-graphite-muted">
            <Sparkles size={11} className="text-iris" />
            Built {built.count} layers{built.kinds ? ` · ${built.kinds}` : ""}
            <span className="text-graphite-muted/70">· {built.ai ? `AI-directed${built.provider && built.provider !== "ai" ? ` (${built.provider})` : ""}` : built.aiConfigured ? "fell back to quick draft" : "quick draft — connect an AI provider (gear)"}</span>
          </div>
          {built.aiError && (
            <button onClick={() => setSettingsOpen(true)} className="block text-left text-[11px] text-orange-500 hover:underline" title="Open AI settings">
              ⚠ Your AI provider didn’t respond: {built.aiError.slice(0, 120)} — check your key/model in settings.
            </button>
          )}
        </div>
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
