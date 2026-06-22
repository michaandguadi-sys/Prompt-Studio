"use client";

import React, { useState } from "react";
import { Film, Focus } from "lucide-react";
import { useEditor } from "../store/editor";
import { LAYER_REGISTRY } from "../layers/registry";
import type { Layer } from "../doc/schema";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Layer-type → accent colour, so every tool reads at a glance on the timeline. */
const LAYER_COLOR: Record<string, string> = {
  camera: "#6E7BFF", highlight: "#36d39a", route: "#2FE0FF", label: "#B57BFF",
  flag: "#f5c842", title: "#B57BFF", chart: "#f5c842", choropleth: "#36d39a",
  bubble: "#36d39a", image: "#9aa0b4", marker: "#ff7a59", annotation: "#f5c842",
  connections: "#2FE0FF", spotlight: "#B57BFF", track: "#36d39a",
};
const colorOf = (t: string) => LAYER_COLOR[t] ?? "#9CA6FF";

/**
 * The Film Timeline — a HYBRID editor.
 *  • "Whole film" lays every beat end-to-end as proportional segments, each
 *    showing ALL its tools as coloured lanes — so you see the entire story and
 *    every layer at once. Click a beat to focus it.
 *  • "This beat" is the precise per-layer track editor for the active scene:
 *    drag a bar to move it, drag its edges to trim in/out.
 */
export const Timeline: React.FC = () => {
  const layers = useEditor((s) => s.project.composition.layers);
  const dur = useEditor((s) => s.project.composition.durationSec);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const patchTiming = useEditor((s) => s.patchTiming);
  const patchLayer = useEditor((s) => s.patchLayer);
  const scenes = useEditor((s) => s.project.scenes);
  const activeSceneId = useEditor((s) => s.project.activeSceneId);
  const selectScene = useEditor((s) => s.selectScene);

  const multi = scenes.length > 1;
  const [mode, setMode] = useState<"film" | "beat">("beat");
  const view = multi ? mode : "beat";

  return (
    <div className="select-none">
      {/* Mode header (only meaningful for multi-scene stories) */}
      {multi && (
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center rounded-lg border border-line bg-graphite/[0.04] p-0.5">
            <button onClick={() => setMode("film")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${view === "film" ? "bg-[#6E7BFF] text-white shadow-glow-iris" : "text-graphite/55 hover:text-graphite"}`}>
              <Film size={12} /> Whole film
            </button>
            <button onClick={() => setMode("beat")} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${view === "beat" ? "bg-[#6E7BFF] text-white shadow-glow-iris" : "text-graphite/55 hover:text-graphite"}`}>
              <Focus size={12} /> This beat
            </button>
          </div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-graphite/40">
            {view === "film" ? `${scenes.length} beats` : `editing beat ${Math.max(1, scenes.findIndex((s) => s.id === activeSceneId) + 1)}`}
          </span>
        </div>
      )}

      {view === "film"
        ? <FilmOverview scenes={scenes} activeSceneId={activeSceneId} onFocus={(id) => { selectScene(id); setMode("beat"); }} />
        : <BeatTracks layers={layers} dur={dur} selectedId={selectedId} select={select} patchTiming={patchTiming} patchLayer={patchLayer} />}
    </div>
  );
};

