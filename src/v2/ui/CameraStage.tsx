"use client";

import React, { useMemo, useRef, useState } from "react";
import Map, { type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Video, Play, Search, Check, X, Plus, Trash2, Compass,
  Flag, Target, MousePointer2,
} from "lucide-react";
import { resolveMapStyle, applyBasemapIdentity } from "@/lib/maplibre";
import { useEditor } from "../store/editor";
import { minZoomForAspect, type CameraLayer, type CameraPose } from "../doc/schema";

/**
 * Interactive camera stage — the "director's viewfinder".
 *
 * Replaces the non-interactive Remotion <Player> while the user frames a shot.
 * The map is fully live: scroll = zoom, drag = pan, right/ctrl-drag = orbit +
 * tilt (Blender/Earth-Studio muscle memory). The current view is then captured
 * into the camera layer's Start / End poses (or appended as a waypoint), so the
 * move the film plays is exactly what the creator framed here.
 *
 * Nothing here renders into the video — it only WRITES poses to the camera
 * layer. When the user exits, the Player re-runs the move between those poses.
 */
export const CameraStage: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const comp = useEditor((s) => s.project.composition);
  const patchLayer = useEditor((s) => s.patchLayer);
  const cam = comp.layers.find((l) => l.type === "camera") as CameraLayer | undefined;

  const mapRef = useRef<MapRef>(null);
  const stash = useRef<{ styleKey: string; base: Record<string, string | null> }>({ styleKey: "", base: {} });
  const minZoom = useMemo(() => minZoomForAspect(comp.aspect), [comp.aspect]);
  const styleUrl = comp.basemap.styleUrl;
  const mapStyle = useMemo(() => resolveMapStyle(styleUrl), [styleUrl]);

  // Live readout of the current framing (updates as the map moves).
  const seed: CameraPose = cam?.end ?? cam?.start ?? { lon: 0, lat: 20, zoom: 3, pitch: 0, bearing: 0 };
  const [view, setView] = useState<CameraPose>(seed);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ping = (label: string) => {
    setFlash(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
  };

  // Place search → fly anywhere (same geocode endpoint the pickers use).
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = (term: string) => {
    setQ(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (term.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results.slice(0, 6) : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
  };
  const flyToResult = (res: any) => {
    const m = mapRef.current?.getMap();
    if (m) {
      if (Array.isArray(res.bbox) && res.bbox.length === 4) {
        try { m.fitBounds([[res.bbox[0], res.bbox[1]], [res.bbox[2], res.bbox[3]]], { padding: 80, duration: 900 }); }
        catch { m.flyTo({ center: [res.lon, res.lat], zoom: res.zoom ?? 6, duration: 900 }); }
      } else {
        m.flyTo({ center: [res.lon, res.lat], zoom: res.zoom ?? 9, duration: 900 });
      }
    }
    setQ(res.shortName ?? res.name ?? "");
    setResults([]);
  };

  const readPose = (): CameraPose | null => {
    const m = mapRef.current?.getMap();
    if (!m) return null;
    const c = m.getCenter();
    return {
      lon: c.lng,
      lat: c.lat,
      zoom: Math.max(0, Math.min(22, m.getZoom())),
      pitch: Math.max(0, Math.min(85, m.getPitch())),
      bearing: m.getBearing(),
    };
  };

  const setSlot = (slot: "start" | "end") => {
    if (!cam) return;
    const pose = readPose();
    if (!pose) return;
    patchLayer(cam.id, { [slot]: pose });
    ping(slot === "start" ? "Opening shot set" : "Final shot set");
  };
  const addWaypoint = () => {
    if (!cam) return;
    const pose = readPose();
    if (!pose) return;
    patchLayer(cam.id, { waypoints: [...(cam.waypoints ?? []), pose] });
    ping("Waypoint added");
  };
  const removeWaypoint = (i: number) => {
    if (!cam) return;
    patchLayer(cam.id, { waypoints: (cam.waypoints ?? []).filter((_, k) => k !== i) });
  };

  const jumpTo = (pose: CameraPose) => {
    const m = mapRef.current?.getMap();
    m?.easeTo({
      center: [pose.lon, pose.lat],
      zoom: Math.max(minZoom, pose.zoom),
      pitch: pose.pitch,
      bearing: pose.bearing,
      duration: 700,
    });
  };
  // Perspective snaps — keep the target, change only the tilt (and reset north).
  const snapPitch = (pitch: number, resetNorth = false) => {
    const m = mapRef.current?.getMap();
    m?.easeTo({ pitch, ...(resetNorth ? { bearing: 0 } : {}), duration: 550 });
  };

  // Live "run the move" — jump to Start, then fly to End so the creator sees the
  // actual camera travel they've framed, right here in the viewfinder.
  const previewMove = () => {
    const m = mapRef.current?.getMap();
    if (!m || !cam) return;
    const s = cam.start, e = cam.end;
    m.jumpTo({ center: [s.lon, s.lat], zoom: Math.max(minZoom, s.zoom), pitch: s.pitch, bearing: s.bearing });
    setTimeout(() => {
      m.flyTo({ center: [e.lon, e.lat], zoom: Math.max(minZoom, e.zoom), pitch: e.pitch, bearing: e.bearing, duration: 2600, essential: true });
    }, 240);
    ping("Playing move…");
  };

  if (!cam) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white/70 text-sm">
        No camera layer to adjust.
        <button onClick={onExit} className="ml-3 rounded-md bg-white/15 px-3 py-1.5 text-xs hover:bg-white/25">Close</button>
      </div>
    );
  }

  const wp = cam.waypoints ?? [];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Map
        ref={mapRef}
        mapStyle={mapStyle as any}
        initialViewState={{
          longitude: seed.lon,
          latitude: seed.lat,
          zoom: Math.max(minZoom, seed.zoom),
          bearing: seed.bearing,
          pitch: seed.pitch,
        }}
        minZoom={minZoom}
        maxPitch={85}
        onLoad={(e) => { try { applyBasemapIdentity(e.target as any, comp.basemap as any, stash.current); } catch {} }}
        onMove={(e) =>
          setView({
            lon: e.viewState.longitude,
            lat: e.viewState.latitude,
            zoom: e.viewState.zoom,
            bearing: e.viewState.bearing,
            pitch: e.viewState.pitch,
          })
        }
        interactive
        dragRotate
        pitchWithRotate
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      />

      {/* ── Top bar: title · search · done ─────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-white backdrop-blur-md ring-1 ring-white/10">
          <Video size={14} className="text-iris" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">Director's viewfinder</span>
        </div>

        {/* Place search */}
        <div className="pointer-events-auto relative w-64">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Fly to a place…"
            className="w-full rounded-lg bg-black/60 py-2 pl-8 pr-3 text-[12px] text-white placeholder:text-white/40 backdrop-blur-md ring-1 ring-white/10 focus:outline-none focus:ring-iris/50"
          />
          {searching && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-iris/70">…</span>}
          {results.length > 0 && (
            <div className="absolute mt-1 w-full overflow-hidden rounded-lg bg-black/85 backdrop-blur-md ring-1 ring-white/10">
              {results.map((r) => (
                <button key={r.id} onClick={() => flyToResult(r)} className="block w-full truncate px-3 py-2 text-left text-[12px] text-white/85 hover:bg-iris/25">
                  {r.shortName ?? r.name} <span className="text-white/40">· {r.placeType}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={onExit}
          className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-950 shadow-lg transition hover:opacity-90"
        >
          <Check size={13} /> Done
        </button>
      </div>

      {/* ── Right rail: perspective gizmo ──────────────────────────────── */}
      <div className="pointer-events-auto absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-xl bg-black/55 p-1.5 backdrop-blur-md ring-1 ring-white/10">
        <GizmoBtn label="Top-down" hint="Straight down (0° tilt)" onClick={() => snapPitch(0, true)}>▔</GizmoBtn>
        <GizmoBtn label="Angle" hint="Cinematic 55° tilt" onClick={() => snapPitch(55)}>◹</GizmoBtn>
        <GizmoBtn label="Low" hint="Dramatic 78° tilt" onClick={() => snapPitch(78)}>◺</GizmoBtn>
        <div className="my-0.5 h-px bg-white/10" />
        <GizmoBtn label="North" hint="Reset bearing to north" onClick={() => { const m = mapRef.current?.getMap(); m?.easeTo({ bearing: 0, duration: 500 }); }}>
          <Compass size={15} />
        </GizmoBtn>
      </div>

      {/* ── Live framing readout + gesture hint (bottom-left) ──────────── */}
      <div className="pointer-events-none absolute bottom-24 left-3 flex flex-col gap-1.5">
        <div className="inline-flex w-fit items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 font-mono text-[10.5px] text-white/80 backdrop-blur-md ring-1 ring-white/10">
          <span>{view.lat.toFixed(3)}, {view.lon.toFixed(3)}</span>
          <span className="text-white/40">|</span>
          <span>z{view.zoom.toFixed(1)}</span>
          <span className="flex items-center gap-1"><Compass size={10} /> {Math.round((view.bearing % 360 + 360) % 360)}°</span>
          <span>↗ {Math.round(view.pitch)}°</span>
        </div>
        <div className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-black/45 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-md ring-1 ring-white/10">
          <MousePointer2 size={11} /> scroll = zoom · drag = pan · right-drag = orbit &amp; tilt
        </div>
      </div>

      {/* ── Flash toast ────────────────────────────────────────────────── */}
      {flash && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-iris px-4 py-1.5 text-[11px] font-semibold text-white shadow-lg">
          {flash} ✓
        </div>
      )}

      {/* ── Bottom command bar: capture + jump ─────────────────────────── */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/75 to-transparent p-3">
        {/* Capture group */}
        <div className="flex items-center gap-1.5 rounded-xl bg-black/55 p-1.5 backdrop-blur-md ring-1 ring-white/10">
          <span className="pl-1.5 pr-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/40">Set this view as</span>
          <CamBtn icon={<Flag size={12} />} label="Opening" onClick={() => setSlot("start")} onDbl={() => jumpTo(cam.start)} />
          <CamBtn icon={<Target size={12} />} label="Final" onClick={() => setSlot("end")} onDbl={() => jumpTo(cam.end)} primary />
          <CamBtn icon={<Plus size={12} />} label="Waypoint" onClick={addWaypoint} />
        </div>

        {/* Jump group */}
        <div className="flex items-center gap-1.5 rounded-xl bg-black/55 p-1.5 backdrop-blur-md ring-1 ring-white/10">
          <span className="pl-1.5 pr-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/40">Go to</span>
          <JumpChip label="Start" onClick={() => jumpTo(cam.start)} />
          <JumpChip label="End" onClick={() => jumpTo(cam.end)} />
          {wp.map((p, i) => (
            <span key={i} className="group inline-flex items-center overflow-hidden rounded-md bg-white/10 text-[11px] text-white/80">
              <button onClick={() => jumpTo(p)} className="py-1 pl-2 pr-1 hover:bg-white/15">W{i + 1}</button>
              <button onClick={() => removeWaypoint(i)} title="Remove waypoint" className="py-1 pr-1.5 pl-0.5 text-white/40 hover:text-red-400">
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={previewMove}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-white/25"
        >
          <Play size={12} /> Preview move
        </button>
      </div>
    </div>
  );
};

/** A capture button. Single click = write the pose; double click = fly there. */
const CamBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; onDbl?: () => void; primary?: boolean }> = ({ icon, label, onClick, onDbl, primary }) => (
  <button
    onClick={onClick}
    onDoubleClick={onDbl}
    title={onDbl ? `Set ${label} · double-click to fly there` : `Set ${label}`}
    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
      primary ? "bg-iris text-white hover:brightness-110" : "bg-white/10 text-white/85 hover:bg-white/20"
    }`}
  >
    {icon} {label}
  </button>
);

const JumpChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">{label}</button>
);

const GizmoBtn: React.FC<{ label: string; hint: string; onClick: () => void; children: React.ReactNode }> = ({ label, hint, onClick, children }) => (
  <button
    onClick={onClick}
    title={hint}
    className="flex h-9 w-9 flex-col items-center justify-center rounded-lg text-white/75 transition hover:bg-white/15 hover:text-white"
  >
    <span className="text-[15px] leading-none">{children}</span>
    <span className="mt-0.5 text-[7.5px] font-semibold uppercase tracking-wide text-white/45">{label}</span>
  </button>
);
