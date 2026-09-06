"use client";

import React, { useEffect, useState } from "react";
import { Film, Focus } from "lucide-react";
import { useEditor } from "../store/editor";
import { useToast } from "@/components/Toast/Toast";
import { LAYER_REGISTRY } from "../layers/registry";
import type { CameraLayer, Layer } from "../doc/schema";
import { poseAt, keyframedPose, hasCamKeys } from "../render/layers/renderHelpers";
import { sampleTrack } from "../render/timing";

/** Identifies a single selected keyframe on the timeline (camera or property). */
type KfSel =
  | { kind: "cam"; t: number }
  | { kind: "prop"; id: string; prop: string; t: number }
  | null;

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
  const fps = useEditor((s) => s.project.composition.fps);
  const requestSeek = useEditor((s) => s.requestSeek);
  const setPlayheadFrame = useEditor((s) => s.setPlayheadFrame);
  const moveKeyframe = useEditor((s) => s.moveKeyframe);
  const moveCameraKey = useEditor((s) => s.moveCameraKey);
  const setCameraKeyAt = useEditor((s) => s.setCameraKeyAt);
  const deleteCameraKeyAt = useEditor((s) => s.deleteCameraKeyAt);
  const addKeyframeAt = useEditor((s) => s.addKeyframeAt);
  const deleteKeyframeAt = useEditor((s) => s.deleteKeyframeAt);
  const jumpToT = (t: number) => { const f = Math.round(t * dur * fps); setPlayheadFrame(f); requestSeek?.(f); };

  // Select a keyframe (click a diamond) → Delete/Backspace removes it. Option-
  // click an empty spot on a lane adds a keyframe there. Makes the timeline a
  // first-class keyframe editor, not just a viewer.
  const [selKf, setSelKf] = useState<KfSel>(null);
  const undo = useEditor((s) => s.undo);
  const toast = useToast();
  const camLayer = layers.find((l): l is CameraLayer => l.type === "camera");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (!selKf) return;
      e.preventDefault();
      // Runs in the CAPTURE phase (below), so stop the Editor's layer-Delete
      // handler from ALSO firing — deleting a keyframe must never delete the layer.
      e.stopImmediatePropagation();
      if (selKf.kind === "cam") deleteCameraKeyAt(selKf.t);
      else deleteKeyframeAt(selKf.id, selKf.prop, selKf.t);
      setSelKf(null);
      toast.info("Keyframe removed", undefined, { label: "Undo", onClick: undo });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selKf, deleteCameraKeyAt, deleteKeyframeAt, toast, undo]);

  // Option-click add: capture the camera's pose (or a property's value) at the
  // clicked time — a new, editable keyframe pinned right there.
  const addCamKeyAt = (tt: number) => {
    if (!camLayer) return;
    const pose = hasCamKeys(camLayer) ? keyframedPose(camLayer, tt) : poseAt(camLayer, tt);
    setCameraKeyAt(tt, pose);
  };
  const addPropKeyAt = (l: Layer, prop: string, tt: number) => {
    const track = (l as any).tracks?.[prop] as { t: number; value: number }[] | undefined;
    const v = sampleTrack(track as any, tt);
    const value = v == null ? ((l as any)[prop] ?? 0) : v;
    addKeyframeAt(l.id, prop, tt, value);
  };
  const seekAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    requestSeek?.(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * dur * fps));
  };

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
    <div className="relative">
      {/* Ruler — click to scrub the preview */}
      <div className="flex h-5 border-b border-line">
        <div className="w-28 shrink-0" />
        <div className="relative flex-1 cursor-pointer" onPointerDown={seekAt}>
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
          const tracks = (l as any).tracks as Record<string, { t: number }[]> | undefined;
          const trackKeys = active && tracks ? Object.keys(tracks).filter((k) => tracks[k]?.length) : [];
          const camKeys = isCamera ? ((l as any).keys as { t: number; pose: any; ease: string }[] | undefined) ?? [] : [];
          return (
            <React.Fragment key={l.id}>
            <div
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
                {/* Aggregate keyframe pips on the layer bar (when not expanded) */}
                {!active && tracks && Object.values(tracks).flat().slice(0, 40).map((k, i) => (
                  <span key={i} className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-white/80" style={{ left: `${(k.t as number) * 100}%` }} />
                ))}
                {/* Camera keyframes always show on the camera bar (cyan diamonds) */}
                {isCamera && !active && camKeys.map((k, i) => (
                  <span key={i} className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-[#38E1FF]" style={{ left: `${k.t * 100}%` }} />
                ))}
              </div>
            </div>
            {/* Earth-Studio-style keyframe lanes — one per animated property */}
            {trackKeys.map((prop) => (
              <KfLane key={prop} items={(tracks as any)[prop]} dur={dur} label={humanizeProp(prop)} hex="#6E7BFF" rgb="110,123,255"
                tooltip={(k) => `${(k.t * dur).toFixed(2)}s · ${humanizeProp(prop)} = ${r1(k.value)} · ${k.ease} — click to select · drag to retime · Delete to remove`}
                onJump={jumpToT} onMove={(fromT, toT) => moveKeyframe(l.id, prop, fromT, toT)}
                onAdd={(tt) => addPropKeyAt(l, prop, tt)}
                selectedT={selKf?.kind === "prop" && selKf.id === l.id && selKf.prop === prop ? selKf.t : null}
                onSelect={(tt) => setSelKf({ kind: "prop", id: l.id, prop, t: tt })} />
            ))}
            {/* Camera move lane — one cyan diamond per pinned pose (Earth-Studio style) */}
            {active && isCamera && camKeys.length > 0 && (
              <KfLane items={camKeys} dur={dur} label="Camera move" hex="#38E1FF" rgb="56,225,255"
                tooltip={(k) => `${(k.t * dur).toFixed(2)}s · z${r1(k.pose?.zoom ?? 0)} · ${Math.round(k.pose?.bearing ?? 0)}° · tilt ${Math.round(k.pose?.pitch ?? 0)}° · ${k.ease} — click to select · drag to retime · Delete to remove`}
                onJump={jumpToT} onMove={moveCameraKey} onAdd={addCamKeyAt}
                selectedT={selKf?.kind === "cam" ? selKf.t : null}
                onSelect={(tt) => setSelKf({ kind: "cam", t: tt })} />
            )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Playhead — isolated into its own subscriber so only IT re-renders on
          each playback tick (~60/s), not every layer row + keyframe diamond. */}
      <Playhead dur={dur} fps={fps} />
    </div>
  );
};

