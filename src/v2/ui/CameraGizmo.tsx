"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Diamond, Trash2, RotateCcw, ChevronLeft, ChevronRight, Eraser, Compass } from "lucide-react";
import { previewMapBridge } from "../render/previewMapBridge";
import { getLivePose } from "../render/layers/renderHelpers";
import { useEditor } from "../store/editor";
import { minZoomForAspect, type CameraLayer, type CameraPose, type KfEase } from "../doc/schema";

type Axis = "pan" | "bearing" | "pitch" | "zoom" | null;

/**
 * The "Adjust camera" gizmo — a translucent overlay on the LIVE preview.
 *
 * It drives the Player's real internal MapLibre instance (via previewMapBridge)
 * while the Player is paused, so the actual rendered frame turns/tilts/zooms
 * under the user's hand with zero latency. Nothing is written to the document
 * during a drag; on release (or the explicit "Add keyframe" button) it commits
 * ONE camera keyframe — a full pose pinned at the current playhead time. Scrub
 * the timeline, change the angle, add another → the camera animates between
 * them (Google-Earth-Studio model).
 *
 * Handles (each = exactly one axis, shape tells you what it does):
 *   • Compass ring (center) — rotate → bearing
 *   • Tilt bar (left)       — drag ↕ → pitch (0–85°)
 *   • Zoom bar (right)      — drag ↕ → zoom
 *   • Drag empty area       — pan the map
 *   • Scroll wheel          — zoom
 */
