"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Settings2, Wand2, Plus, Check, Zap } from "lucide-react";
import { useEditor } from "../store/editor";
import { SettingsModal, loadAISettings } from "./SettingsModal";
import { applyEditOps, buildEditContext } from "./applyEdits";
import { useAiEngine } from "@/lib/aiEngine";

const NEW_EXAMPLES = ["The fall of the Berlin Wall, 1989", "Fly into Tokyo at night", "Highlight France", "Roman Empire at its peak"];
const EDIT_EXAMPLES = ["make the route red", "add crossing swords on the border", "make it look like an old map", "zoom in more"];

type Mode = "edit" | "new";

/**
 * The editor's AI bar — two minds:
 *  · Edit (default once a scene has content) → /api/v2/edit returns the FEWEST
 *    ops and we patch ONLY what was asked. The scene's style, layers and framing
 *    are preserved — fixing one thing never rebuilds the rest.
 *  · New → regenerate the whole scene from a fresh idea.
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
  // Shared engine choice (AI-directed vs Smart/no-AI) — same preference as home.
  const [useAI, setUseAI] = useAiEngine();

  // Default to "edit" the moment there's something to edit; "new" on a blank map.
  const m: Mode = mode ?? (layerCount > 0 ? "edit" : "new");
  const examples = m === "edit" ? EDIT_EXAMPLES : NEW_EXAMPLES;

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

  return (
    <div className="rounded-2xl border border-line/70 bg-white/90 px-4 py-2 shadow-floaty backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {/* Mode switch */}
        <div className="flex shrink-0 items-center rounded-lg border border-line bg-paper-100/60 p-0.5">
          <button
            onClick={() => setMode("edit")}
            title="Change just what you ask — keeps the scene's style and everything else intact"
            className={`inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors ${m === "edit" ? "bg-brand text-white shadow-glow-iris" : "text-graphite/50 hover:text-graphite"}`}
          >
            <Wand2 size={12} /> Edit
          </button>
          <button
            onClick={() => setMode("new")}
            title="Generate a brand-new scene from scratch"
            className={`inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors ${m === "new" ? "bg-brand text-white shadow-glow-iris" : "text-graphite/50 hover:text-graphite"}`}
          >
            <Plus size={12} /> New
          </button>
        </div>
        {m === "edit" ? <Wand2 size={14} className="shrink-0 text-iris" /> : <Sparkles size={14} className="shrink-0 text-iris" />}
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder={m === "edit"
            ? "Tell me what to change…  e.g. “make the route red”, “add crossing swords on the border”, “make it look old”"
            : "Describe an idea → Mapanisy builds the animation…  e.g. “Highlight France, conflict map”"}
          className="flex-1 bg-transparent text-sm text-graphite placeholder:text-graphite/30 focus:outline-none"
        />
        <div className="hidden lg:flex items-center gap-1.5">
          {examples.map((ex) => (
            <button key={ex} onClick={() => setIdea(ex)} className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-graphite/40 hover:text-graphite hover:border-iris/40 transition-colors">{ex}</button>
          ))}
        </div>
        {/* Engine choice — AI-directed vs Smart (no AI). When AI is on it is used
            strictly: no fall-back to the keyword parser. Shared with the home box. */}
        <div className="flex shrink-0 items-center rounded-lg border border-line bg-paper-100/60 p-0.5" title="Choose the engine. AI-directed always uses your AI model — never the built-in parser.">
          <button
            onClick={() => setUseAI(true)}
            title="AI-directed — your model interprets everything (never the keyword parser)"
            className={`inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors ${useAI ? "bg-brand text-white shadow-glow-iris" : "text-graphite/50 hover:text-graphite"}`}
          >
            <Wand2 size={11} /> AI
          </button>
          <button
            onClick={() => setUseAI(false)}
            title="Smart (no AI) — instant built-in logic, no API key, fully private"
            className={`inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors ${!useAI ? "bg-emerald-500 text-white shadow-sm" : "text-graphite/50 hover:text-graphite"}`}
          >
            <Zap size={11} /> Smart
          </button>
        </div>
        <button onClick={go} disabled={loading || !idea.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow-iris disabled:opacity-40">
          {loading ? <Loader2 size={13} className="animate-spin" /> : m === "edit" ? <Wand2 size={13} /> : <Sparkles size={13} />}
          {loading ? (m === "edit" ? "Editing…" : "Creating…") : m === "edit" ? "Apply" : "Generate"}
        </button>
        <button onClick={() => setSettingsOpen(true)} title="AI providers — bring your own key" className="shrink-0 rounded-lg p-1.5 text-graphite/40 hover:text-iris hover:bg-paper-100">
          <Settings2 size={14} />
        </button>
      </div>
      {err && <div className="mt-1 text-[11px] text-red-400/90">{err}</div>}
      {edited && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-graphite/55">
          {edited.labels.length ? (
            <>
              <Check size={11} className="text-emerald-500" />
              {/* Transparency: was this the instant built-in parser, or the AI? */}
              {edited.provider === "ai"
                ? <span className="inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/8 px-1.5 py-px text-[9px] font-semibold text-iris" title="Interpreted by your AI model"><Wand2 size={9} /> AI</span>
                : <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-1.5 py-px text-[9px] font-semibold text-emerald-600" title="Matched instantly by the built-in keyword parser — no AI, no key">⚡ Instant</span>}
              Updated {edited.labels.length} thing{edited.labels.length > 1 ? "s" : ""} <span className="text-graphite/40">· {edited.labels.join(" · ")} · everything else untouched</span>
            </>
          ) : (
            <span className="text-orange-600">{edited.note}</span>
          )}
        </div>
      )}
      {built && (
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-graphite/55">
            <Sparkles size={11} className="text-iris" />
            Built {built.count} layers{built.kinds ? ` · ${built.kinds}` : ""}
            <span className="text-graphite/40">· {built.ai ? `AI-directed${built.provider && built.provider !== "ai" ? ` (${built.provider})` : ""}` : built.aiConfigured ? "fell back to quick draft" : "quick draft — connect an AI provider (gear)"}</span>
          </div>
          {built.aiError && (
            <button onClick={() => setSettingsOpen(true)} className="block text-left text-[11px] text-orange-600 hover:underline" title="Open AI settings">
              ⚠ Your AI provider didn’t respond: {built.aiError.slice(0, 120)} — check your key/model in settings.
            </button>
          )}
        </div>
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
