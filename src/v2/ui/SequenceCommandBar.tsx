"use client";

import React, { useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { useEditor } from "../store/editor";
import { loadAISettings } from "./SettingsModal";

/**
 * Prompt-driven storyboard editing. Type plain English ("make scene 2 longer",
 * "add crossfades between everything", "swap scenes 1 and 2", "add a scene about
 * the retreat from Moscow") → /api/v2/sequence returns minimal ops → applied to
 * the store. Common commands work with no API key (server heuristic).
 */
export const SequenceCommandBar: React.FC = () => {
  const scenes = useEditor((s) => s.project.scenes);
  const setSceneDuration = useEditor((s) => s.setSceneDuration);
  const setSceneTransition = useEditor((s) => s.setSceneTransition);
  const removeScene = useEditor((s) => s.removeScene);
  const renameScene = useEditor((s) => s.renameScene);
  const reorder = useEditor((s) => s.reorder);
  const addSceneFromComposition = useEditor((s) => s.addSceneFromComposition);
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const focusOf = (sc: any): string => {
    const ls = sc.composition?.layers ?? [];
    const pick = (t: string) => (ls.find((l: any) => l.type === t) as any);
    return (pick("title")?.text || pick("label")?.text || pick("highlight")?.name || pick("marker")?.label || sc.name || "map");
  };

  const run = async () => {
    const command = cmd.trim();
    if (!command || busy) return;
    setBusy(true); setNote(null);
    const ids = scenes.map((s) => s.id);
    const summary = scenes.map((s) => ({ name: s.name, focus: focusOf(s), durationSec: s.composition?.durationSec, transition: s.transition }));
    try {
      const r = await fetch("/api/v2/sequence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, scenes: summary, ai: loadAISettings() ?? undefined }),
      });
      const d = await r.json();
      const ops: any[] = Array.isArray(d?.ops) ? d.ops : [];
      if (!ops.length) { setNote(d?.note ?? d?.error ?? "Couldn't apply that — try rephrasing."); setBusy(false); return; }
      let applied = 0;
      for (const op of ops) {
        try {
          if (op.op === "duration" && ids[op.scene - 1]) { setSceneDuration(ids[op.scene - 1], Number(op.durationSec)); applied++; }
          else if (op.op === "transition") {
            const v = ["cut", "fade", "crossfade", "slide"].includes(op.value) ? op.value : "fade";
            if (op.scene === "all") { scenes.slice(1).forEach((s) => setSceneTransition(s.id, v)); applied++; }
            else if (ids[op.scene - 1]) { setSceneTransition(ids[op.scene - 1], v); applied++; }
          }
          else if (op.op === "reorder" && Array.isArray(op.order)) {
            const nids = op.order.map((nn: number) => ids[nn - 1]).filter(Boolean);
            if (nids.length) { reorder(nids); applied++; }
          }
          else if (op.op === "remove" && ids[op.scene - 1]) { removeScene(ids[op.scene - 1]); applied++; }
          else if (op.op === "rename" && ids[op.scene - 1] && op.name) { renameScene(ids[op.scene - 1], String(op.name).slice(0, 40)); applied++; }
          else if (op.op === "add" && op.idea) {
            const gr = await fetch("/api/v2/generate", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idea: String(op.idea), ai: loadAISettings() ?? undefined }),
            });
            const gd = await gr.json();
            if (gd?.project?.composition) {
              const afterId = op.after >= 1 ? ids[op.after - 1] : undefined;
              addSceneFromComposition(gd.project.composition, String(op.idea).slice(0, 24), afterId);
              applied++;
            }
          }
        } catch { /* skip a bad op */ }
      }
      setNote(applied ? `✓ Done — ${applied} change${applied > 1 ? "s" : ""}.` : "Nothing to change.");
      if (applied) setCmd("");
      setTimeout(() => setNote(null), 4000);
    } catch { setNote("Network error."); }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2 border-t border-black/5 px-3 py-1.5">
      <Wand2 size={13} className="shrink-0 text-iris" />
      <input
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
        placeholder="Edit the sequence… e.g. “add crossfades between everything”, “make scene 2 longer”, “add a scene about Stalingrad”"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-graphite placeholder:text-graphite/30 focus:outline-none"
      />
      {note && <span className="shrink-0 text-[11px] text-graphite/45">{note}</span>}
      <button
        onClick={run}
        disabled={busy || !cmd.trim()}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Apply
      </button>
    </div>
  );
};