export const CameraGizmo: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const comp = useEditor((s) => s.project.composition);
  const playheadFrame = useEditor((s) => s.playheadFrame);
  const setCameraKeyAtPlayhead = useEditor((s) => s.setCameraKeyAtPlayhead);
  const deleteCameraKeyAtPlayhead = useEditor((s) => s.deleteCameraKeyAtPlayhead);
  const setCameraKeyEaseAtPlayhead = useEditor((s) => s.setCameraKeyEaseAtPlayhead);
  const clearCameraKeys = useEditor((s) => s.clearCameraKeys);
  const gotoCameraKey = useEditor((s) => s.gotoCameraKey);

  const cam = comp.layers.find((l): l is CameraLayer => l.type === "camera");
  const keys = (cam?.keys ?? []) as { t: number; pose: CameraPose; ease: KfEase }[];
  const durationFrames = Math.max(1, Math.round(comp.durationSec * comp.fps));
  const t = durationFrames > 1 ? Math.min(1, Math.max(0, playheadFrame / (durationFrames - 1))) : 0;
  const eps = 0.75 / Math.max(1, durationFrames - 1);
  const keyAtPlayhead = keys.find((k) => Math.abs(k.t - t) < eps);
  const minZoom = minZoomForAspect(comp.aspect);
  const timeLabel = `${(t * comp.durationSec).toFixed(1)}s`;

  const ringRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ bearing: 0, pitch: 0, zoom: 3 });
  const [drag, setDrag] = useState<Axis>(null);
  const openPose = useRef<CameraPose | null>(null);

  // Live values are ground-truth: read them straight off the preview map.
  const readMap = useCallback((): CameraPose => {
    const m = previewMapBridge.get();
    if (m) {
      const c = m.getCenter();
      return { lon: c.lng, lat: c.lat, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
    }
    return getLivePose();
  }, []);

  // Capture the opening pose once (for Reset), keep the HUD synced to the map
  // every animation frame (so scrubbing the timeline updates the readouts too).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = readMap();
      setHud((h) =>
        Math.abs(h.bearing - p.bearing) < 0.05 && Math.abs(h.pitch - p.pitch) < 0.05 && Math.abs(h.zoom - p.zoom) < 0.005
          ? h
          : { bearing: p.bearing, pitch: p.pitch, zoom: p.zoom },
      );
      if (!openPose.current) openPose.current = p;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readMap]);

  const norm360 = (d: number) => ((d % 360) + 360) % 360;

  // On release: update the keyframe under the playhead, OR — once the user has
  // started keyframing (≥1 key) — auto-add one at this time (Earth-Studio feel).
  // With zero keys we wait for the explicit "Add keyframe" (teaches the concept).
  const commitOnRelease = useCallback(() => {
    if (keyAtPlayhead || keys.length > 0) setCameraKeyAtPlayhead(readMap());
  }, [keyAtPlayhead, keys.length, readMap, setCameraKeyAtPlayhead]);

  const startDrag = (
    axis: Exclude<Axis, null>,
    e: React.PointerEvent,
    onMove: (ev: PointerEvent, ctx: { start: { x: number; y: number }; last: { x: number; y: number }; base: CameraPose }) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(axis);
    const start = { x: e.clientX, y: e.clientY };
    const last = { x: e.clientX, y: e.clientY };
    const base = readMap();
    const move = (ev: PointerEvent) => {
      onMove(ev, { start, last, base });
      last.x = ev.clientX;
      last.y = ev.clientY;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      commitOnRelease();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── Per-axis gestures (drive the real preview map immediately) ──
  const panDrag = (e: React.PointerEvent) =>
    startDrag("pan", e, (ev, { last }) => {
      const m = previewMapBridge.get();
      // Grab-the-ground pan: content follows the cursor. If it ever feels
      // inverted, flip the sign of both deltas.
      m?.panBy?.([last.x - ev.clientX, last.y - ev.clientY], { duration: 0 });
    });

  const bearingDrag = (e: React.PointerEvent) => {
    const rect = ringRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : e.clientX;
    const cy = rect ? rect.top + rect.height / 2 : e.clientY;
    const angleAt = (x: number, y: number) => (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
    const startAngle = angleAt(e.clientX, e.clientY);
    startDrag("bearing", e, (ev, { base }) => {
      const delta = angleAt(ev.clientX, ev.clientY) - startAngle;
      previewMapBridge.get()?.jumpTo({ bearing: norm360(base.bearing + delta) });
    });
  };

  const pitchDrag = (e: React.PointerEvent) =>
    startDrag("pitch", e, (ev, { start, base }) => {
      const k = ev.shiftKey ? 0.15 : 0.5; // deg per px, up = more tilt
      const pitch = Math.min(85, Math.max(0, base.pitch + (start.y - ev.clientY) * k));
      previewMapBridge.get()?.jumpTo({ pitch });
    });

  const zoomDrag = (e: React.PointerEvent) =>
    startDrag("zoom", e, (ev, { start, base }) => {
      const k = ev.shiftKey ? 0.004 : 0.012; // zoom per px, up = in
      const zoom = Math.min(22, Math.max(minZoom, base.zoom + (start.y - ev.clientY) * k));
      previewMapBridge.get()?.jumpTo({ zoom });
    });

  const onWheel = (e: React.WheelEvent) => {
    const m = previewMapBridge.get();
    if (!m) return;
    const zoom = Math.min(22, Math.max(minZoom, m.getZoom() - e.deltaY * 0.002));
    m.jumpTo({ zoom });
  };
  // Wheel commits after it settles (debounced) — a scroll is one adjustment.
  const wheelCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheelCapture = () => {
    if (wheelCommit.current) clearTimeout(wheelCommit.current);
    wheelCommit.current = setTimeout(() => commitOnRelease(), 220);
  };

  const resetView = () => {
    const p = openPose.current;
    if (p) previewMapBridge.get()?.jumpTo({ center: [p.lon, p.lat], zoom: p.zoom, pitch: p.pitch, bearing: p.bearing });
  };

  const dim = (axis: Axis) => (drag && drag !== axis ? "opacity-20" : "");
  const ringRotation = -hud.bearing; // rotate the ring so N points to true north
  const pitchPct = (hud.pitch / 85) * 100;
  const zoomPct = ((hud.zoom - minZoom) / Math.max(0.5, 22 - minZoom)) * 100;

  return (
    <div className="absolute inset-0 z-[6] select-none" style={{ touchAction: "none" }}>
      {/* Full-frame surface: drag = pan, wheel = zoom. Handles sit above it. */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={panDrag}
        onWheel={(e) => { onWheel(e); onWheelCapture(); }}
      />

      {/* ── Compass ring (bearing) — center ─────────────────────────────── */}
      <div className={`pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 transition-opacity ${dim("bearing")}`}>
        <div
          ref={ringRef}
          onPointerDown={bearingDrag}
          className="pointer-events-auto relative h-[188px] w-[188px] cursor-grab rounded-full active:cursor-grabbing"
          title="Drag to rotate the view (bearing)"
          style={{ transform: `rotate(${ringRotation}deg)` }}
        >
          <svg viewBox="0 0 188 188" className="absolute inset-0 h-full w-full" style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.45))" }}>
            <circle cx="94" cy="94" r="86" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={drag === "bearing" ? 3 : 2} />
            {/* cardinal ticks */}
            {[0, 90, 180, 270].map((a) => {
              const rad = (a * Math.PI) / 180;
              const x1 = 94 + Math.sin(rad) * 78, y1 = 94 - Math.cos(rad) * 78;
              const x2 = 94 + Math.sin(rad) * 86, y2 = 94 - Math.cos(rad) * 86;
              return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={a === 0 ? "#38E1FF" : "rgba(255,255,255,0.6)"} strokeWidth={a === 0 ? 3 : 2} />;
            })}
            {/* N knob */}
            <circle cx="94" cy="8" r="6" fill="#38E1FF" stroke="#0b1020" strokeWidth="1.5" />
          </svg>
          <span className="pointer-events-none absolute left-1/2 top-[2px] -translate-x-1/2 text-[9px] font-bold text-[#38E1FF]" style={{ transform: `rotate(${-ringRotation}deg)` }}>N</span>
        </div>
        {/* center crosshair (pan target marker) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
          <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white/70" />
        </div>
      </div>

      {/* ── Tilt bar (pitch) — left ─────────────────────────────────────── */}
      <div className={`pointer-events-auto absolute left-5 top-1/2 -translate-y-1/2 transition-opacity ${dim("pitch")}`}>
        <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-white/70">Tilt</div>
        <div
          onPointerDown={pitchDrag}
          title="Drag up/down to tilt (pitch). Shift = fine"
          className="relative h-40 w-9 cursor-ns-resize rounded-full bg-black/45 ring-1 ring-white/15 backdrop-blur-sm"
        >
          <div className="absolute inset-x-0 bottom-0 rounded-full bg-[#38E1FF]/35" style={{ height: `${pitchPct}%` }} />
          <div className="absolute left-1/2 h-4 w-8 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white shadow" style={{ bottom: `calc(${pitchPct}% - 8px)` }} />
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-white/80">{Math.round(hud.pitch)}°</span>
        </div>
      </div>

      {/* ── Zoom bar — right ────────────────────────────────────────────── */}
      <div className={`pointer-events-auto absolute right-5 top-1/2 -translate-y-1/2 transition-opacity ${dim("zoom")}`}>
        <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-white/70">Zoom</div>
        <div
          onPointerDown={zoomDrag}
          title="Drag up/down to zoom. Shift = fine · scroll works too"
          className="relative h-40 w-9 cursor-ns-resize rounded-full bg-black/45 ring-1 ring-white/15 backdrop-blur-sm"
        >
          <div className="absolute inset-x-0 bottom-0 rounded-full bg-[#38E1FF]/35" style={{ height: `${zoomPct}%` }} />
          <div className="absolute left-1/2 h-4 w-8 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white shadow" style={{ bottom: `calc(${zoomPct}% - 8px)` }} />
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-white/80">z{hud.zoom.toFixed(1)}</span>
        </div>
      </div>

      {/* ── Coach banner (top) — only before the first keyframe ─────────── */}
      {keys.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-[11px] text-white/85 backdrop-blur-md">
          Turn the ring, tilt & zoom to frame the shot — then <span className="font-semibold text-[#38E1FF]">Add keyframe ◆</span>. Move the playhead, change the angle, add another → it animates between them.
        </div>
      )}

      {/* ── Bottom command bar ──────────────────────────────────────────── */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
        {/* live readout */}
        <div className="flex items-center gap-3 rounded-lg bg-black/55 px-3 py-2 font-mono text-[11px] text-white/85 backdrop-blur-md ring-1 ring-white/10">
          <span className={drag === "bearing" ? "font-bold text-[#38E1FF]" : ""}>◷ {Math.round(norm360(hud.bearing))}°</span>
          <span className={drag === "pitch" ? "font-bold text-[#38E1FF]" : ""}>⛰ {Math.round(hud.pitch)}°</span>
          <span className={drag === "zoom" ? "font-bold text-[#38E1FF]" : ""}>🔍 {hud.zoom.toFixed(1)}</span>
          <span className="text-white/40">| {timeLabel}</span>
        </div>

        {/* keyframe nav */}
        <div className="flex items-center gap-0.5 rounded-lg bg-black/55 p-1 backdrop-blur-md ring-1 ring-white/10">
          <button onClick={() => gotoCameraKey(-1)} disabled={!keys.length} className="rounded p-1.5 text-white/70 hover:bg-white/15 disabled:opacity-30" title="Previous keyframe"><ChevronLeft size={14} /></button>
          <span className="min-w-[52px] px-1 text-center text-[10px] text-white/60">{keys.length ? `${keys.length} key${keys.length > 1 ? "s" : ""}` : "no keys"}</span>
          <button onClick={() => gotoCameraKey(1)} disabled={!keys.length} className="rounded p-1.5 text-white/70 hover:bg-white/15 disabled:opacity-30" title="Next keyframe"><ChevronRight size={14} /></button>
        </div>

        {/* primary: add / update keyframe */}
        <button
          onClick={() => setCameraKeyAtPlayhead(readMap())}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-semibold text-white shadow transition ${
            keyAtPlayhead ? "bg-white/20 hover:bg-white/30" : "bg-[#38E1FF] text-[#08131a] hover:brightness-110" + (keys.length === 0 ? " animate-pulse" : "")
          }`}
        >
          <Diamond size={13} className={keyAtPlayhead ? "" : "fill-current"} /> {keyAtPlayhead ? "Update keyframe" : "Add keyframe"}
        </button>

        {/* ease of the current keyframe */}
        {keyAtPlayhead && (
          <select
            value={keyAtPlayhead.ease}
            onChange={(e) => setCameraKeyEaseAtPlayhead(e.target.value as KfEase)}
            title="How this keyframe eases into the next"
            className="rounded-lg bg-black/55 px-2 py-2 text-[11px] text-white/85 backdrop-blur-md ring-1 ring-white/10 focus:outline-none"
          >
            <option value="smooth">Smooth</option>
            <option value="linear">Linear</option>
            <option value="easeIn">Ease in</option>
            <option value="easeOut">Ease out</option>
            <option value="hold">Hold (cut)</option>
          </select>
        )}

        {keyAtPlayhead && (
          <button onClick={() => deleteCameraKeyAtPlayhead()} className="rounded-lg bg-black/55 p-2 text-white/70 backdrop-blur-md ring-1 ring-white/10 hover:text-red-400" title="Delete this keyframe"><Trash2 size={14} /></button>
        )}

        <div className="flex-1" />

        <button onClick={resetView} className="rounded-lg bg-black/55 p-2 text-white/70 backdrop-blur-md ring-1 ring-white/10 hover:text-white" title="Reset to the opening view"><RotateCcw size={14} /></button>
        {keys.length > 0 && (
          <button onClick={() => { if (confirm("Remove all camera keyframes and return to the automatic camera?")) clearCameraKeys(); }} className="rounded-lg bg-black/55 p-2 text-white/70 backdrop-blur-md ring-1 ring-white/10 hover:text-red-400" title="Clear all camera keyframes"><Eraser size={14} /></button>
        )}
        <button onClick={onExit} className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-950 shadow transition hover:opacity-90">Done</button>
      </div>
    </div>
  );
};
