"use client";

import React, { useEffect, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";
import {
  installHistory,
  undo,
  redo,
  getHistoryCounts,
  subscribeHistory,
} from "@/store/history";

/**
 * Floating undo/redo pill — top-right corner above the studio panes.
 * Also installs the history subscription on mount + global hotkeys
 *   Cmd-Z / Ctrl-Z       → undo
 *   Cmd-Shift-Z / Ctrl-Y → redo
 */
export const HistoryControls: React.FC = () => {
  const [counts, setCounts] = useState(getHistoryCounts());

  useEffect(() => {
    installHistory();
    const unsubscribe = subscribeHistory(() => setCounts(getHistoryCounts()));

    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      // Skip when typing into an input/textarea/contenteditable
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (isMod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((isMod && e.key.toLowerCase() === "z" && e.shiftKey) || (isMod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const canUndo = counts.past > 0;
  const canRedo = counts.future > 0;

  return (
    <div className="fixed top-3 right-3 z-40 flex gap-1 rounded-md bg-ink-900/95 border border-ink-700 backdrop-blur px-1.5 py-1 shadow-lg">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/70 hover:bg-ink-700 hover:text-amber disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/70"
      >
        <Undo2 size={12} />
        <span className="font-mono">{counts.past}</span>
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/70 hover:bg-ink-700 hover:text-amber disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/70"
      >
        <Redo2 size={12} />
        <span className="font-mono">{counts.future}</span>
      </button>
    </div>
  );
};