/** The moving playhead line. Subscribes to `playheadFrame` ALONE so a playing
 *  scene doesn't re-render the whole BeatTracks (rows/diamonds) 60× a second. */
const Playhead: React.FC<{ dur: number; fps: number }> = ({ dur, fps }) => {
  const playheadFrame = useEditor((s) => s.playheadFrame);
  if (!(dur > 0 && fps > 0)) return null;
  const pct = clamp((playheadFrame / fps / dur) * 100, 0, 100);
  return (
    <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: "7rem", right: 0 }}>
      <div className="absolute inset-y-0" style={{ left: `${pct}%` }}>
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: "#6E7BFF", boxShadow: "0 0 6px 0 rgba(110,123,255,0.85)" }} />
        <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/3 rotate-45 rounded-[2px]" style={{ background: "#6E7BFF", boxShadow: "0 0 8px 1px rgba(110,123,255,0.9)" }} />
      </div>
    </div>
  );
};

/* ── Keyframe lane — one animated property's diamonds on the timeline ────────
   Earth-Studio / After-Effects style: every keyframe is a diamond at its time.
   Click a diamond to jump the playhead there; drag it to retime the keyframe. */
const KF_LABEL: Record<string, string> = {
  fillOpacity: "Fill opacity", borderWidth: "Border width", glowWidth: "Glow size",
  extrude: "Extrude", sizePx: "Size", glow: "Glow", width: "Line width", opacity: "Opacity",
};
const humanizeProp = (p: string) => KF_LABEL[p] ?? p.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** Shared drag/click behaviour for a keyframe diamond: <2px = click (jump +
 *  select), else drag to retime. */
const kfDrag = (
  e: React.PointerEvent, origT: number,
  onMove: (fromT: number, toT: number) => void, onClick: (t: number) => void,
) => {
  e.stopPropagation();
  const lane = (e.currentTarget as HTMLElement).closest("[data-kflane]") as HTMLElement | null;
  if (!lane) return;
  const rect = lane.getBoundingClientRect();
  const startX = e.clientX;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - startX) > 2) moved = true;
    if (moved) onMove(origT, clamp((ev.clientX - rect.left) / rect.width, 0, 1));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (!moved) onClick(origT);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

/** Option/Alt-click an empty spot on a lane → add a keyframe there. */
const laneAltAdd = (e: React.PointerEvent, onAdd: (t: number) => void) => {
  if (!e.altKey) return;
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  onAdd(clamp((e.clientX - rect.left) / rect.width, 0, 1));
};

/* ── Keyframe lane — one row of diamonds for a property track OR the camera
   move. Click a diamond to select+jump; drag to retime; ⌥-click empty to add.
   `hex`/`rgb` are the accent (iris for props, cyan for the camera lane);
   `tooltip(k)` renders each diamond's title (value vs pose summary). */
const KfLane: React.FC<{
  items: { t: number; ease: string }[]; dur: number; label: string;
  hex: string; rgb: string; tooltip: (k: any) => string;
  onJump: (t: number) => void; onMove: (fromT: number, toT: number) => void;
  onAdd: (t: number) => void; selectedT: number | null; onSelect: (t: number) => void;
}> = ({ items, label, hex, rgb, tooltip, onJump, onMove, onAdd, selectedT, onSelect }) => (
  <div className="relative flex h-5 items-center border-b border-line/40" style={{ background: `rgba(${rgb},0.045)` }}>
    <div className="flex w-28 shrink-0 items-center gap-1 truncate pl-6 pr-2 text-[9.5px] text-graphite/45">
      <span className="h-[6px] w-[6px] rotate-45 rounded-[1px]" style={{ background: hex }} />
      <span className="truncate">{label}</span>
    </div>
    <div data-kflane onPointerDown={(e) => laneAltAdd(e, onAdd)} className="relative h-full flex-1" title="⌥-click to add a keyframe here" style={{ cursor: "copy" }}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: `rgba(${rgb},0.2)` }} />
      {items.map((k, i) => {
        const sel = selectedT != null && Math.abs(k.t - selectedT) < 1e-4;
        return (
          <span
            key={i}
            onPointerDown={(e) => kfDrag(e, k.t, onMove, (tt) => { onJump(tt); onSelect(tt); })}
            title={tooltip(k)}
            className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] border transition-transform hover:scale-125 active:cursor-grabbing ${sel ? "scale-[1.35] border-white ring-2 ring-white/90" : "border-white/70"}`}
            style={{ left: `${k.t * 100}%`, background: hex, boxShadow: sel ? `0 0 9px rgba(${rgb},0.95)` : `0 0 5px rgba(${rgb},0.6)` }}
          />
        );
      })}
    </div>
  </div>
);
