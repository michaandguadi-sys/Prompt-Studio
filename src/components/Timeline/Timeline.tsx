"use client";

import React, { useState } from "react";
import { useStudio, type SceneKind } from "@/store/studio";
import { Map, BarChart3, Type, Captions, Quote, Plus, Copy, Trash2 } from "lucide-react";

const KIND_META: Record<SceneKind, { label: string; icon: React.ReactNode; color: string }> = {
  map:        { label: "Map",     icon: <Map size={13} />,        color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  dataviz:    { label: "Data",    icon: <BarChart3 size={13} />,  color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  title:      { label: "Title",   icon: <Type size={13} />,       color: "text-amber border-amber/30 bg-amber/10" },
  lowerthird: { label: "Lower 3", icon: <Captions size={13} />,   color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  quote:      { label: "Quote",   icon: <Quote size={13} />,      color: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
};

const ADD_KINDS: SceneKind[] = ["map", "title", "dataviz", "lowerthird", "quote"];

export const Timeline: React.FC = () => {
  const scenes = useStudio((s) => s.scenes);
  const activeId = useStudio((s) => s.activeId);
  const selectScene = useStudio((s) => s.selectScene);
  const addScene = useStudio((s) => s.addScene);
  const removeScene = useStudio((s) => s.removeScene);
  const duplicateScene = useStudio((s) => s.duplicateScene);
  const reorderScenes = useStudio((s) => s.reorderScenes);

  const [addOpen, setAddOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const totalSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="flex flex-col border-t border-ink-700/60 bg-ink-950/90 backdrop-blur-sm">
      {/* Strip header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-ink-700/30">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/40">
            Timeline
          </span>
          <span className="text-[10px] text-white/30">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-amber/60 tabular-nums">
          {totalSec.toFixed(1)}s total
        </span>
      </div>

      {/* Scene cards */}
      <div className="flex items-stretch gap-2 overflow-x-auto px-4 py-3">
        {scenes.map((s, i) => {
          const meta = KIND_META[s.kind];
          const active = s.id === activeId;
          const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
          return (
            <div
              key={s.id ?? i}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== i) reorderScenes(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onClick={() => selectScene(s.id!)}
              className={[
                "group relative flex w-[150px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 transition-all",
                active
                  ? "border-amber/50 bg-amber/[0.06] shadow-[0_0_0_1px_rgba(245,158,11,0.2)]"
                  : "border-ink-700/60 bg-ink-900/60 hover:border-ink-600 hover:bg-ink-800/60",
                isOver ? "ring-2 ring-amber/40" : "",
                dragIdx === i ? "opacity-40" : "",
              ].join(" ")}
            >
              {/* Index + kind */}
              <div className="flex items-center justify-between">
                <div className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${meta.color}`}>
                  {meta.icon}
                </div>
                <span className="font-mono text-[9px] text-white/30">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              {/* Name */}
              <div className="truncate text-[11px] font-medium text-white/80">{s.name}</div>

              {/* Footer: kind + duration */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-white/35">{meta.label}</span>
                <span className="font-mono text-[9px] text-white/40 tabular-nums">{s.durationSec}s</span>
              </div>

              {/* Hover actions */}
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateScene(s.id!); }}
                  className="rounded bg-ink-950/80 p-1 text-white/40 hover:text-amber"
                  title="Duplicate scene"
                >
                  <Copy size={10} />
                </button>
                {scenes.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeScene(s.id!); }}
                    className="rounded bg-ink-950/80 p-1 text-white/40 hover:text-red-400"
                    title="Delete scene"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add scene */}
        <div className="relative shrink-0">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex h-full w-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-700 text-white/40 transition-all hover:border-amber/50 hover:text-amber"
          >
            <Plus size={16} />
            <span className="text-[10px]">Add scene</span>
          </button>

          {addOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-2 w-40 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-elevated">
                {ADD_KINDS.map((k) => {
                  const meta = KIND_META[k];
                  return (
                    <button
                      key={k}
                      onClick={() => { addScene(k); setAddOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-ink-800 hover:text-white"
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${meta.color}`}>
                        {meta.icon}
                      </span>
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
