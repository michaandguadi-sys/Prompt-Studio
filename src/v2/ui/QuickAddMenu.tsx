"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../store/editor";
import { recordTaste } from "@/lib/taste";
import { LAYER_REGISTRY } from "../layers/registry";
import { ADD_CATEGORIES, iconFor } from "./LayersPanel";
import type { LayerType } from "../doc/schema";

/**
 * Quick-add — press ⇧Space and a small element picker pops up right at your
 * cursor (DaVinci-style "add at the playhead"). Type to filter, Enter to add the
 * top match, click to add any. Adding an element is the single most common act
 * in the editor, so it deserves a zero-travel, keyboard-first path.
 */
const ADDABLE: LayerType[] = ADD_CATEGORIES.flatMap((c) => c.types);

export const QuickAddMenu: React.FC = () => {
  const addLayer = useEditor((s) => s.addLayer);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
      if (e.code === "Space" && e.shiftKey && !typing) {
        e.preventDefault();
        const mx = mouse.current.x || window.innerWidth / 2;
        const my = mouse.current.y || window.innerHeight / 2;
        // Clamp so the menu never spills off-screen.
        setPos({ x: Math.min(mx, window.innerWidth - 258), y: Math.min(my, Math.max(12, window.innerHeight - 360)) });
        setQ("");
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("keydown", key); };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ADDABLE.filter((t) => !s || (LAYER_REGISTRY[t].label + " " + LAYER_REGISTRY[t].hint).toLowerCase().includes(s));
  }, [q]);

  const add = (t: LayerType) => { recordTaste("layer", t); addLayer(t); setOpen(false); };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} onContextMenu={(e) => { e.preventDefault(); setOpen(false); }}>
      <div
        className="anim-fade-in absolute w-[240px] overflow-hidden rounded-xl border border-line bg-white shadow-[0_24px_70px_-20px_rgba(20,28,55,0.5)]"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-2.5 py-2">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) add(filtered[0]); else if (e.key === "Escape") setOpen(false); }}
            placeholder="Add element…"
            className="w-full bg-transparent text-[13px] text-graphite placeholder:text-graphite/40 focus:outline-none"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-graphite/40">No element matches “{q}”.</div>
          ) : filtered.map((t) => (
            <button key={t} onClick={() => add(t)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-iris/10">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite/[0.07] text-iris">{iconFor(t)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-graphite">{LAYER_REGISTRY[t].label}</span>
                <span className="block truncate text-[10px] text-graphite/45">{LAYER_REGISTRY[t].hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};
