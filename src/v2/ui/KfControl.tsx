"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEditor } from "../store/editor";
import { sampleTrack } from "../render/timing";
import type { PropKeyframe, KfEase } from "../doc/schema";

/**
 * Keyframe-aware slider — the heart of the animation UX.
 *
 * A normal slider with a diamond keyframe button. Tap the diamond to drop a
 * keyframe at the playhead; move the playhead, change the value (or tap again),
 * and the property animates between them. When keyframed, the slider shows and
 * edits the value AT THE PLAYHEAD (After Effects style), plus prev/next keyframe
 * jumps and a per-segment easing picker (linear · smooth · ease in/out · hold).
 *
 * Works on ANY numeric layer property — fill opacity, extrusion, glow, size,
 * width… — because it drives the store's generic property-track actions.
 */
const EASES: { v: KfEase; label: string }[] = [
  { v: "smooth", label: "Smooth" },
  { v: "linear", label: "Linear" },
  { v: "easeIn", label: "Ease in" },
  { v: "easeOut", label: "Ease out" },
  { v: "hold", label: "Hold" },
];

export const KfSlider: React.FC<{
  layerId: string;
  prop: string;
  label: string;
  value: number; // static fallback (l[prop])
  min?: number; max?: number; step?: number;
  format?: (v: number) => string; hint?: string;
}> = ({ layerId, prop, label, value, min = 0, max = 1, step = 0.01, format, hint }) => {
  const track = useEditor((s) => (s.project.composition.layers.find((l) => l.id === layerId) as any)?.tracks?.[prop] as PropKeyframe[] | undefined);
  const playheadFrame = useEditor((s) => s.playheadFrame);
  const durationSec = useEditor((s) => s.project.composition.durationSec);
  const compFps = useEditor((s) => s.project.composition.fps);
  const setLayerProp = useEditor((s) => s.setLayerProp);
  const toggleKeyframe = useEditor((s) => s.toggleKeyframe);
  const setKfEaseAtPlayhead = useEditor((s) => s.setKfEaseAtPlayhead);
  const gotoKeyframe = useEditor((s) => s.gotoKeyframe);

  const tf = Math.max(1, Math.round((durationSec || 1) * (compFps || 30)));
  const t = tf > 1 ? Math.min(1, Math.max(0, (playheadFrame || 0) / (tf - 1))) : 0;
  const eps = 0.75 / Math.max(1, tf - 1);

  const keyframed = !!track?.length;
  const display = keyframed ? (sampleTrack(track, t) ?? value) : value;
  const kfHere = keyframed && !!track!.some((k) => Math.abs(k.t - t) < eps);
  // The keyframe governing the current segment (last one ≤ t) — drives the ease picker.
  const segEase: KfEase = (() => {
    if (!keyframed) return "smooth";
    let e: KfEase = track![0].ease;
    for (const k of track!) if (k.t <= t + 1e-6) e = k.ease;
    return e;
  })();

  const pct = Math.max(0, Math.min(100, ((display - min) / (max - min || 1)) * 100));
  const fmt = format ?? ((v: number) => Math.round(v * 100) + "%");

  return (
    <div className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleKeyframe(layerId, prop, display)}
            title={kfHere ? "Remove keyframe here" : "Add a keyframe at the playhead"}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] transition-colors hover:bg-iris/10"
          >
            <span className={`h-[9px] w-[9px] rotate-45 rounded-[1.5px] transition-colors ${kfHere ? "bg-iris shadow-[0_0_5px_rgba(110,123,255,0.7)]" : keyframed ? "border-[1.5px] border-iris" : "border-[1.5px] border-graphite/35"}`} />
          </button>
          <span className="min-w-0 truncate text-[11px] font-medium tracking-tight text-graphite-muted">
            {label}{hint && <span className="ml-1.5 font-normal text-graphite-muted/55">{hint}</span>}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {keyframed && (
            <>
              <button type="button" onClick={() => gotoKeyframe(layerId, prop, -1)} title="Previous keyframe" className="rounded p-0.5 text-graphite/40 hover:bg-graphite/[0.06] hover:text-graphite"><ChevronLeft size={12} /></button>
              <button type="button" onClick={() => gotoKeyframe(layerId, prop, 1)} title="Next keyframe" className="rounded p-0.5 text-graphite/40 hover:bg-graphite/[0.06] hover:text-graphite"><ChevronRight size={12} /></button>
            </>
          )}
          <span className="rounded-md bg-graphite/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-graphite/75">{fmt(display)}</span>
        </div>
      </div>

      <div className="group relative flex h-5 items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-graphite/15" />
        <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-iris to-[#9b6cff] shadow-[0_0_8px_-1px_rgba(110,123,255,0.55)]" style={{ width: `${pct}%` }} />
        {/* keyframe ticks along the track */}
        {keyframed && track!.map((k, i) => (
          <span key={i} className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-white/70 bg-iris" style={{ left: `${k.t * 100}%` }} />
        ))}
        <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-iris bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-transform duration-150 group-hover:scale-110 group-active:scale-95" style={{ left: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={display} onChange={(e) => setLayerProp(layerId, prop, Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </div>

      {keyframed && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[9.5px] uppercase tracking-wider text-graphite/35">Curve</span>
          <select
            value={segEase}
            onChange={(e) => setKfEaseAtPlayhead(layerId, prop, e.target.value as KfEase)}
            title="How this keyframe eases into the next"
            className="rounded-md border border-line bg-paper-50 px-1.5 py-0.5 text-[10px] text-graphite/70 focus:border-iris focus:outline-none"
          >
            {EASES.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};
