"use client";

import React, { useState } from "react";
import { Plus, Copy, Trash2, ChevronLeft, ChevronRight, Film, ChevronDown, ChevronUp, Play, Pencil } from "lucide-react";
import { useEditor } from "../store/editor";
import { SequenceCommandBar } from "./SequenceCommandBar";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * The storyboard filmstrip — the multi-scene backbone of the Story Editor.
 * Scenes play in sequence; click to edit one, add/duplicate/reorder/delete, and
 * write the per-scene narration (the AI fills it in Story Mode). The editor's
 * canvas/layers/inspector all follow the ACTIVE scene automatically.
 */
export const SceneStrip: React.FC = () => {
  const scenes = useEditor((s) => s.project.scenes);
  const activeId = useEditor((s) => s.project.activeSceneId);
  const selectScene = useEditor((s) => s.selectScene);
  const addScene = useEditor((s) => s.addScene);
  const removeScene = useEditor((s) => s.removeScene);
  const duplicateScene = useEditor((s) => s.duplicateScene);
  const moveScene = useEditor((s) => s.moveScene);
  const renameScene = useEditor((s) => s.renameScene);
  const setSceneNarration = useEditor((s) => s.setSceneNarration);
  const setSceneTransition = useEditor((s) => s.setSceneTransition);
  const patchComposition = useEditor((s) => s.patchComposition);
  const playStory = useEditor((s) => s.playStory);
  const setPlayStory = useEditor((s) => s.setPlayStory);
  const [showNarration, setShowNarration] = useState(true);

  if (!scenes.length) return null;
  const total = scenes.reduce((a, s) => a + (s.composition?.durationSec ?? 0), 0);
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];
  const activeIdx = scenes.findIndex((s) => s.id === active.id);

  return (
    <div className="border-t border-black/5 bg-paper-50/70">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite/40">
          <Film size={13} className="text-iris" /> Storyboard
          <span className="font-normal normal-case tracking-normal text-graphite/30">· {scenes.length} {scenes.length === 1 ? "scene" : "scenes"} · {fmt(total)} total</span>
        </div>
        {scenes.length > 1 && (
          <button
            onClick={() => setPlayStory(!playStory)}
            title={playStory ? "Back to editing the active scene" : "Play the whole story in the preview"}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${playStory ? "bg-iris text-white shadow-glow-iris" : "border border-line text-graphite/60 hover:border-iris hover:text-iris"}`}
          >
            {playStory ? <><Pencil size={11} /> Edit scene</> : <><Play size={11} /> Play story</>}
          </button>
        )}

        {scenes.map((sc, i) => {
          const on = sc.id === activeId;
          return (
            <div
              key={sc.id}
              onClick={() => selectScene(sc.id)}
              style={{ minWidth: 118 }}
              className={`group relative flex shrink-0 cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 transition-all ${on ? "border-iris bg-brand-soft ring-1 ring-iris/40" : "border-line bg-white/60 hover:border-iris/40 hover:-translate-y-px"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold ${on ? "bg-iris text-white" : "bg-black/10 text-graphite/50"}`}>{i + 1}</span>
                {on ? (
                  <input
                    value={sc.name}
                    onChange={(e) => renameScene(sc.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-graphite focus:outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-graphite/70">{sc.name}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-graphite/35">{fmt(sc.composition?.durationSec ?? 0)}{sc.narration ? " · 📝" : ""}</span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); moveScene(sc.id, -1); }} disabled={i === 0} className="text-graphite/30 hover:text-graphite disabled:opacity-20"><ChevronLeft size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); moveScene(sc.id, 1); }} disabled={i === scenes.length - 1} className="text-graphite/30 hover:text-graphite disabled:opacity-20"><ChevronRight size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); duplicateScene(sc.id); }} title="Duplicate scene" className="text-graphite/30 hover:text-iris"><Copy size={10} /></button>
                  {scenes.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${sc.name}"?`)) removeScene(sc.id); }} title="Delete scene" className="text-graphite/30 hover:text-red-400"><Trash2 size={10} /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <button onClick={addScene} className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-line px-3 py-2 text-[11px] font-medium text-graphite/50 transition-colors hover:border-iris hover:text-iris">
          <Plus size={12} /> Add scene
        </button>
      </div>

      {active && (
        <div className="border-t border-black/5 px-3 py-1.5">
          <div className="flex items-center justify-between">
            <button onClick={() => setShowNarration((v) => !v)} className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-graphite/35 transition-colors hover:text-graphite/60">
              {showNarration ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Narration · {active.name}
            </button>
            <div className="flex items-center gap-3 text-[10px] text-graphite/40">
              {activeIdx > 0 && (
                <div className="flex items-center gap-1">
                  <span className="uppercase tracking-[0.15em]">Transition in</span>
                  <select
                    value={active.transition ?? "cut"}
                    onChange={(e) => setSceneTransition(active.id, e.target.value as any)}
                    className="rounded border border-line bg-white px-1.5 py-0.5 text-[10px] text-graphite/70 focus:border-iris/50 focus:outline-none"
                  >
                    <option value="cut">Cut</option>
                    <option value="fade">Dip to black</option>
                    <option value="crossfade">Crossfade</option>
                    <option value="slide">Slide</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="uppercase tracking-[0.15em]">Length</span>
                <button onClick={() => patchComposition({ durationSec: Math.max(1, Math.round((active.composition.durationSec - 0.5) * 10) / 10) })} className="flex h-4 w-4 items-center justify-center rounded border border-line text-graphite/60 hover:border-iris hover:text-iris">–</button>
                <span className="w-9 text-center font-mono text-[11px] text-graphite/70">{(active.composition.durationSec ?? 0).toFixed(1)}s</span>
                <button onClick={() => patchComposition({ durationSec: Math.min(60, Math.round((active.composition.durationSec + 0.5) * 10) / 10) })} className="flex h-4 w-4 items-center justify-center rounded border border-line text-graphite/60 hover:border-iris hover:text-iris">+</button>
              </div>
            </div>
          </div>
          {showNarration && (
            <textarea
              value={active.narration}
              onChange={(e) => setSceneNarration(active.id, e.target.value)}
              rows={2}
              placeholder="Voiceover / script for this scene… (the AI fills this in when you use Story mode)"
              className="mt-1 w-full resize-none rounded-md border border-line bg-white/70 px-2.5 py-1.5 text-[12px] leading-relaxed text-graphite placeholder:text-graphite/30 focus:border-iris/50 focus:outline-none"
            />
          )}
        </div>
      )}
      <SequenceCommandBar />
    </div>
  );
};
