"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Diamond, Trash2, RotateCcw, ChevronLeft, ChevronRight, Eraser, Check, Mountain, ZoomIn } from "lucide-react";
import { previewMapBridge } from "../render/previewMapBridge";
import { getLivePose } from "../render/layers/renderHelpers";
import { useEditor } from "../store/editor";
import { minZoomForAspect, type CameraLayer, type CameraPose, type KfEase } from "../doc/schema";

type Axis = "pan" | "bearing" | "pitch" | "zoom" | null;
const ACCENT = "#38E1FF";
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * The "Adjust camera" gizmo — a cinematic viewfinder overlay on the LIVE
 * preview. Drives the Player's real MapLibre map (via previewMapBridge) while
 * paused, so the frame turns/tilts/zooms under the hand with zero latency, and
 * commits ONE camera keyframe (a full pose at the playhead) on release.
 *
 * Instrument look: a compass dial reads the bearing as cardinal + degrees; the
 * tilt & zoom rails glow with their live value. Numbers you can feel, not a GIS
 * readout. Drag empty = pan · wheel = zoom · ring = rotate · rails = tilt/zoom.
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

  const ringRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ bearing: 0, pitch: 0, zoom: 3 });
  const [drag, setDrag] = useState<Axis>(null);
  const openPose = useRef<CameraPose | null>(null);

  const readMap = useCallback((): CameraPose => {
    const m = previewMapBridge.get();
    if (m) {
      const c = m.getCenter();
      return { lon: c.lng, lat: c.lat, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
    }
    return getLivePose();
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const norm360 = (d: number) => ((d % 360) + 360) % 360;

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
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 3) moved = true;
      onMove(ev, { start, last, base });
      last.x = ev.clientX;
      last.y = ev.clientY;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      // A click (no real drag) must NOT create a keyframe — only a genuine move.
      if (moved) commitOnRelease();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const panDrag = (e: React.PointerEvent) =>
    startDrag("pan", e, (ev, { last }) => {
      previewMapBridge.get()?.panBy?.([last.x - ev.clientX, last.y - ev.clientY], { duration: 0 });
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
      const k = ev.shiftKey ? 0.15 : 0.5;
      previewMapBridge.get()?.jumpTo({ pitch: Math.min(85, Math.max(0, base.pitch + (start.y - ev.clientY) * k)) });
    });

  const zoomDrag = (e: React.PointerEvent) =>
    startDrag("zoom", e, (ev, { start, base }) => {
      const k = ev.shiftKey ? 0.004 : 0.012;
      previewMapBridge.get()?.jumpTo({ zoom: Math.min(22, Math.max(minZoom, base.zoom + (start.y - ev.clientY) * k)) });
    });

  const onWheel = (e: React.WheelEvent) => {
    const m = previewMapBridge.get();
    if (!m) return;
    m.jumpTo({ zoom: Math.min(22, Math.max(minZoom, m.getZoom() - e.deltaY * 0.002)) });
  };
  const wheelCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheelCapture = () => {
    if (wheelCommit.current) clearTimeout(wheelCommit.current);
    wheelCommit.current = setTimeout(() => commitOnRelease(), 220);
  };

  const resetView = () => {
    const p = openPose.current;
    if (p) previewMapBridge.get()?.jumpTo({ center: [p.lon, p.lat], zoom: p.zoom, pitch: p.pitch, bearing: p.bearing });
  };

  const dim = (axis: Axis) => (drag && drag !== axis ? "opacity-10" : "opacity-100");
  const bearing = norm360(hud.bearing);
  const cardinal = CARDINALS[Math.round(bearing / 45) % 8];
  const ringRotation = -hud.bearing;
  const pitchPct = (hud.pitch / 85) * 100;
  const zoomPct = ((hud.zoom - minZoom) / Math.max(0.5, 22 - minZoom)) * 100;

  return (
    <div className="absolute inset-0 z-[6] select-none" style={{ touchAction: "none" }} onWheel={(e) => { onWheel(e); onWheelCapture(); }}>
      {/* Cinematic vignette — focuses the eye on the frame, premium feel */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.4))" }} />

      {/* Drag = pan (wheel-zoom is on the root, so scrolling anywhere — incl. over the ring — zooms) */}
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={panDrag} />

      {/* ── Compass instrument (center): rotate + the cool bearing readout ── */}
      <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 ${dim("bearing")}`}>
        <div
          ref={ringRef}
          onPointerDown={bearingDrag}
          role="slider"
          aria-label="Rotate camera (bearing)"
          aria-valuenow={Math.round(bearing)}
          aria-valuemin={0}
          aria-valuemax={359}
          tabIndex={0}
          className="group pointer-events-auto relative h-[190px] w-[190px] cursor-grab active:cursor-grabbing"
          title="Drag to rotate"
          style={{ transform: `rotate(${ringRotation}deg)`, filter: drag === "bearing" ? `drop-shadow(0 0 10px ${ACCENT}88)` : "drop-shadow(0 2px 8px rgba(0,0,0,0.45))" }}
        >
          <svg viewBox="0 0 190 190" className="absolute inset-0 h-full w-full">
            <circle cx="95" cy="95" r="86" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={drag === "bearing" ? 2.25 : 1.5} className="transition-all group-hover:stroke-white/40" />
            {Array.from({ length: 24 }).map((_, i) => {
              const a = i * 15, rad = (a * Math.PI) / 180;
              const card = a % 90 === 0, inter = a % 45 === 0;
              const r0 = card ? 74 : inter ? 79 : 82, r1 = 86;
              const x1 = 95 + Math.sin(rad) * r0, y1 = 95 - Math.cos(rad) * r0;
              const x2 = 95 + Math.sin(rad) * r1, y2 = 95 - Math.cos(rad) * r1;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={a === 0 ? ACCENT : `rgba(255,255,255,${card ? 0.5 : inter ? 0.32 : 0.16})`} strokeWidth={a === 0 ? 2.5 : card ? 1.75 : 1} />;
            })}
            {/* glowing north pointer */}
            <path d="M95 3 l6 12 h-12 z" fill={ACCENT} style={{ filter: `drop-shadow(0 0 4px ${ACCENT})` }} />
          </svg>
        </div>
        {/* Upright center readout — cardinal big, degrees small (the cool bit) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-[30px] font-bold leading-none tracking-tight text-white" style={{ textShadow: `0 0 14px ${ACCENT}66` }}>{cardinal}</span>
          <span className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums" style={{ color: ACCENT }}>{Math.round(bearing)}°</span>
          <span className="mt-2 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-white/40">Rotate</span>
        </div>
      </div>

      {/* ── Tilt (left) + Zoom (right) rails, glowing with their value ────── */}
      <SideRail side="left" label="Tilt" icon={<Mountain size={13} />} pct={pitchPct} active={drag === "pitch"} value={`${Math.round(hud.pitch)}°`} onPointerDown={pitchDrag} className={dim("pitch")} />
      <SideRail side="right" label="Zoom" icon={<ZoomIn size={13} />} pct={zoomPct} active={drag === "zoom"} value={hud.zoom.toFixed(1)} onPointerDown={zoomDrag} className={dim("zoom")} />

      {/* ── One-line coach — until the first keyframe ────────────────────── */}
      {keys.length === 0 && !drag && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-4 py-1.5 text-[11.5px] text-white/85 ring-1 ring-white/10 backdrop-blur-md">
          Frame your shot, then tap <span className="font-semibold" style={{ color: ACCENT }}>Add keyframe</span>
        </div>
      )}

      {/* ── Exit cluster — unmissable, top-right (Esc also exits) ─────────── */}
      <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1.5">
        <IconBtn title="Reset to opening view" onClick={resetView}><RotateCcw size={15} /></IconBtn>
        {keys.length > 0 && (
          <IconBtn title="Clear all camera keyframes" danger onClick={() => { if (confirm("Remove all camera keyframes and return to the automatic camera?")) clearCameraKeys(); }}><Eraser size={15} /></IconBtn>
        )}
        <button
          onClick={onExit}
          className="ml-1 flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-[#062430] transition hover:brightness-110"
          style={{ background: ACCENT, boxShadow: `0 4px 16px ${ACCENT}55` }}
        >
          <Check size={15} strokeWidth={2.75} /> Done
        </button>
      </div>

      {/* ── Hero dock (bottom-center): keyframe the shot ─────────────────── */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-black/60 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <IconBtn title="Previous keyframe" disabled={!keys.length} onClick={() => gotoCameraKey(-1)}><ChevronLeft size={16} /></IconBtn>

          <button
            onClick={() => setCameraKeyAtPlayhead(readMap())}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold transition ${
              keyAtPlayhead ? "bg-white/15 text-white hover:bg-white/25" : `text-[#062430] hover:brightness-110 ${keys.length === 0 ? "animate-pulse" : ""}`
            }`}
            style={keyAtPlayhead ? undefined : { background: ACCENT, boxShadow: `0 3px 18px ${ACCENT}66` }}
            title={keyAtPlayhead ? "Update this keyframe" : "Add a keyframe here"}
          >
            <Diamond size={15} className={keyAtPlayhead ? "" : "fill-current"} />
            {keyAtPlayhead ? "Update" : "Add keyframe"}
          </button>

          {keyAtPlayhead && (
            <>
              <select
                value={keyAtPlayhead.ease}
                onChange={(e) => setCameraKeyEaseAtPlayhead(e.target.value as KfEase)}
                title="Ease into the next keyframe"
                className="cursor-pointer rounded-full bg-white/10 px-2.5 py-2 text-[12px] text-white/85 focus:outline-none"
              >
                <option value="smooth">Smooth</option>
                <option value="linear">Linear</option>
                <option value="easeIn">Ease in</option>
                <option value="easeOut">Ease out</option>
                <option value="hold">Hold</option>
              </select>
              <IconBtn title="Delete this keyframe" danger onClick={() => deleteCameraKeyAtPlayhead()}><Trash2 size={15} /></IconBtn>
            </>
          )}

          <IconBtn title="Next keyframe" disabled={!keys.length} onClick={() => gotoCameraKey(1)}><ChevronRight size={16} /></IconBtn>
        </div>
      </div>
    </div>
  );
};

/** A glowing vertical rail (tilt / zoom) with its live value always shown. */
const SideRail: React.FC<{
  side: "left" | "right"; label: string; icon: React.ReactNode; pct: number;
  active: boolean; value: string; onPointerDown: (e: React.PointerEvent) => void; className?: string;
}> = ({ side, label, icon, pct, active, value, onPointerDown, className }) => (
  <div className={`pointer-events-auto absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 transition-opacity duration-200 ${side === "left" ? "left-5" : "right-5"} ${className}`}>
    <div className="flex items-center gap-1" style={{ color: active ? ACCENT : "rgba(255,255,255,0.6)" }}>{icon}<span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span></div>
    <div onPointerDown={onPointerDown} role="slider" aria-label={label} aria-valuetext={value} tabIndex={0} title={`Drag to change ${label.toLowerCase()} · Shift = fine`} className="group relative flex h-44 w-9 cursor-ns-resize items-end justify-center">
      <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-white/12" />
      <div
        className="absolute bottom-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full"
        style={{ height: `${pct}%`, background: `linear-gradient(to top, ${ACCENT}55, ${ACCENT})`, boxShadow: active ? `0 0 12px ${ACCENT}` : `0 0 6px ${ACCENT}55` }}
      />
      <div
        className="absolute left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-white transition-transform group-hover:scale-110"
        style={{ bottom: `calc(${pct}% - 10px)`, boxShadow: active ? `0 0 0 3px ${ACCENT}, 0 2px 8px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.5)" }}
      />
    </div>
    {/* the number, styled — always visible so you always know the value */}
    <div className="rounded-md px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums" style={{ color: active ? "#062430" : "#fff", background: active ? ACCENT : "rgba(0,0,0,0.4)", boxShadow: active ? `0 0 12px ${ACCENT}88` : undefined }}>{value}</div>
  </div>
);

const IconBtn: React.FC<{ title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ title, onClick, disabled, danger, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`rounded-full p-2 text-white/75 transition hover:bg-white/15 disabled:opacity-25 disabled:hover:bg-transparent ${danger ? "hover:text-red-400" : "hover:text-white"}`}
  >
    {children}
  </button>
);