/* ── Whole-film overview ──────────────────────────────────────────────────── */
const FilmOverview: React.FC<{ scenes: any[]; activeSceneId: string; onFocus: (id: string) => void }> = ({ scenes, activeSceneId, onFocus }) => {
  const durs = scenes.map((s) => s.composition?.durationSec ?? 0);
  const total = Math.max(0.1, durs.reduce((a, b) => a + b, 0));
  const ticks = Array.from({ length: Math.floor(total / 5) + 1 }, (_, i) => i * 5);

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Ruler */}
      <div className="relative mb-1 h-4">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-graphite/40" style={{ left: `${(t / total) * 100}%` }}>{t}s</span>
        ))}
      </div>
      {/* Beat segments */}
      <div className="flex h-[104px] gap-1">
        {scenes.map((sc, i) => {
          const w = ((sc.composition?.durationSec ?? 0) / total) * 100;
          const on = sc.id === activeSceneId;
          const sceneLayers: Layer[] = (sc.composition?.layers ?? []).filter((l: Layer) => l.type !== "camera");
          const shown = sceneLayers.slice(0, 6);
          return (
            <button
              key={sc.id}
              onClick={() => onFocus(sc.id)}
              title={`Focus beat ${i + 1} — ${sc.name}`}
              style={{ width: `${w}%`, minWidth: 84 }}
              className={`group relative flex shrink-0 flex-col overflow-hidden rounded-lg border p-1.5 text-left transition-all ${on ? "border-[#6E7BFF] bg-iris/[0.08] ring-1 ring-[#6E7BFF]/40" : "border-line bg-graphite/[0.03] hover:border-[#6E7BFF]/40 hover:bg-graphite/[0.05]"}`}
            >
              {/* Beat header */}
              <div className="mb-1 flex items-center gap-1">
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[8px] font-bold ${on ? "bg-[#6E7BFF] text-white" : "bg-graphite/10 text-graphite/55"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-graphite/80">{sc.name}</span>
                <span className="shrink-0 text-[9px] tabular-nums text-graphite/40">{(sc.composition?.durationSec ?? 0).toFixed(1)}s</span>
              </div>
              {/* Layer lanes — every tool in this beat, at a glance */}
              <div className="flex flex-1 flex-col justify-start gap-[3px]">
                {shown.map((l) => {
                  const sd = sc.composition?.durationSec ?? 1;
                  const t = (l as any).timing;
                  const ins = t?.inSec ?? 0;
                  const outs = t?.outSec ?? sd;
                  const left = clamp((ins / sd) * 100, 0, 100);
                  const width = Math.max(8, Math.min(100 - left, ((outs - ins) / sd) * 100));
                  const c = colorOf(l.type);
                  return (
                    <div key={l.id} className="relative h-2 rounded-full bg-graphite/[0.06]" title={`${l.name || LAYER_REGISTRY[l.type]?.label}`}>
                      <div className="absolute top-0 h-full rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: c, opacity: l.enabled === false ? 0.3 : 0.85, boxShadow: `0 0 8px -2px ${c}` }} />
                    </div>
                  );
                })}
                {sceneLayers.length > 6 && <span className="mt-0.5 text-[8px] text-graphite/45">+{sceneLayers.length - 6} more</span>}
                {sceneLayers.length === 0 && <span className="text-[9px] text-graphite/40">no overlays</span>}
              </div>
              {/* Transition pill on boundary */}
              {i > 0 && sc.transition && sc.transition !== "cut" && (
                <span className="absolute -left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-iris/30 bg-iris/10 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-iris">{sc.transition[0]}</span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#6E7BFF]/0 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[9px] text-graphite/40">Click a beat to focus &amp; edit it · drag layers in “This beat”.</div>
    </div>
  );
};

/* ── Per-beat track editor (the precise mode) ─────────────────────────────── */
const BeatTracks: React.FC<{
  layers: Layer[]; dur: number; selectedId: string | null;
  select: (id: string | null) => void;
  patchTiming: (id: string, t: any) => void;
  patchLayer: (id: string, p: any) => void;
}> = ({ layers, dur, selectedId, select, patchTiming, patchLayer }) => {
  const ticks = Array.from({ length: Math.floor(dur) + 1 }, (_, i) => i);

  const startDrag = (e: React.PointerEvent, l: Layer, mode: "move" | "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();
    const lane = (e.currentTarget as HTMLElement).closest("[data-lane]") as HTMLElement | null;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const isCamera = l.type === "camera";
    const t = (l as any).timing;
    const grabSec = ((e.clientX - rect.left) / rect.width) * dur;
    const origIn = isCamera ? 0 : (t?.inSec ?? 0);
    const hadOut = !isCamera && t?.outSec != null;
    const origOut = isCamera ? (l as any).moveFraction * dur : (t?.outSec ?? dur);
    select(l.id);

    const move = (ev: PointerEvent) => {
      const sec = clamp(((ev.clientX - rect.left) / rect.width) * dur, 0, dur);
      if (isCamera) { patchLayer(l.id, { moveFraction: clamp(sec / dur, 0.1, 1) }); return; }
      if (mode === "left") {
        patchTiming(l.id, { inSec: r1(clamp(sec, 0, (hadOut ? origOut : dur) - 0.2)) });
      } else if (mode === "right") {
        patchTiming(l.id, { outSec: r1(clamp(sec, origIn + 0.2, dur)) });
      } else {
        const delta = sec - grabSec;
        if (hadOut) {
          const len = origOut - origIn;
          const ni = clamp(origIn + delta, 0, dur - len);
          patchTiming(l.id, { inSec: r1(ni), outSec: r1(ni + len) });
        } else {
          patchTiming(l.id, { inSec: r1(clamp(origIn + delta, 0, dur - 0.2)) });
        }
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div>
      {/* Ruler */}
      <div className="flex h-5 border-b border-line">
        <div className="w-28 shrink-0" />
        <div className="relative flex-1">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0.5 -translate-x-1/2 text-[9px] tabular-nums text-graphite/45" style={{ left: `${(t / dur) * 100}%` }}>{t}s</span>
          ))}
        </div>
      </div>

      {/* Tracks */}
      <div className="max-h-40 overflow-y-auto">
        {layers.map((l) => {
          const active = l.id === selectedId;
          const isCamera = l.type === "camera";
          let start = 0, end = dur;
          if (isCamera) { start = 0; end = (l as any).moveFraction * dur; }
          else if ("timing" in l) { start = (l as any).timing.inSec; end = (l as any).timing.outSec ?? dur; }
          const left = clamp((start / dur) * 100, 0, 100);
          const width = Math.max(2, Math.min(100 - left, ((end - start) / dur) * 100));
          const c = colorOf(l.type);
          return (
            <div
              key={l.id}
              onPointerDown={() => select(l.id)}
              className={`relative flex h-7 items-center border-b border-line/60 ${active ? "bg-iris/[0.08]" : "hover:bg-graphite/[0.04]"}`}
            >
              <div className="flex w-28 shrink-0 items-center gap-1.5 truncate px-3 text-[11px] text-graphite/65">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 6px -1px ${c}` }} />
                <span className="truncate">{l.name || LAYER_REGISTRY[l.type].label}</span>
              </div>
              <div data-lane className="relative h-full flex-1">
                <div
                  onPointerDown={(e) => startDrag(e, l, "move")}
                  className={`group absolute top-1/2 h-4 -translate-y-1/2 cursor-grab rounded-[4px] active:cursor-grabbing ${l.enabled === false ? "opacity-30" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%`, background: c, opacity: active ? 1 : 0.65, boxShadow: active ? `0 0 14px -3px ${c}` : undefined }}
                  title={isCamera ? `Move length: ${end.toFixed(1)}s — drag to change` : `${start.toFixed(1)}s → ${end.toFixed(1)}s — drag to move, edges to trim`}
                >
                  {!isCamera && (
                    <>
                      <span onPointerDown={(e) => startDrag(e, l, "left")} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-[4px] bg-white/0 hover:bg-graphite/30" />
                      <span onPointerDown={(e) => startDrag(e, l, "right")} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-[4px] bg-white/0 hover:bg-graphite/30" />
                    </>
                  )}
                  {isCamera && (
                    <span onPointerDown={(e) => startDrag(e, l, "right")} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-[4px] bg-white/0 hover:bg-graphite/30" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
