"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard } from "lucide-react";

/**
 * Keyboard shortcuts sheet. Opens with `?` or the toolbar's keyboard button
 * (which dispatches `mapanisy:open-shortcuts`). Bindings follow DaVinci Resolve
 * conventions where they map cleanly, so editors feel at home from shot one.
 */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Editing", items: [
    [`${MOD} Z`, "Undo"],
    [`${MOD} ⇧ Z`, "Redo"],
    [`${MOD} D`, "Duplicate element"],
    ["Del / ⌫", "Delete element"],
    ["Esc", "Deselect"],
  ] },
  { title: "Create", items: [
    ["⇧ Space", "Add element at cursor"],
    [`${MOD} K`, "Command palette"],
  ] },
  { title: "Playback & selection", items: [
    ["Space", "Play / pause"],
    ["Click", "Select an element to edit"],
    ["← ↑ → ↓", "Nudge selected element"],
    ["?", "This shortcuts sheet"],
  ] },
];

export const ShortcutsModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
      if (!typing && e.key === "?") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mapanisy:open-shortcuts", onEvt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mapanisy:open-shortcuts", onEvt); };
  }, []);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[300] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-white shadow-[0_40px_110px_-34px_rgba(20,28,55,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-iris/15 text-iris"><Keyboard size={14} /></span>
            <h2 className="text-sm font-semibold text-graphite">Keyboard shortcuts</h2>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-graphite/45 transition-colors hover:bg-graphite/[0.05] hover:text-graphite"><X size={16} /></button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/40">{g.title}</div>
              <div className="space-y-1">
                {g.items.map(([k, label]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-paper-50">
                    <span className="text-[13px] text-graphite/75">{label}</span>
                    <kbd className="rounded-md border border-line bg-paper-50 px-2 py-0.5 text-[11px] font-medium text-graphite/60">{k}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-graphite/40">Follows DaVinci Resolve conventions where they apply.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
