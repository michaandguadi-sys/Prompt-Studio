"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapPin, Upload, Sparkles } from "lucide-react";
import { Field, Input, NumberInput, Select, Section, Slider, Toggle } from "./controls";
import { ColorInput } from "@/components/ui/ColorInput";
import { ColorWheel } from "./ColorWheel";
import { PlaceSearch } from "@/components/MapBuilder/PlaceSearch";
import { MapPicker } from "@/components/MapPicker/MapPicker";
import { cleanCountryGeo } from "@/lib/geoClean";
import { flightArc } from "@/lib/geoArc";
import { useEditor } from "../store/editor";
import { VARIANT_PRESETS, STYLE_PRESETS } from "@/v2/track/presets";
import type { TrackLayer, TrackVariant, TrackStyle } from "@/v2/doc/schema";
import { loadBrandKits, saveBrandKits, type BrandKit } from "@/lib/brandKits";
import { loadAddons, removeAddon as removeAddonStore, type Addon } from "@/lib/addons";
import { TimingControls } from "./TimingControls";
import { ThemePanel } from "./ThemePanel";
import { FONT_CHOICES } from "../doc/themes";
import { LAYER_REGISTRY } from "../layers/registry";
import type { Layer, Look } from "../doc/schema";

const DRIVER_LABEL: Record<string, string> = { camera: "Camera", route: "Route", highlight: "Highlight" };

/**
 * Priority banner for the camera-driving layers (camera / route / highlight).
 * The TOP-most of those in the stack drives the camera motion; the rest still
 * render. Shows whether THIS layer is the driver and lets you promote it.
 */
/** Cinematic camera moves — picking one sets the `style` AND a tasteful base
 *  framing (pitch + a derived wide start), so users never edit raw poses. */
const CAMERA_MOVES: { v: string; label: string; pitch: number }[] = [
  { v: "fly-in", label: "Fly in", pitch: 45 },
  { v: "zoom-out", label: "Pull back", pitch: 30 },
  { v: "orbit", label: "Orbit", pitch: 55 },
  { v: "push-in", label: "Push in", pitch: 60 },
  { v: "pan", label: "Pan", pitch: 25 },
  { v: "hold", label: "Hold", pitch: 0 },
];

const PriorityControl: React.FC<{ layerId: string; type: "camera" | "route" | "highlight" }> = ({ layerId, type }) => {
  const layers = useEditor((s) => s.project.composition.layers);
  const patchLayer = useEditor((s) => s.patchLayer);
  // Camera authority is decoupled from z-order: by default the CAMERA layer
  // frames the scene; a route/highlight can opt in to drive it instead.
  const on = layers.filter((l) => l.enabled);
  const explicit = on.find((l) => (l.type === "route" || l.type === "highlight") && (l as any).framesCamera);
  const me = layers.find((l) => l.id === layerId);
  const framesCamera = !!(me as any)?.framesCamera;

  const setDriver = (drive: boolean) => {
    // Only one layer drives the camera at a time.
    for (const l of layers) {
      if (l.type === "route" || l.type === "highlight") {
        const want = drive && l.id === layerId;
        if (!!(l as any).framesCamera !== want) patchLayer(l.id, { framesCamera: want } as any);
      }
    }
  };

  if (type === "camera") {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-iris/25 bg-iris/5 px-2.5 py-1.5 text-[11px]">
        {explicit
          ? <span className="text-graphite/60"><span className="font-semibold text-graphite/80">{explicit.type === "route" ? "A route" : "A highlight"}</span> is set to drive the camera. Turn its “Drive the camera” off to hand framing back here.</span>
          : <span className="text-iris"><span className="font-semibold">▲ This camera frames the scene</span> — z-order of other layers doesn’t affect it.</span>}
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-lg border border-line bg-paper-100 px-2.5 py-1.5">
      <Toggle label="Drive the camera" checked={framesCamera} onChange={setDriver} />
      <p className="text-[10px] leading-relaxed text-graphite/45">
        {framesCamera ? "This layer is framing the scene (follows / reveals it)." : "Off — the camera layer frames the scene. Position this layer anywhere in the stack."}
      </p>
    </div>
  );
};

const IDENTITY_TF = { offsetXPct: 0, offsetYPct: 0, scale: 1, rotation: 0 };

/** Numeric position / scale / rotation — mirrors the preview drag handles. */
const TransformControls: React.FC<{ t: any; onChange: (tf: any) => void }> = ({ t, onChange }) => {
  const v = { ...IDENTITY_TF, ...(t ?? {}) };
  const touched = v.offsetXPct !== 0 || v.offsetYPct !== 0 || v.scale !== 1 || v.rotation !== 0;
  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-graphite/45">Position & transform</span>
        {touched && <button onClick={() => onChange({ ...IDENTITY_TF })} className="text-[10px] text-graphite/50 hover:text-iris">reset</button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="X offset"><NumberInput value={Math.round(v.offsetXPct)} step={1} min={-100} max={100} unit="%" onChange={(x) => onChange({ ...v, offsetXPct: x })} /></Field>
        <Field label="Y offset"><NumberInput value={Math.round(v.offsetYPct)} step={1} min={-100} max={100} unit="%" onChange={(y) => onChange({ ...v, offsetYPct: y })} /></Field>
        <Field label="Scale"><NumberInput value={Math.round(v.scale * 100)} step={5} min={10} max={500} unit="%" onChange={(s) => onChange({ ...v, scale: s / 100 })} /></Field>
        <Field label="Rotation"><NumberInput value={Math.round(v.rotation)} step={5} min={-180} max={180} unit="°" onChange={(r) => onChange({ ...v, rotation: r })} /></Field>
      </div>
      <div className="text-[10px] text-graphite/40">Tip: drag it directly in the preview to move, scale & rotate.</div>
    </div>
  );
};

/** Font picker shared by text layers — "Theme default" falls back to the project font. */
const FontField: React.FC<{ value: string | null; onChange: (v: string | null) => void }> = ({ value, onChange }) => (
  <Field label="Font" hint="Overrides the theme font">
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Theme default</option>
      {FONT_CHOICES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
    </Select>
  </Field>
);

/**
 * Direct-manipulation positioning: open a full interactive map and click/drag a
 * pin to place a coordinate-anchored layer (label, flag, image, route end). The
 * map opens centred on the layer's current spot, or the camera's framing.
 */
const PickOnMap: React.FC<{
  lon?: number; lat?: number; label?: string; onPick: (lon: number, lat: number) => void;
}> = ({ lon, lat, label = "Place on map", onPick }) => {
  const [open, setOpen] = useState(false);
  const camera = useEditor((s) => s.project.composition.layers.find((l) => l.type === "camera")) as any;
  const hasPos = typeof lon === "number" && typeof lat === "number" && (lon !== 0 || lat !== 0);
  const cLon = hasPos ? (lon as number) : camera?.end?.lon ?? 0;
  const cLat = hasPos ? (lat as number) : camera?.end?.lat ?? 20;
  const cZoom = hasPos ? 6 : Math.max(2.5, (camera?.end?.zoom ?? 4));
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11px] font-medium text-graphite/60 hover:border-iris hover:text-iris transition"
      >
        <MapPin size={12} /> {label}
      </button>
      <MapPicker
        open={open}
        title={label}
        initialLon={cLon}
        initialLat={cLat}
        initialZoom={cZoom}
        defaultMode="pin"
        allowShapes={false}
        onPick={(v) => { onPick(v.lon, v.lat); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

/**
 * Frame the camera's ending shot on a real map: pan / zoom / tilt / rotate to
 * compose the frame, drop a pin on the subject, and capture the FULL pose
 * (centre + zoom + pitch + bearing) — not just a coordinate.
 */
const FrameOnMap: React.FC<{
  lon: number; lat: number; zoom: number; pitch: number; bearing: number;
  onPick: (v: { lon: number; lat: number; zoom: number; pitch: number; bearing: number }) => void;
}> = ({ lon, lat, zoom, pitch, bearing, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11px] font-medium text-graphite/60 hover:border-iris hover:text-iris transition"
      >
        <MapPin size={12} /> Frame the shot on map
      </button>
      <MapPicker
        open={open}
        title="Compose the ending shot — pan, zoom & tilt, then drop a pin"
        initialLon={lon || 0}
        initialLat={lat || 20}
        initialZoom={zoom || 4}
        initialBearing={bearing || 0}
        initialPitch={pitch || 0}
        defaultMode="pin"
        allowShapes={false}
        onPick={(v) => { onPick({ lon: v.lon, lat: v.lat, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing }); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

/**
 * Draw a highlight region directly on a full interactive map — a circle (click +
 * radius) or a freehand polygon (click vertices / Shift-click). Returns the drawn
 * GeoJSON + its centre so the camera can frame it.
 */
const DrawRegionOnMap: React.FC<{ onPick: (geojson: any, center: { lon: number; lat: number }) => void }> = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const camera = useEditor((s) => s.project.composition.layers.find((l) => l.type === "camera")) as any;
  const cLon = camera?.end?.lon ?? 0;
  const cLat = camera?.end?.lat ?? 20;
  const cZoom = Math.max(2.5, camera?.end?.zoom ?? 4);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11px] font-medium text-graphite/60 hover:border-iris hover:text-iris transition"
      >
        <MapPin size={12} /> Draw region on map
      </button>
      <MapPicker
        open={open}
        title="Draw the highlight region"
        initialLon={cLon}
        initialLat={cLat}
        initialZoom={cZoom}
        defaultMode="circle"
        allowShapes
        onPick={(v) => {
          if (v.shape?.geojson) onPick({ type: "Feature", properties: {}, geometry: v.shape.geojson }, { lon: v.lon, lat: v.lat });
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

const DEFAULT_LOOK: Look = { vignette: 0, letterbox: 0, grain: 0, texture: "none", textureOpacity: 0.5, mapFilter: "none", mapFilterAmount: 0.85, tintColor: "#0a1030", tintOpacity: 0, bgColor: "#05060e", gradeShadow: "", gradeShadowAmt: 0.5, gradeMid: "", gradeMidAmt: 0.5, gradeHigh: "", gradeHighAmt: 0.5, showCaptions: false };
// A TIGHT set of DISTINCT looks (no near-duplicates). "Antique map" + "Old paper"
// merged into one Vintage; "Documentary" dropped (it overlapped Cinematic).
const LOOK_PRESETS: { name: string; look: Look }[] = [
  { name: "Clean", look: { ...DEFAULT_LOOK } },
  { name: "Cinematic", look: { ...DEFAULT_LOOK, vignette: 0.55, letterbox: 0.11, grain: 0.18, tintColor: "#0a1030", tintOpacity: 0.18 } },
  { name: "Vintage", look: { ...DEFAULT_LOOK, mapFilter: "antique", mapFilterAmount: 0.95, vignette: 0.58, grain: 0.16, texture: "paper", textureOpacity: 0.78, tintColor: "#6b4a1f", tintOpacity: 0.3, bgColor: "#161009" } },
  { name: "Noir", look: { ...DEFAULT_LOOK, mapFilter: "noir", mapFilterAmount: 0.9, vignette: 0.7, letterbox: 0.13, grain: 0.32, tintColor: "#000814", tintOpacity: 0.25, bgColor: "#000000" } },
  { name: "Blueprint", look: { ...DEFAULT_LOOK, mapFilter: "blueprint", mapFilterAmount: 0.9, vignette: 0.4, texture: "grid", textureOpacity: 0.5, tintColor: "#08203a", tintOpacity: 0.2, bgColor: "#04101f" } },
  { name: "Duotone", look: { ...DEFAULT_LOOK, mapFilter: "duotone", mapFilterAmount: 0.9, vignette: 0.35, grain: 0.08, tintColor: "#2a0a3a", tintOpacity: 0.14, bgColor: "#0a0512" } },
];

/** A mini visual preview of a Look — its grade, texture, vignette + letterbox
 *  rendered in CSS so picking a look feels like picking a film stock. */
const LookSwatch: React.FC<{ lk: Look }> = ({ lk }) => {
  const layers: string[] = [];
  if (lk.texture === "scanlines") layers.push("repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)");
  if (lk.texture === "grid") layers.push("linear-gradient(rgba(255,255,255,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.14) 1px,transparent 1px)");
  if (lk.texture === "halftone") layers.push("radial-gradient(rgba(0,0,0,0.5) 22%, transparent 23%)");
  if (lk.texture === "paper") layers.push("linear-gradient(135deg, rgba(201,163,92,0.55), rgba(243,230,200,0.3))");
  if (lk.tintOpacity > 0) layers.push(`linear-gradient(${lk.tintColor}, ${lk.tintColor})`);
  // A faint "terrain" diagonal so the grade reads against something map-like.
  layers.push("linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, transparent 45%)");
  const bars = Math.round((lk.letterbox ?? 0) * 100);
  return (
    <div className="relative h-10 w-full overflow-hidden rounded-md" style={{ backgroundColor: lk.bgColor, backgroundImage: layers.join(","), backgroundSize: lk.texture === "grid" ? "8px 8px" : lk.texture === "halftone" ? "5px 5px" : undefined }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,${Math.min(0.95, lk.vignette + 0.05)}) 120%)` }} />
      {bars > 0 && (<><div className="absolute inset-x-0 top-0 bg-black" style={{ height: `${bars}%` }} /><div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: `${bars}%` }} /></>)}
    </div>
  );
};

/** Look & grade — film-stock presets + the one-tap map grade + colour wheels up
 *  top; the full fine-control spec lives behind an "Advanced" toggle. */
const LookPanel: React.FC = () => {
  const look = (useEditor((s) => s.project.composition.look) ?? DEFAULT_LOOK) as Look;
  const patchComposition = useEditor((s) => s.patchComposition);
  const proMode = useEditor((s) => s.proMode);
  const set = (patch: Partial<Look>) => patchComposition({ look: { ...look, ...patch } });
  // Pro users default to advanced open; everyone gets an explicit toggle.
  const [advanced, setAdvanced] = useState(proMode);
  return (
    <Section title="Look & grade">
      {/* Distinct one-tap looks */}
      <div className="grid grid-cols-3 gap-1.5">
        {LOOK_PRESETS.map((p) => (
          <button key={p.name} onClick={() => patchComposition({ look: { ...p.look } })}
            title={p.name}
            className="group text-center transition-transform hover:-translate-y-0.5">
            <LookSwatch lk={p.look} />
            <div className="mt-0.5 truncate text-[9px] text-graphite/50 group-hover:text-iris">{p.name}</div>
          </button>
        ))}
      </div>
      {/* 3-way colour wheels — the easy, pro-feeling grade. Drag a band toward a
          hue; the strength slider for that band appears once it's tinted. */}
      <div className="rounded-lg border border-line/60 bg-paper-100/40 px-2.5 pb-2 pt-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-graphite/45">Colour wheels</span>
          {(look.gradeShadow || look.gradeMid || look.gradeHigh) && (
            <button onClick={() => set({ gradeShadow: "", gradeMid: "", gradeHigh: "" })} className="text-[10px] text-graphite/35 transition-colors hover:text-iris">Reset</button>
          )}
        </div>
        <div className="flex items-start justify-around gap-1">
          <ColorWheel label="Shadows" value={look.gradeShadow ?? ""} onChange={(v) => set({ gradeShadow: v })} onClear={() => set({ gradeShadow: "" })} />
          <ColorWheel label="Mids" value={look.gradeMid ?? ""} onChange={(v) => set({ gradeMid: v })} onClear={() => set({ gradeMid: "" })} />
          <ColorWheel label="Highlights" value={look.gradeHigh ?? ""} onChange={(v) => set({ gradeHigh: v })} onClear={() => set({ gradeHigh: "" })} />
        </div>
        <div className="mt-1.5 space-y-1">
          {look.gradeShadow ? <Slider label="Shadow push" value={look.gradeShadowAmt ?? 0.5} onChange={(v) => set({ gradeShadowAmt: v })} /> : null}
          {look.gradeMid ? <Slider label="Mid push" value={look.gradeMidAmt ?? 0.5} onChange={(v) => set({ gradeMidAmt: v })} /> : null}
          {look.gradeHigh ? <Slider label="Highlight push" value={look.gradeHighAmt ?? 0.5} onChange={(v) => set({ gradeHighAmt: v })} /> : null}
        </div>
      </div>
      {/* Advanced — the full spec of adjustments, hidden by default. */}
      <button onClick={() => setAdvanced((a) => !a)}
        className="flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-graphite/60 transition-colors hover:border-iris/40 hover:text-iris">
        <span>Advanced settings — full adjustments</span>
        <span className={`transition-transform ${advanced ? "rotate-90" : ""}`}>›</span>
      </button>
      {advanced && (<>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Texture" hint="Overlay">
          <Select value={look.texture} onChange={(e) => set({ texture: e.target.value as Look["texture"] })}>
            <option value="none">None</option>
            <option value="paper">Old paper</option>
            <option value="halftone">Halftone print</option>
            <option value="scanlines">Scanlines</option>
            <option value="grid">Grid</option>
            <option value="noise">Film noise</option>
          </Select>
        </Field>
        <Field label="Texture amount"><NumberInput value={Math.round((look.textureOpacity ?? 0.5) * 100)} step={5} min={0} max={100} unit="%" onChange={(v) => set({ textureOpacity: v / 100 })} /></Field>
      </div>
      <Field label="Grade amount"><NumberInput value={Math.round((look.mapFilterAmount ?? 0.85) * 100)} step={5} min={0} max={100} unit="%" onChange={(v) => set({ mapFilterAmount: v / 100 })} /></Field>
      <Slider label="Vignette" value={look.vignette} onChange={(v) => set({ vignette: v })} />
      <Slider label="Letterbox bars" value={look.letterbox} min={0} max={0.25} onChange={(v) => set({ letterbox: v })} format={(v) => v <= 0 ? "off" : `${Math.round(v * 100)}%`} />
      <Slider label="Film grain" value={look.grain} onChange={(v) => set({ grain: v })} />
      <Field label="Narration captions">
        <label className="flex items-center gap-2 text-xs text-graphite/70">
          <input type="checkbox" checked={look.showCaptions ?? false} onChange={(e) => set({ showCaptions: e.target.checked })} className="accent-iris" />
          {look.showCaptions ? "Visible" : "Hidden"}
        </label>
      </Field>
      </>)}
    </Section>
  );
};

/**
 * Project-level QUICK ADJUST — brings the GPS-track chip+slider ease to ANY
 * animation: pick a cinematic camera move and tune the essentials right at the
 * top, without hunting for the (Simple-mode-hidden) camera layer. The start
 * framing is derived for you, exactly like the per-layer camera + track panels.
 */
const QuickAdjust: React.FC = () => {
  const cam = useEditor((s) => s.project.composition.layers.find((l) => l.type === "camera")) as any;
  const durationSec = useEditor((s) => s.project.composition.durationSec);
  const patchLayer = useEditor((s) => s.patchLayer);
  const patchComposition = useEditor((s) => s.patchComposition);
  const comp = useEditor((s) => s.project.composition);
  // User-saved presets (look + camera) — localStorage, like folders. Reusable
  // across projects so a creator builds their own visual system once.
  const [presets, setPresets] = useState<any[]>([]);
  useEffect(() => { try { setPresets(JSON.parse(localStorage.getItem("mapanisy-presets") || "[]")); } catch { /* none */ } }, []);
  const savePresets = (next: any[]) => { setPresets(next); try { localStorage.setItem("mapanisy-presets", JSON.stringify(next)); } catch { /* quota */ } };
  if (!cam) return null;
  const applyMove = (m: (typeof CAMERA_MOVES)[number]) => {
    const delta = Math.max(1.5, Math.abs(cam.end.zoom - cam.start.zoom));
    const startZoom = m.v === "zoom-out" ? cam.end.zoom + delta : Math.max(1.4, cam.end.zoom - delta);
    patchLayer(cam.id, { style: m.v, end: { ...cam.end, pitch: m.pitch }, start: { ...cam.start, zoom: m.v === "hold" ? cam.end.zoom : startZoom, pitch: 0, bearing: 0 }, ...(m.v === "hold" ? { moveFraction: 0.2 } : {}) });
  };
  const saveCurrent = () => {
    const name = window.prompt("Name this preset (look + camera)")?.trim();
    if (!name) return;
    const p = { id: "ps_" + Math.random().toString(36).slice(2, 8), name, look: comp.look, styleUrl: (comp.basemap as any)?.styleUrl,
      cam: { style: cam.style, pitch: cam.end.pitch, bearing: cam.end.bearing, startZoom: cam.start.zoom, moveFraction: cam.moveFraction, easing: cam.easing } };
    savePresets([...presets.filter((x) => x.name !== name), p]);
  };
  const applyPreset = (p: any) => {
    if (p.look) patchComposition({ look: { ...p.look }, ...(p.styleUrl ? { basemap: { ...comp.basemap, styleUrl: p.styleUrl } } : {}) });
    if (p.cam) patchLayer(cam.id, { style: p.cam.style, end: { ...cam.end, pitch: p.cam.pitch, bearing: p.cam.bearing }, start: { ...cam.start, zoom: p.cam.startZoom }, moveFraction: p.cam.moveFraction, easing: p.cam.easing });
  };
  const delPreset = (id: string) => savePresets(presets.filter((x) => x.id !== id));
  // Zoom level = the FINAL framing (end zoom). The single most-common fix, so it
  // is always visible. Changing it keeps the chosen move by shifting the start.
  const zoomLabel = (z: number) => z < 3 ? "continent" : z < 4.5 ? "country" : z < 6.5 ? "region" : z < 9.5 ? "city" : z < 13 ? "district" : "streets";
  const setTargetZoom = (z: number) => {
    const moveSize = Math.abs(cam.end.zoom - cam.start.zoom);
    const startZoom = cam.style === "zoom-out" ? z + moveSize : Math.max(1.2, z - moveSize);
    patchLayer(cam.id, { end: { ...cam.end, zoom: z }, start: { ...cam.start, zoom: cam.style === "hold" ? z : startZoom } });
  };
  return (
    <Section title="Camera & motion">
      <Field label="Camera move" hint="how the whole shot moves">
        <div className="grid grid-cols-3 gap-1.5">
          {CAMERA_MOVES.map((m) => (
            <button key={m.v} onClick={() => applyMove(m)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${cam.style === m.v ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/65 hover:border-iris/40"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </Field>
      {/* Always-on zoom — the most common "it's not framed how I expected" fix. */}
      <Slider label="Zoom level" hint="how close the final shot sits" value={cam.end.zoom} min={1} max={16} step={0.2}
        onChange={setTargetZoom} format={(v) => `${v.toFixed(1)} · ${zoomLabel(v)}`} />
      {cam.style !== "hold" && (
        <Slider label="Move size" value={Math.abs(cam.end.zoom - cam.start.zoom)} min={0} max={8} step={0.2}
          onChange={(v) => { const sz = cam.style === "zoom-out" ? cam.end.zoom + v : Math.max(1.4, cam.end.zoom - v); patchLayer(cam.id, { start: { ...cam.start, zoom: sz } }); }}
          format={(v) => (v < 0.3 ? "none" : v < 2 ? "subtle" : v < 4.5 ? "medium" : "big")} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Tilt" value={cam.end.pitch} min={0} max={80} step={1} onChange={(v) => patchLayer(cam.id, { end: { ...cam.end, pitch: v } })} format={(v) => `${Math.round(v)}°`} />
        <Slider label="Pace" value={durationSec} min={2} max={30} step={0.5} onChange={(v) => patchComposition({ durationSec: v })} format={(v) => `${v.toFixed(1)}s`} />
      </div>
      <Field label="My presets" hint="save look + camera, reuse anywhere">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p)}
              onContextMenu={(e) => { e.preventDefault(); if (window.confirm(`Delete preset "${p.name}"?`)) delPreset(p.id); }}
              title={`${p.name} — click to apply, right-click to delete`}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-graphite/70 transition-colors hover:border-iris hover:text-iris">
              {p.name}
            </button>
          ))}
          <button onClick={saveCurrent} className="rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] font-medium text-graphite/50 transition-colors hover:border-iris hover:text-iris">
            + Save current
          </button>
        </div>
      </Field>
    </Section>
  );
};

/**
 * Brand kit — a creator's reusable identity (palette + fonts + grade + logo),
 * saved to localStorage and applied across the editor in one tap, so every
 * animation they make is on-brand. Builds on the existing theme/look + image
 * layer; the logo renders as a screen-anchored watermark.
 */
const BrandKitPanel: React.FC = () => {
  const theme = useEditor((s) => s.project.composition.theme);
  const comp = useEditor((s) => s.project.composition);
  const setTheme = useEditor((s) => s.setTheme);
  const patchComposition = useEditor((s) => s.patchComposition);
  const addLayer = useEditor((s) => s.addLayer);
  const patchLayer = useEditor((s) => s.patchLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const logoRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setKits(loadBrandKits()); }, []);
  const persist = (next: BrandKit[]) => { setKits(next); saveBrandKits(next); };

  const logoLayer = () => comp.layers.find((l) => l.type === "image" && l.name === "Brand logo") as any;
  const setLogo = (url: string | null) => {
    const ex = logoLayer();
    if (url) { if (ex) patchLayer(ex.id, { url }); else addLayer("image", { name: "Brand logo", url, anchor: { kind: "screen", pos: "bottom" }, sizePx: 110, rounded: false } as any); }
    else if (ex) removeLayer(ex.id);
  };

  const apply = (k: BrandKit) => {
    setTheme(k.theme, true);
    if (k.look) patchComposition({ look: { ...comp.look, ...k.look } });
    setLogo(k.logo ?? null);
  };
  const saveCurrent = () => {
    const name = window.prompt("Name this brand kit")?.trim();
    if (!name) return;
    const lk = comp.look as any;
    persist([...kits.filter((k) => k.name !== name), {
      id: "bk_" + Math.random().toString(36).slice(2, 8), name, theme: { ...theme },
      look: { tintColor: lk.tintColor, tintOpacity: lk.tintOpacity, mapFilter: lk.mapFilter, vignette: lk.vignette, gradeShadow: lk.gradeShadow, gradeMid: lk.gradeMid, gradeHigh: lk.gradeHigh },
      logo: logoLayer()?.url,
    }]);
  };
  const onLogoFile = (file: File) => { const r = new FileReader(); r.onload = () => setLogo(String(r.result)); r.readAsDataURL(file); };

  return (
    <Section title="Brand kit">
      <Field label="Your kits" hint="palette · fonts · grade · logo — one tap">
        <div className="flex flex-wrap gap-1.5">
          {kits.map((k) => (
            <button key={k.id} onClick={() => apply(k)}
              onContextMenu={(e) => { e.preventDefault(); if (window.confirm(`Delete brand kit "${k.name}"?`)) persist(kits.filter((x) => x.id !== k.id)); }}
              title={`${k.name} — apply (right-click to delete)`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-graphite/70 transition-colors hover:border-iris hover:text-iris">
              <span className="flex gap-0.5">{[k.theme.accent, k.theme.fill, k.theme.glow].map((c, i) => <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />)}</span>
              {k.name}
            </button>
          ))}
          <button onClick={saveCurrent} className="rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] font-medium text-graphite/50 transition-colors hover:border-iris hover:text-iris">+ Save current</button>
        </div>
      </Field>
      <div className="flex items-center gap-2">
        <button onClick={() => logoRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-graphite/65 transition-colors hover:border-iris hover:text-iris"><Upload size={12} /> {logoLayer() ? "Replace logo" : "Add logo"}</button>
        {logoLayer() && <button onClick={() => setLogo(null)} className="text-[11px] text-graphite/40 hover:text-red-400">remove</button>}
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f); e.currentTarget.value = ""; }} />
      </div>
    </Section>
  );
};

/** The selectable basemaps — a VISUAL picker (thumbnail swatch + name) so the
 *  map style is the first, most obvious choice. Swatches approximate each look. */
const MAP_STYLES: { url: string; name: string; hint: string; swatch: React.CSSProperties }[] = [
  { url: "mapbox://styles/mapbox/dark-v11", name: "Dark", hint: "cinematic default", swatch: { background: "linear-gradient(135deg,#0a0e1a,#121830 60%,#1b2547)" } },
  { url: "mapbox://styles/mapbox/satellite-streets-v12", name: "Satellite", hint: "real imagery", swatch: { background: "linear-gradient(135deg,#243a1c,#3b5a2a 45%,#7a6b3e 75%,#274b63)" } },
  { url: "mapbox://styles/mapbox/light-v11", name: "Light", hint: "clean & bright", swatch: { background: "linear-gradient(135deg,#f4f5f8,#e7ebf2 60%,#d6deea)" } },
  { url: "mapbox://styles/mapbox/outdoors-v12", name: "Terrain", hint: "topographic", swatch: { background: "linear-gradient(135deg,#cfe3b8,#a9cf8e 55%,#8bbf7a)" } },
  { url: "mapbox://styles/mapbox/streets-v12", name: "Streets", hint: "roads & places", swatch: { background: "linear-gradient(135deg,#fbfbf9,#eef0ec 55%,#e3e7df)" } },
  { url: "mapbox://styles/mapbox/navigation-night-v1", name: "Night", hint: "nav, neon roads", swatch: { background: "linear-gradient(135deg,#070b18,#0d1430 55%,#16306b)" } },
  { url: "grid", name: "Grid", hint: "blueprint graticule", swatch: { background: "#0b1c38", backgroundImage: "linear-gradient(rgba(96,170,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(96,170,255,0.5) 1px,transparent 1px)", backgroundSize: "8px 8px" } },
  { url: "https://www.openhistoricalmap.org/map-styles/main/main.json", name: "Historical", hint: "borders by year", swatch: { background: "linear-gradient(135deg,#efe3c4,#dcc89a 55%,#c2a878)" } },
];

/** Map style — the PRIORITY choice: which basemap. Visual thumbnail picker plus
 *  the per-style options (terrain, labels, land/water, historical year). */
const MapStylePanel: React.FC = () => {
  const basemap = useEditor((s) => s.project.composition.basemap);
  const patchComposition = useEditor((s) => s.patchComposition);
  return (
    <Section title="Map style">
      {/* Visual basemap chooser — the first thing you pick. */}
      <div className="grid grid-cols-4 gap-1.5">
        {MAP_STYLES.map((s) => {
          const active = basemap.styleUrl === s.url;
          return (
            <button key={s.url} onClick={() => patchComposition({ basemap: { ...basemap, styleUrl: s.url } })} title={`${s.name} — ${s.hint}`}
              className="group text-center transition-transform hover:-translate-y-0.5">
              <div className={`relative h-11 w-full overflow-hidden rounded-md border ${active ? "border-iris ring-2 ring-iris/40" : "border-black/10"}`} style={s.swatch}>
                {active && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-iris shadow-glow-iris" />}
              </div>
              <div className={`mt-0.5 truncate text-[9px] font-medium ${active ? "text-iris" : "text-graphite/55 group-hover:text-iris"}`}>{s.name}</div>
            </button>
          );
        })}
      </div>
        {/^https?:.*openhistorical/i.test(basemap.styleUrl) && (() => {
          const labelYr = (y: number) => (y < 0 ? `${Math.abs(y)} BC` : `${y}`);
          const yr = parseInt(String(basemap.mapYear || ""), 10);
          const hasYr = Number.isFinite(yr);
          const yrEnd = parseInt(String(basemap.mapYearEnd || ""), 10);
          const animate = Number.isFinite(yrEnd);
          const cur = hasYr ? yr : 1900;
          const setYear = (v: number) => patchComposition({ basemap: { ...basemap, mapYear: String(Math.round(v)) } });
          const setEnd = (v: number | null) => patchComposition({ basemap: { ...basemap, mapYearEnd: v === null ? "" : String(v) } });
          return (
            <div className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-graphite-muted">Map year</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" value={hasYr ? yr : ""} placeholder="all eras" min={-4000} max={2026}
                    onChange={(e) => (e.target.value === "" ? patchComposition({ basemap: { ...basemap, mapYear: "" } }) : setYear(parseInt(e.target.value, 10) || 0))}
                    className="w-20 rounded border border-line bg-white px-2 py-1 text-center text-xs text-graphite focus:border-iris/50 focus:outline-none" />
                  {hasYr && <button onClick={() => patchComposition({ basemap: { ...basemap, mapYear: "", mapYearEnd: "" } })} className="text-[10px] text-graphite/40 hover:text-iris">clear</button>}
                </div>
              </div>
              <input type="range" min={-2000} max={2026} step={1} value={cur} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="w-full accent-iris" />
              <div className="flex items-center justify-between text-[9px] text-graphite/35">
                <span>2000 BC</span>
                <span className="font-mono text-[10px] text-graphite/70">{animate ? `${labelYr(cur)} → ${labelYr(yrEnd)}` : labelYr(cur)}</span>
                <span>2026</span>
              </div>
              <Toggle label="Animate over time (watch history unfold)" checked={animate} onChange={(on) => setEnd(on ? 2000 : null)} />
              {animate && (
                <div className="space-y-1 pl-0.5">
                  <input type="range" min={-2000} max={2026} step={1} value={yrEnd} onChange={(e) => setEnd(parseInt(e.target.value, 10))} className="w-full accent-iris" />
                  <p className="text-[10px] leading-relaxed text-graphite/40">Borders &amp; places morph from <span className="font-mono text-graphite/60">{labelYr(cur)}</span> to <span className="font-mono text-graphite/60">{labelYr(yrEnd)}</span> across the scene.</p>
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-graphite/30">{hasYr ? <>Showing borders, places &amp; routes that existed in <span className="font-mono text-graphite/55">{labelYr(cur)}</span>. </> : <>Set a year to filter the map to that era. </>}Coverage is real OHM data and varies by region/era — sparse for ancient periods. OHM is already historical, so no need to add an Antique grade.</p>
            </div>
          );
        })()}
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="3D terrain" checked={basemap.terrain} onChange={(v) => patchComposition({ basemap: { ...basemap, terrain: v } })} />
          <Toggle label="3D buildings" checked={basemap.buildings3d} onChange={(v) => patchComposition({ basemap: { ...basemap, buildings3d: v } })} />
          <Toggle label="Roads" checked={basemap.showStreets} onChange={(v) => patchComposition({ basemap: { ...basemap, showStreets: v } })} />
        </div>
        <Field label="Labels" hint="What place names show">
          <Select value={(basemap as any).labelDetail ?? (basemap.showLabels ? "cities" : "none")} onChange={(e) => patchComposition({ basemap: { ...basemap, labelDetail: e.target.value as any, showLabels: e.target.value !== "none" } })}>
            <option value="none">None — clean map</option>
            <option value="countries">Countries only</option>
            <option value="cities">Countries + major cities</option>
            <option value="all">All places</option>
          </Select>
        </Field>
        {basemap.terrain && (
          <Slider label="Terrain strength" value={(basemap as any).terrainStrength ?? 1.4} min={0} max={5} step={0.1}
            onChange={(v) => patchComposition({ basemap: { ...basemap, terrainStrength: v } })} format={(v) => `${v.toFixed(1)}×`} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Land colour" hint="the map itself">
            <div className="flex items-center gap-1.5">
              <ColorInput value={(basemap as any).landColor || "#1a1d24"} onChange={(v) => patchComposition({ basemap: { ...basemap, landColor: v } })} />
              {(basemap as any).landColor && <button onClick={() => patchComposition({ basemap: { ...basemap, landColor: "" } })} className="text-[10px] text-graphite/40 hover:text-iris">reset</button>}
            </div>
          </Field>
          <Field label="Water colour">
            <div className="flex items-center gap-1.5">
              <ColorInput value={(basemap as any).waterColor || "#0c2330"} onChange={(v) => patchComposition({ basemap: { ...basemap, waterColor: v } })} />
              {(basemap as any).waterColor && <button onClick={() => patchComposition({ basemap: { ...basemap, waterColor: "" } })} className="text-[10px] text-graphite/40 hover:text-iris">reset</button>}
            </div>
          </Field>
        </div>
        <Toggle label="Transparent background (overlay export)" checked={basemap.transparentBg} onChange={(v) => patchComposition({ basemap: { ...basemap, transparentBg: v } })} />
      </Section>
  );
};

/** AI ADD-ONS — reusable composite features the AI invented (e.g. "Siege"),
 *  saved permanently. One click expands the recipe (geocoding its places) and
 *  drops the layers into the current scene. Hidden until the AI has made some. */
const AddonsPanel: React.FC = () => {
  const addLayers = useEditor((s) => s.addLayers);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setAddons(loadAddons()); }, []);
  if (!addons.length) return null;

  const startApply = (a: Addon) => { setOpen(a.id); setErr(null); const d: Record<string, string> = {}; for (const p of a.params) d[p.key] = p.default ?? ""; setVals(d); };
  const apply = async (a: Addon) => {
    setBusy(a.id); setErr(null);
    try {
      const r = await fetch("/api/v2/addon/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addon: a, values: vals }) });
      const d = await r.json();
      if (!r.ok || !Array.isArray(d.layers) || !d.layers.length) { setErr(d?.error ?? "Couldn't apply — check the place names."); return; }
      addLayers(d.layers);
      setOpen(null);
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
  };
  const del = (id: string) => { setAddons(removeAddonStore(id)); if (open === id) setOpen(null); };

  return (
    <Section title="AI add-ons">
      <p className="-mt-1 mb-1 text-[10px] leading-relaxed text-graphite/45">Reusable features your AI invented. Click to drop one into this scene.</p>
      <div className="space-y-1.5">
        {addons.map((a) => (
          <div key={a.id} className="rounded-lg border border-line bg-paper-50">
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <Sparkles size={12} className="shrink-0 text-iris" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-graphite/85">{a.name}</div>
                {a.description && <div className="truncate text-[10px] text-graphite/45">{a.description}</div>}
              </div>
              <button onClick={() => (open === a.id ? setOpen(null) : startApply(a))} className="shrink-0 rounded-md border border-iris/30 bg-iris/5 px-2 py-1 text-[10px] font-semibold text-iris hover:bg-iris/10">{open === a.id ? "Close" : "Apply"}</button>
              <button onClick={() => del(a.id)} title="Delete add-on" className="shrink-0 p-1 text-graphite/35 hover:text-red-400"><Trash2Icon /></button>
            </div>
            {open === a.id && (
              <div className="space-y-1.5 border-t border-line px-2.5 py-2">
                {a.params.map((p) => (
                  <div key={p.key}>
                    <div className="mb-0.5 text-[10px] font-medium text-graphite-muted">{p.label}</div>
                    {p.type === "place"
                      ? <PlaceSearch size="sm" placeholder={vals[p.key] || "Search a place…"} onPick={(pl) => setVals((v) => ({ ...v, [p.key]: (pl as any).name ?? `${pl.lat.toFixed(2)},${pl.lon.toFixed(2)}` }))} />
                      : <Input value={vals[p.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [p.key]: e.target.value }))} placeholder={p.label} />}
                  </div>
                ))}
                {err && <div className="text-[10px] text-red-400">{err}</div>}
                <button onClick={() => apply(a)} disabled={busy === a.id} className="w-full rounded-md bg-brand py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">{busy === a.id ? "Applying…" : "Add to scene"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
};

/** Tiny inline trash glyph (avoids another lucide import churn). */
const Trash2Icon: React.FC = () => <span className="text-[11px] leading-none">🗑</span>;

/** The project-wide sections shown regardless of selection. Map style is FIRST
 *  (the priority choice), then the camera, then grading, then palette / brand. */
const GlobalSections: React.FC = () => {
  const aspect = useEditor((s) => s.project.composition.aspect);
  const durationSec = useEditor((s) => s.project.composition.durationSec);
  const patchComposition = useEditor((s) => s.patchComposition);
  return (
    <>
      <MapStylePanel />
      <QuickAdjust />
      <AddonsPanel />
      <LookPanel />
      <ThemePanel />
      <BrandKitPanel />

      {/* Scene-level controls always available at the bottom */}
      <Section title="Scene">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration">
            <NumberInput value={durationSec} step={0.5} min={1} max={60} unit="s" onChange={(v) => patchComposition({ durationSec: v })} />
          </Field>
          <Field label="Aspect">
            <Select value={aspect} onChange={(e) => patchComposition({ aspect: e.target.value as any })}>
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Vertical</option>
              <option value="1:1">1:1 Square</option>
            </Select>
          </Field>
        </div>
      </Section>
    </>
  );
};

/** Right-hand inspector — split into LAYER (the selection) and PROJECT (global
 *  palette / look / map / scene) tabs so the global panels aren't scrolled past
 *  on every layer edit. */
export const Inspector: React.FC = () => {
  const selectedId = useEditor((s) => s.selectedId);
  const layers = useEditor((s) => s.project.composition.layers);
  const durationSec = useEditor((s) => s.project.composition.durationSec);
  const patchLayer = useEditor((s) => s.patchLayer);
  const patchTiming = useEditor((s) => s.patchTiming);

  const layer = layers.find((l) => l.id === selectedId);
  const [tab, setTab] = useState<"layer" | "project">("layer");
  // Follow the selection: picking a layer jumps to its controls.
  const lastSel = useRef<string | null>(null);
  if (selectedId && selectedId !== lastSel.current) { lastSel.current = selectedId; if (tab !== "layer") setTab("layer"); }

  const active: "layer" | "project" = layer ? tab : "project";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-black/5 px-2 pt-2 gap-1">
        {([["layer", "Layer"], ["project", "Project"]] as const).map(([id, lbl]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            disabled={id === "layer" && !layer}
            className={[
              "relative flex-1 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors",
              active === id ? "text-graphite" : "text-graphite/40 hover:text-graphite/70",
              id === "layer" && !layer ? "opacity-30 cursor-default" : "",
            ].join(" ")}
          >
            {lbl}
            {active === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {active === "layer" && layer ? (
          <>
            <div className="border-b border-black/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-iris/80">{LAYER_REGISTRY[layer.type].label}</div>
              <input
                value={layer.name}
                onChange={(e) => patchLayer(layer.id, { name: e.target.value })}
                placeholder={LAYER_REGISTRY[layer.type].label}
                className="mt-1 w-full bg-transparent text-base font-semibold text-graphite placeholder:text-graphite/45 focus:outline-none"
              />
            </div>
            <LayerFields layer={layer} set={(patch) => patchLayer(layer.id, patch)} />
            {"timing" in layer && (
              <TimingControls timing={(layer as any).timing} durationSec={durationSec} onChange={(p) => patchTiming(layer.id, p)} />
            )}
          </>
        ) : (
          <>
            {!layer && (
              <div className="px-4 py-4 text-center border-b border-black/5">
                <div className="text-sm text-graphite/45">Project settings</div>
                <div className="text-[11px] text-graphite/40">Select a layer to edit it, or art-direct the whole piece below</div>
              </div>
            )}
            <GlobalSections />
          </>
        )}
      </div>
    </div>
  );
};

/* ── Per-type field blocks ────────────────────────────────────────────────── */

const LayerFields: React.FC<{ layer: Layer; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => {
  switch (layer.type) {
    case "camera":
      return (
        <Section title="Camera move">
          <PriorityControl layerId={layer.id} type="camera" />
          <Field label="Fly to (end shot)" hint="the final framing — search a place or frame it on the map">
            <div className="space-y-1.5">
              <PlaceSearch size="sm" placeholder="Search a place…" onPick={(p) => set({
                end: { lon: p.lon, lat: p.lat, zoom: p.zoom, pitch: 45, bearing: -12 },
                start: { lon: p.lon, lat: p.lat, zoom: Math.max(1.8, p.zoom - 6), pitch: 0, bearing: 0 },
              })} />
              <FrameOnMap
                lon={layer.end.lon} lat={layer.end.lat} zoom={layer.end.zoom} pitch={layer.end.pitch} bearing={layer.end.bearing}
                onPick={(v) => set({
                  end: { lon: v.lon, lat: v.lat, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing },
                  start: { lon: v.lon, lat: v.lat, zoom: Math.max(1.8, v.zoom - 6), pitch: 0, bearing: 0 },
                })}
              />
            </div>
          </Field>
          {/* Explicit START framing — set the opening shot directly (where the
              move BEGINS). Picking a move auto-derives a sensible start, but this
              lets you override both ends of the move precisely. */}
          <Field label="Start framing" hint="the opening shot — where the move begins">
            <FrameOnMap
              lon={layer.start.lon} lat={layer.start.lat} zoom={layer.start.zoom} pitch={layer.start.pitch} bearing={layer.start.bearing}
              onPick={(v) => set({ start: { lon: v.lon, lat: v.lat, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing } })}
            />
          </Field>
          <Field label="Move" hint="Pick a cinematic move — start is auto-set, then tweak above">
            <div className="grid grid-cols-3 gap-1.5">
              {CAMERA_MOVES.map((m) => (
                <button key={m.v} onClick={() => {
                  const delta = Math.max(1.5, Math.abs(layer.end.zoom - layer.start.zoom));
                  const startZoom = m.v === "zoom-out" ? layer.end.zoom + delta : Math.max(1.4, layer.end.zoom - delta);
                  set({ style: m.v, end: { ...layer.end, pitch: m.pitch }, start: { ...layer.start, zoom: m.v === "hold" ? layer.end.zoom : startZoom, pitch: 0, bearing: 0 }, ...(m.v === "hold" ? { moveFraction: 0.2 } : {}) });
                }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${layer.style === m.v ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/65 hover:border-iris/40"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
          {/* Always-on zoom — the most common framing fix. */}
          <Slider label="Zoom level" hint="how close the final shot sits" value={layer.end.zoom} min={1} max={16} step={0.2}
            onChange={(v) => { const moveSize = Math.abs(layer.end.zoom - layer.start.zoom); const startZoom = layer.style === "zoom-out" ? v + moveSize : Math.max(1.2, v - moveSize); set({ end: { ...layer.end, zoom: v }, start: { ...layer.start, zoom: layer.style === "hold" ? v : startZoom } }); }}
            format={(v) => `${v.toFixed(1)}`} />
          {layer.style !== "hold" && (
            <Slider label="Move size" value={Math.abs(layer.end.zoom - layer.start.zoom)} min={0} max={8} step={0.2}
              onChange={(v) => { const startZoom = layer.style === "zoom-out" ? layer.end.zoom + v : Math.max(1.4, layer.end.zoom - v); set({ start: { ...layer.start, zoom: startZoom } }); }}
              format={(v) => (v < 0.3 ? "none" : v < 2 ? "subtle" : v < 4.5 ? "medium" : "big")} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Slider label="Tilt" value={layer.end.pitch} min={0} max={80} step={1} onChange={(v) => set({ end: { ...layer.end, pitch: v } })} format={(v) => `${Math.round(v)}°`} />
            <Slider label="Rotation" value={layer.end.bearing} min={-180} max={180} step={5} onChange={(v) => set({ end: { ...layer.end, bearing: v } })} format={(v) => `${Math.round(v)}°`} />
            <Slider label="Move vs hold" value={layer.moveFraction} min={0.1} max={1} step={0.05} onChange={(v) => set({ moveFraction: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Field label="Ease"><Select value={layer.easing} onChange={(e) => set({ easing: e.target.value })}><option value="easeInOut">Smooth</option><option value="easeOut">Ease out</option><option value="easeIn">Ease in</option><option value="linear">Linear</option><option value="spring">Spring</option></Select></Field>
          </div>

          {/* Optional multi-stop path (only meaningful for travel motions). */}
          {(layer.style === "fly-in" || layer.style === "zoom-out" || layer.style === "push-in") && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-medium text-graphite-muted">
                Camera stops <span className="text-graphite/50">· optional — fly through places</span>
              </div>
              {layer.waypoints.map((wp, wi) => (
                <div key={wi} className="rounded-lg border border-line bg-paper-50 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-graphite/40">Stop {wi + 1}</span>
                    <button onClick={() => set({ waypoints: layer.waypoints.filter((_, i) => i !== wi) })} className="text-graphite/45 hover:text-red-400 text-xs px-1">✕</button>
                  </div>
                  <PlaceSearch size="sm" placeholder={wp.lon || wp.lat ? `${wp.lat.toFixed(1)}, ${wp.lon.toFixed(1)}` : "Search a place…"}
                    onPick={(p) => { const wps = [...layer.waypoints]; wps[wi] = { ...wp, lon: p.lon, lat: p.lat, zoom: p.zoom }; set({ waypoints: wps }); }} />
                  <Field label="Zoom at stop">
                    <NumberInput value={Math.round(wp.zoom * 10) / 10} step={0.5} min={1} max={22}
                      onChange={(v) => { const wps = [...layer.waypoints]; wps[wi] = { ...wp, zoom: v }; set({ waypoints: wps }); }} />
                  </Field>
                </div>
              ))}
              <button
                onClick={() => {
                  const s = layer.start, e = layer.end;
                  const mid = { lon: (s.lon + e.lon) / 2, lat: (s.lat + e.lat) / 2, zoom: (s.zoom + e.zoom) / 2, pitch: Math.round(e.pitch / 2), bearing: 0 };
                  set({ waypoints: [...layer.waypoints, mid], smoothPath: true });
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-[11px] uppercase tracking-wider text-graphite/50 hover:border-iris hover:text-iris transition"
              >
                + Add stop
              </button>
            </div>
          )}
        </Section>
      );

    case "label":
      return (
        <Section title="Label">
          <Field label="Text"><Input value={layer.text} onChange={(e) => set({ text: e.target.value })} /></Field>
          <Field label="Sub-line"><Input value={layer.sub} onChange={(e) => set({ sub: e.target.value })} /></Field>
          <Field label="Style">
            <Select value={layer.variant} onChange={(e) => set({ variant: e.target.value })}>
              <option value="pin">Pin (dot + ring)</option>
              <option value="card">Card</option>
              <option value="banner">Banner (screen)</option>
              <option value="lower-third">Lower third</option>
            </Select>
          </Field>
          {layer.variant !== "banner" && (
            <Field label="Pin a place" hint="Search, or place it directly on the map">
              <div className="space-y-1.5">
                <PlaceSearch size="sm" placeholder="Search city, landmark…" onPick={(p) => set({
                  anchor: { kind: "coord", lon: p.lon, lat: p.lat },
                  ...(layer.text === "LABEL" || !layer.text ? { text: (p.shortName ?? p.name).toUpperCase() } : {}),
                })} />
                <PickOnMap
                  label="Place pin on map"
                  lon={layer.anchor.kind === "coord" ? layer.anchor.lon : undefined}
                  lat={layer.anchor.kind === "coord" ? layer.anchor.lat : undefined}
                  onPick={(lon, lat) => set({ anchor: { kind: "coord", lon, lat } })}
                />
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Color"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
            <Field label="Accent"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={layer.sizePx} step={2} min={16} max={200} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
            <FontField value={layer.fontFamily} onChange={(v) => set({ fontFamily: v })} />
          </div>
          <Slider label="Text shadow" value={(layer as any).shadow ?? 0.55} onChange={(v) => set({ shadow: v })} format={(v) => v <= 0 ? "off" : `${Math.round(v * 100)}%`} />
          <Toggle label="Text outline" checked={(layer as any).outline ?? false} onChange={(v) => set({ outline: v })} />
          <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} />
        </Section>
      );

    case "highlight":
      return <HighlightFields layer={layer} set={set} />;

    case "flag":
      return (
        <Section title="Flag">
          <Field label="Country code (ISO-2)"><Input value={layer.iso} maxLength={2} onChange={(e) => set({ iso: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></Field>
          <Field label="Place" hint="Search, or drop the flag directly on the map">
            <div className="space-y-1.5">
              <PlaceSearch size="sm" placeholder="Search a place…" onPick={(p) => set({ anchor: { lon: p.lon, lat: p.lat }, ...(p.countryISO ? { iso: p.countryISO } : {}) })} />
              <PickOnMap label="Place flag on map" lon={layer.anchor.lon} lat={layer.anchor.lat} onPick={(lon, lat) => set({ anchor: { lon, lat } })} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={layer.sizePx} step={10} min={60} max={500} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
            <Field label="Show code">
              <label className="flex items-center gap-2 text-xs text-graphite/70"><input type="checkbox" checked={layer.showCode} onChange={(e) => set({ showCode: e.target.checked })} className="accent-iris" /> {layer.showCode ? "Yes" : "No"}</label>
            </Field>
          </div>
        </Section>
      );

    case "title":
      return (
        <Section title="Title card">
          <Field label="Title"><Input value={layer.text} onChange={(e) => set({ text: e.target.value })} /></Field>
          <Field label="Kicker / sub"><Input value={layer.sub} onChange={(e) => set({ sub: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Template"><Select value={layer.template} onChange={(e) => set({ template: e.target.value })}><option value="impact">Impact</option><option value="classic">Classic</option><option value="kicker">Kicker</option><option value="split">Split</option></Select></Field>
            <Field label="Position"><Select value={layer.position} onChange={(e) => set({ position: e.target.value })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Align"><Select value={layer.align} onChange={(e) => set({ align: e.target.value })}><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></Select></Field>
            <Field label="Accent"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
          </div>
          <FontField value={layer.fontFamily} onChange={(v) => set({ fontFamily: v })} />
          <Slider label="Text shadow" value={(layer as any).shadow ?? 0.55} onChange={(v) => set({ shadow: v })} format={(v) => v <= 0 ? "off" : `${Math.round(v * 100)}%`} />
          <Toggle label="Text outline" checked={(layer as any).outline ?? false} onChange={(v) => set({ outline: v })} />
          <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} />
        </Section>
      );

    case "route":
      return <RouteFields layer={layer} set={set} />;

    case "chart":
      return (
        <Section title="Data">
          <Field label="Type"><Select value={layer.variant} onChange={(e) => set({ variant: e.target.value })}><option value="counter">Counter</option><option value="bar">Bar</option><option value="line">Line</option></Select></Field>
          {layer.variant === "counter" ? (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Prefix"><Input value={layer.prefix} onChange={(e) => set({ prefix: e.target.value })} /></Field>
              <Field label="Value"><NumberInput value={layer.value} step={1} onChange={(v) => set({ value: v })} /></Field>
              <Field label="Suffix"><Input value={layer.suffix} onChange={(e) => set({ suffix: e.target.value })} /></Field>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-graphite/40">Data points</div>
              {layer.series.map((pt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={pt.label} onChange={(e) => { const s = [...layer.series]; s[i] = { ...pt, label: e.target.value }; set({ series: s }); }} placeholder="Label" className="min-w-0 flex-1 rounded bg-paper-50 border border-line px-2 py-1 text-xs text-graphite" />
                  <input type="number" value={pt.value} onChange={(e) => { const s = [...layer.series]; s[i] = { ...pt, value: Number(e.target.value) }; set({ series: s }); }} className="w-20 rounded bg-paper-50 border border-line px-2 py-1 text-xs text-graphite" />
                  <button onClick={() => set({ series: layer.series.filter((_, idx) => idx !== i) })} className="text-graphite/45 hover:text-red-400 text-xs px-1">✕</button>
                </div>
              ))}
              <button onClick={() => set({ series: [...layer.series, { label: `Item ${layer.series.length + 1}`, value: 50 }] })} className="w-full rounded-md border border-dashed border-line py-1.5 text-[11px] uppercase tracking-wider text-graphite/50 hover:border-iris hover:text-iris transition">+ Add data point</button>
            </div>
          )}
          <Field label="Accent"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Count time"><NumberInput value={(layer as any).countSec ?? 1.5} step={0.1} min={0.2} max={12} unit="s" onChange={(v) => set({ countSec: v } as any)} /></Field>
            <Field label="Easing">
              <Select value={(layer as any).countEasing ?? "easeOut"} onChange={(e) => set({ countEasing: e.target.value } as any)}>
                <option value="linear">Linear</option>
                <option value="easeIn">Ease in</option>
                <option value="easeOut">Ease out</option>
                <option value="easeInOut">Ease in-out</option>
              </Select>
            </Field>
            <Field label="Decimals"><NumberInput value={(layer as any).decimals ?? 0} step={1} min={0} max={4} onChange={(v) => set({ decimals: v } as any)} /></Field>
          </div>
        </Section>
      );

    case "image":
      return (
        <Section title="Image">
          <Field label="Image URL"><Input value={layer.url} placeholder="https://…" onChange={(e) => set({ url: e.target.value })} /></Field>
          <Field label="Pin a place" hint="Search, or place it directly on the map">
            <div className="space-y-1.5">
              <PlaceSearch size="sm" placeholder="Anchor on the map…" onPick={(p) => set({ anchor: { kind: "coord", lon: p.lon, lat: p.lat } })} />
              <PickOnMap
                label="Place on map"
                lon={layer.anchor.kind === "coord" ? layer.anchor.lon : undefined}
                lat={layer.anchor.kind === "coord" ? layer.anchor.lat : undefined}
                onPick={(lon, lat) => set({ anchor: { kind: "coord", lon, lat } })}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={layer.sizePx} step={10} min={40} max={600} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
            <Field label="Round"><label className="flex items-center gap-2 text-xs text-graphite/70"><input type="checkbox" checked={layer.rounded} onChange={(e) => set({ rounded: e.target.checked })} className="accent-iris" /> {layer.rounded ? "Circle" : "Square"}</label></Field>
          </div>
        </Section>
      );

    case "marker":
      return <MarkerFields layer={layer} set={set} />;

    case "annotation":
      return <AnnotationFields layer={layer} set={set} />;

    case "connections":
      return <ConnectionsFields layer={layer} set={set} />;

    case "spotlight":
      return <SpotlightFields layer={layer} set={set} />;

    case "track":
      return <TrackFields layer={layer} set={set} />;

    default:
      return null;
  }
};

/* ── Track (imported GPS flythrough) — slider-first, no editing knowledge needed ── */
const TrackFields: React.FC<{ layer: TrackLayer; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => {
  const patchComposition = useEditor((s) => s.patchComposition);
  const comp = useEditor((s) => s.project.composition);
  const km = (layer.stats?.distanceM ?? 0) / 1000;

  // Picking a variant re-applies its recommended pitch + terrain; picking a style
  // re-applies its token bundle + basemap + backdrop. Individual values below stay
  // editable afterward — this is the "good by default, tweak if you want" contract.
  const applyVariant = (v: TrackVariant) => {
    const vp = VARIANT_PRESETS[v];
    set({ variant: v, pitch: vp.pitch });
    patchComposition({ basemap: { ...comp.basemap, terrain: vp.terrain && layer.hasElevation } });
  };
  const applyStyle = (s: TrackStyle) => {
    const sb = STYLE_PRESETS[s];
    set({ style: s, routeColor: sb.routeColor, routeGlow: sb.routeGlow, routeWidth: sb.routeWidth, trailColor: sb.trailColor, dotColor: sb.dotColor });
    patchComposition({ basemap: { ...comp.basemap, styleUrl: sb.baseStyleUrl }, look: { ...comp.look, bgColor: sb.bgColor } });
  };
  const setLabels = (p: Partial<TrackLayer["labels"]>) => set({ labels: { ...layer.labels, ...p } });

  return (
    <>
      <Section title="Flythrough">
        <Field label="Camera" hint={VARIANT_PRESETS[layer.variant]?.blurb}>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(VARIANT_PRESETS) as TrackVariant[]).map((v) => {
              const dis = VARIANT_PRESETS[v].terrain && !layer.hasElevation;
              return (
                <button key={v} disabled={dis} onClick={() => applyVariant(v)}
                  title={dis ? "Needs elevation data" : VARIANT_PRESETS[v].blurb}
                  className={`rounded-lg border px-2 py-1.5 text-left text-[12px] font-medium transition-colors ${layer.variant === v ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/70 hover:border-iris/40"} ${dis ? "opacity-40 cursor-not-allowed" : ""}`}>
                  {VARIANT_PRESETS[v].label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Look">
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(STYLE_PRESETS) as TrackStyle[]).map((s) => (
              <button key={s} onClick={() => applyStyle(s)}
                className={`overflow-hidden rounded-lg border text-center transition-colors ${layer.style === s ? "border-iris" : "border-line hover:border-iris/40"}`}>
                <div className="h-6 w-full" style={{ background: STYLE_PRESETS[s].bgColor }}>
                  <div className="h-full w-full" style={{ background: `linear-gradient(90deg, transparent, ${STYLE_PRESETS[s].routeGlow}77)` }} />
                </div>
                <div className="px-0.5 py-0.5 text-[9px] font-medium capitalize text-graphite/60">{s.replace("-", " ")}</div>
              </button>
            ))}
          </div>
        </Field>
        <Slider label="Playback speed" value={layer.speed} min={0.2} max={4} step={0.1} onChange={(v) => set({ speed: v })} format={(v) => `${v.toFixed(1)}×`} />
        <div className="grid grid-cols-2 gap-2">
          <Slider label="Trim start" value={layer.trimStart} min={0} max={0.95} onChange={(v) => set({ trimStart: Math.min(v, layer.trimEnd - 0.05) })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Trim end" value={layer.trimEnd} min={0.05} max={1} onChange={(v) => set({ trimEnd: Math.max(v, layer.trimStart + 0.05) })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>

      <Section title="Route line">
        <Slider label="Line width" value={layer.routeWidth} min={1} max={24} step={0.5} onChange={(v) => set({ routeWidth: v })} format={(v) => `${v.toFixed(0)}px`} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Line"><ColorInput value={layer.routeColor} onChange={(v) => set({ routeColor: v })} /></Field>
          <Field label="Glow"><ColorInput value={layer.routeGlow} onChange={(v) => set({ routeGlow: v })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Path ahead"><ColorInput value={layer.trailColor} onChange={(v) => set({ trailColor: v })} /></Field>
          <Field label="Moving dot"><ColorInput value={layer.dotColor} onChange={(v) => set({ dotColor: v })} /></Field>
        </div>
        <Toggle label="Show moving dot" checked={layer.showDot} onChange={(v) => set({ showDot: v })} />
      </Section>

      <Section title="Camera fine-tune">
        <Slider label="Tilt" value={layer.pitch} min={0} max={80} step={1} onChange={(v) => set({ pitch: v })} format={(v) => `${Math.round(v)}°`} />
        <Slider label="Zoom" value={layer.zoomOffset} min={-3} max={3} step={0.1} onChange={(v) => set({ zoomOffset: v })} format={(v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))} />
        <Slider label="Rotate" value={layer.bearingOffset} min={-180} max={180} step={1} onChange={(v) => set({ bearingOffset: v })} format={(v) => `${Math.round(v)}°`} />
      </Section>

      <Section title="Labels">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Toggle label="Start pin" checked={layer.labels.start} onChange={(v) => setLabels({ start: v })} />
          <Toggle label="Finish pin" checked={layer.labels.end} onChange={(v) => setLabels({ end: v })} />
          <Toggle label="Distance" checked={layer.labels.distance} onChange={(v) => setLabels({ distance: v })} />
          {layer.hasElevation && <Toggle label="Ascent" checked={layer.labels.elevation} onChange={(v) => setLabels({ elevation: v })} />}
        </div>
        {(layer.labels.start || layer.labels.end) && (
          <div className="grid grid-cols-2 gap-2">
            {layer.labels.start && <Field label="Start text"><Input value={layer.startLabel} onChange={(e) => set({ startLabel: e.target.value })} /></Field>}
            {layer.labels.end && <Field label="Finish text"><Input value={layer.endLabel} onChange={(e) => set({ endLabel: e.target.value })} /></Field>}
          </div>
        )}
        <div className="mt-1 rounded-lg bg-paper-50 px-3 py-2 text-[11px] text-graphite/45">
          {km.toFixed(1)} km{layer.hasElevation ? ` · ↑${Math.round(layer.stats.ascentM)} m` : ""}{layer.stats.durationS ? ` · ${Math.round(layer.stats.durationS / 60)} min` : ""} · from {layer.sourceName || "import"}
        </div>
      </Section>
    </>
  );
};

/** Curated symbol palette — id → emoji glyph (mirrors MapComposition). */
const MARKER_GLYPHS: { v: string; g: string; label: string }[] = [
  { v: "swords", g: "⚔️", label: "Crossed swords" }, { v: "explosion", g: "💥", label: "Explosion" },
  { v: "fire", g: "🔥", label: "Fire" }, { v: "skull", g: "💀", label: "Skull" },
  { v: "alert", g: "⚠️", label: "Alert" }, { v: "radiation", g: "☢️", label: "Radiation" },
  { v: "biohazard", g: "☣️", label: "Biohazard" }, { v: "crown", g: "👑", label: "Crown" },
  { v: "anchor", g: "⚓", label: "Anchor" }, { v: "plane", g: "✈️", label: "Plane" },
  { v: "tank", g: "🛡️", label: "Military" }, { v: "ship", g: "🚢", label: "Ship" },
  { v: "oil", g: "🛢️", label: "Oil" }, { v: "money", g: "💰", label: "Money" },
  { v: "factory", g: "🏭", label: "Industry" }, { v: "landmark", g: "🏛️", label: "Landmark" },
  { v: "flag", g: "🚩", label: "Flag" }, { v: "pin", g: "📍", label: "Pin" },
  { v: "dot", g: "●", label: "Dot" }, { v: "target", g: "🎯", label: "Target" },
  { v: "arrow", g: "➤", label: "Arrow" }, { v: "star", g: "⭐", label: "Star" },
  { v: "cross", g: "✝️", label: "Cross" }, { v: "heart", g: "❤️", label: "Heart" },
];

const MarkerFields: React.FC<{ layer: Extract<Layer, { type: "marker" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Marker / Icon">
    <Field label="Drop on a place" hint="Search, or place it directly on the map">
      <div className="space-y-1.5">
        <PlaceSearch size="sm" placeholder="Search city, border, landmark…" onPick={(p) => set({ anchor: { lon: p.lon, lat: p.lat } })} />
        <PickOnMap label="Place icon on map" lon={layer.anchor.lon} lat={layer.anchor.lat} onPick={(lon, lat) => set({ anchor: { lon, lat } })} />
      </div>
    </Field>
    <Field label="Symbol" hint="Tell the story at a glance">
      <div className="grid grid-cols-8 gap-1">
        {MARKER_GLYPHS.map((ic) => (
          <button key={ic.v} title={ic.label} onClick={() => set({ icon: ic.v, emoji: "" })}
            className={`flex h-8 items-center justify-center rounded-md border text-lg leading-none transition ${layer.icon === ic.v && !layer.emoji ? "border-iris bg-iris/10" : "border-line hover:border-iris/60"}`}>
            {ic.g}
          </button>
        ))}
      </div>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Custom emoji" hint="Overrides the symbol"><Input value={layer.emoji} placeholder="e.g. 🛢️" onChange={(e) => set({ emoji: e.target.value })} /></Field>
      <Field label="Label" hint="Caption beneath"><Input value={layer.label} onChange={(e) => set({ label: e.target.value })} /></Field>
    </div>
    <Field label="Entrance">
      <Select value={layer.animation} onChange={(e) => set({ animation: e.target.value })}>
        <option value="pop">Pop in</option>
        <option value="drop">Drop in</option>
        <option value="pulse">Pulse</option>
        <option value="throb">Throb (breathe)</option>
        <option value="spin">Spin in</option>
        <option value="flash">Flash</option>
        <option value="none">None</option>
      </Select>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Size"><NumberInput value={layer.sizePx} step={5} min={16} max={400} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
      <Field label="Tint" hint="Ring & glow"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
    </div>
    <Slider label="Glow" value={layer.glow} min={0} max={1.5} onChange={(v) => set({ glow: v })} />
    <div className="grid grid-cols-2 gap-2">
      <Toggle label="Locator ring" checked={layer.ring} onChange={(v) => set({ ring: v })} />
      <Field label="Label colour"><ColorInput value={layer.labelColor} onChange={(v) => set({ labelColor: v })} /></Field>
    </div>
    <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} />
  </Section>
);

const AnnotationFields: React.FC<{ layer: Extract<Layer, { type: "annotation" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Annotation callout">
    <Field label="Text"><Input value={layer.text} onChange={(e) => set({ text: e.target.value })} /></Field>
    <Field label="Sub-line"><Input value={layer.sub} onChange={(e) => set({ sub: e.target.value })} /></Field>
    <Field label="Point at" hint="The exact spot the line points to">
      <div className="space-y-1.5">
        <PlaceSearch size="sm" placeholder="Search a place…" onPick={(p) => set({ anchor: { lon: p.lon, lat: p.lat } })} />
        <PickOnMap label="Place target on map" lon={layer.anchor.lon} lat={layer.anchor.lat} onPick={(lon, lat) => set({ anchor: { lon, lat } })} />
      </div>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Box side"><Select value={layer.side} onChange={(e) => set({ side: e.target.value })}><option value="auto">Auto</option><option value="top">Above</option><option value="bottom">Below</option><option value="left">Left</option><option value="right">Right</option></Select></Field>
      <Field label="Box style"><Select value={layer.boxStyle} onChange={(e) => set({ boxStyle: e.target.value })}><option value="card">Card</option><option value="bracket">Bracket</option><option value="underline">Underline</option><option value="none">Text only</option></Select></Field>
    </div>
    <Slider label="Distance" value={layer.distance} min={0} max={60} onChange={(v) => set({ distance: v })} format={(v) => `${Math.round(v)}%`} />
    <div className="grid grid-cols-2 gap-2">
      <Field label="Text colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="Accent" hint="Line + box edge"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Size"><NumberInput value={layer.sizePx} step={2} min={14} max={160} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
      <Toggle label="Draw line in" checked={layer.draw} onChange={(v) => set({ draw: v })} />
    </div>
    <FontField value={layer.fontFamily} onChange={(v) => set({ fontFamily: v })} />
    <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} />
  </Section>
);

const ConnectionsFields: React.FC<{ layer: Extract<Layer, { type: "connections" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Connections / network">
    <Field label="Mode" hint="How the nodes link up">
      <Select value={layer.mode} onChange={(e) => set({ mode: e.target.value })}>
        <option value="hub">Hub &amp; spoke (one centre → many)</option>
        <option value="chain">Chain (A → B → C in order)</option>
      </Select>
    </Field>
    {layer.mode === "hub" && (
      <Field label="Hub / centre" hint="Everything links to this place">
        <div className="space-y-1.5">
          <PlaceSearch size="sm" placeholder="Search the hub…" onPick={(p) => set({ hub: { lon: p.lon, lat: p.lat, name: p.shortName ?? p.name } })} />
          {layer.hub && <div className="text-[10px] text-graphite/50">Hub: {layer.hub.name ?? `${layer.hub.lat.toFixed(1)}, ${layer.hub.lon.toFixed(1)}`}</div>}
        </div>
      </Field>
    )}
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-graphite-muted">Places <span className="text-graphite/50">· {layer.mode === "hub" ? "spokes" : "in order"}</span></div>
      {layer.points.map((pt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-[10px] text-graphite/40 w-4">{i + 1}</span>
          <div className="min-w-0 flex-1"><PlaceSearch size="sm" placeholder={pt.name ?? `${pt.lat.toFixed(1)}, ${pt.lon.toFixed(1)}`} onPick={(p) => { const pts = [...layer.points]; pts[i] = { lon: p.lon, lat: p.lat, name: p.shortName ?? p.name }; set({ points: pts }); }} /></div>
          <button onClick={() => set({ points: layer.points.filter((_, idx) => idx !== i) })} className="text-graphite/45 hover:text-red-400 text-xs px-1">✕</button>
        </div>
      ))}
      <PlaceSearch size="sm" placeholder="+ Add a place…" onPick={(p) => set({ points: [...layer.points, { lon: p.lon, lat: p.lat, name: p.shortName ?? p.name }] })} />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="Node colour"><ColorInput value={layer.dotColor} onChange={(v) => set({ dotColor: v })} /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Line width"><NumberInput value={layer.width} step={1} min={1} max={40} unit="px" onChange={(v) => set({ width: v })} /></Field>
      <Field label="Pattern"><Select value={layer.dashStyle} onChange={(e) => set({ dashStyle: e.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></Select></Field>
    </div>
    <Slider label="Arc bow" value={layer.curve} onChange={(v) => set({ curve: v })} />
    <Slider label="Glow" value={layer.glow} min={0} max={1.5} onChange={(v) => set({ glow: v })} />
    <Slider label="Stagger" value={layer.stagger} onChange={(v) => set({ stagger: v })} />
    <Field label="Reveal"><Select value={layer.reveal} onChange={(e) => set({ reveal: e.target.value })}><option value="draw">Draw on</option><option value="grow">Grow</option><option value="fade">Fade</option><option value="static">Static</option></Select></Field>
    <div className="grid grid-cols-2 gap-2">
      <Toggle label="Node dots" checked={layer.dots} onChange={(v) => set({ dots: v })} />
      <Toggle label="Place labels" checked={layer.showLabels} onChange={(v) => set({ showLabels: v })} />
    </div>
  </Section>
);

const SpotlightFields: React.FC<{ layer: Extract<Layer, { type: "spotlight" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Spotlight focus">
    <Field label="Focus on" hint="The circle stays lit; everything else dims">
      <div className="space-y-1.5">
        <PlaceSearch size="sm" placeholder="Search a place…" onPick={(p) => set({ anchor: { lon: p.lon, lat: p.lat } })} />
        <PickOnMap label="Centre on map" lon={layer.anchor.lon} lat={layer.anchor.lat} onPick={(lon, lat) => set({ anchor: { lon, lat } })} />
      </div>
    </Field>
    <Slider label="Radius" value={layer.radiusPct} min={2} max={90} onChange={(v) => set({ radiusPct: v })} format={(v) => `${Math.round(v)}%`} />
    <Slider label="Dim surroundings" value={layer.dim} onChange={(v) => set({ dim: v })} />
    <Slider label="Edge softness" value={layer.feather} onChange={(v) => set({ feather: v })} />
    <div className="grid grid-cols-2 gap-2">
      <Field label="Dim colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="Ring colour"><ColorInput value={layer.ringColor} onChange={(v) => set({ ringColor: v })} /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Toggle label="Edge ring" checked={layer.ring} onChange={(v) => set({ ring: v })} />
      <Toggle label="Pulse" checked={layer.pulse} onChange={(v) => set({ pulse: v })} />
    </div>
  </Section>
);

/* ── Route resolves its path via /api/route when From + To are set ────────── */

const RouteFields: React.FC<{ layer: Extract<Layer, { type: "route" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => {
  const [busy, setBusy] = useState(false);

  // Straight great-circle path between two points (used by pathStyle="direct").
  const directGC = (from: { lon: number; lat: number }, to: { lon: number; lat: number }, n = 64): [number, number][] => {
    const toR = (d: number) => (d * Math.PI) / 180, toD = (r: number) => (r * 180) / Math.PI;
    const lo1 = toR(from.lon), la1 = toR(from.lat), lo2 = toR(to.lon), la2 = toR(to.lat);
    const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
    if (!isFinite(d) || d < 1e-9) return [[from.lon, from.lat], [to.lon, to.lat]];
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      const z = A * Math.sin(la1) + B * Math.sin(la2);
      out.push([toD(Math.atan2(y, x)), toD(Math.atan2(z, Math.hypot(x, y)))]);
    }
    return out;
  };

  const resolve = async (from: { lon: number; lat: number }, to: { lon: number; lat: number }, transport: string, pathStyle = layer.pathStyle) => {
    // "Direct" = a straight line, for ANY vehicle (incl. aircraft → no arc).
    if (pathStyle === "direct") { set({ coordinates: directGC(from, to) }); return; }
    // Otherwise each vehicle follows its own map: aircraft bows into a flight arc,
    // boat stays on water, driving/walking/cycling follow their paths (server).
    if (transport === "aircraft") { set({ coordinates: flightArc([from.lon, from.lat], [to.lon, to.lat]) }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, transport }),
      });
      const d = await r.json();
      if (Array.isArray(d.coordinates) && d.coordinates.length > 1) set({ coordinates: d.coordinates });
    } catch { /* ignore */ }
    setBusy(false);
  };

  // One leg's coordinates (direct / flight arc / road-or-sea via the server).
  const segCoords = async (a: any, b: any, transport: string, pathStyle: string): Promise<[number, number][]> => {
    if (pathStyle === "direct") return directGC(a, b);
    if (transport === "aircraft") return flightArc([a.lon, a.lat], [b.lon, b.lat]) as [number, number][];
    try {
      const r = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: a, to: b, transport }) });
      const d = await r.json();
      if (Array.isArray(d.coordinates) && d.coordinates.length > 1) return d.coordinates;
    } catch { /* fall back below */ }
    return directGC(a, b);
  };
  // Resolve the FULL journey through from → via[] → to (chained legs).
  const resolveFull = async (from: any, to: any, via: any[], transport: string, pathStyle = layer.pathStyle) => {
    if (!via || via.length === 0) return resolve(from, to, transport, pathStyle);
    setBusy(true);
    const pts = [from, ...via, to];
    const all: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = await segCoords(pts[i], pts[i + 1], transport, pathStyle as any);
      all.push(...(i > 0 ? seg.slice(1) : seg)); // drop the duplicate join vertex
    }
    if (all.length > 1) set({ coordinates: all });
    setBusy(false);
  };
  const reResolve = (patch: { from?: any; to?: any; via?: any[]; transport?: string; pathStyle?: string }) => {
    const from = patch.from ?? layer.from, to = patch.to ?? layer.to, via = patch.via ?? layer.via;
    if (from && to) resolveFull(from, to, via, patch.transport ?? layer.transport, (patch.pathStyle ?? layer.pathStyle) as any);
  };

  const pickFrom = (p: any) => { const from = { lon: p.lon, lat: p.lat, name: p.shortName }; set({ from }); reResolve({ from }); };
  const pickTo = (p: any) => { const to = { lon: p.lon, lat: p.lat, name: p.shortName }; set({ to }); reResolve({ to }); };
  const changeTransport = (t: string) => { set({ transport: t }); reResolve({ transport: t }); };
  const changePath = (ps: string) => { set({ pathStyle: ps }); reResolve({ pathStyle: ps }); };

  // ── Via stops ──
  const addStop = (p: any) => { const via = [...(layer.via ?? []), { lon: p.lon, lat: p.lat, name: p.shortName ?? p.name, pauseSec: 0, weight: 1 }]; set({ via }); reResolve({ via }); };
  const patchStop = (i: number, patch: any, reroute = false) => {
    const via = (layer.via ?? []).map((v, k) => (k === i ? { ...v, ...patch } : v));
    set({ via }); if (reroute) reResolve({ via });
  };
  const removeStop = (i: number) => { const via = (layer.via ?? []).filter((_, k) => k !== i); set({ via }); reResolve({ via }); };
  // Picking a VEHICLE also routes it on the right map (plane→arc, boat→water,
  // car/truck/train→roads, walk/run→foot paths, bike→cycle paths).
  const VEHICLE_TRANSPORT: Record<string, string> = {
    car: "driving", truck: "driving", train: "driving",
    plane: "aircraft", rocket: "aircraft", heli: "aircraft",
    boat: "boat", ship: "boat",
    walk: "walking", run: "walking", bike: "cycling",
  };
  const pickVehicle = (icon: string) => {
    const t = VEHICLE_TRANSPORT[icon];
    if (t && icon !== "none" && icon !== "pin") {
      set({ icon, transport: t });
      if (layer.from && layer.to) resolve(layer.from, layer.to, t);
    } else {
      set({ icon });
    }
  };

  const resolved = layer.coordinates.length > 1;
  return (
    <Section title="Route">
      <PriorityControl layerId={layer.id} type="route" />
      <Field label="From" hint={layer.from?.name}>
        <div className="space-y-1.5">
          <PlaceSearch size="sm" placeholder="Start place…" onPick={pickFrom} />
          <PickOnMap label="Place start on map" lon={layer.from?.lon} lat={layer.from?.lat} onPick={(lon, lat) => pickFrom({ lon, lat })} />
        </div>
      </Field>
      {/* Multi-stop journey — stops the route passes through, each with an
          optional pause + a leg time-weight (% of the journey it takes). */}
      {(layer.via?.length ?? 0) > 0 && (
        <div className="space-y-1.5 rounded-lg border border-line bg-paper-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-graphite/45">Stops along the way</div>
          {(layer.via ?? []).map((v, i) => (
            <div key={i} className="space-y-1 rounded-md border border-line/70 bg-white/60 p-2">
              <div className="flex items-center justify-between">
                <span className="truncate text-[11px] font-medium text-graphite/70">{i + 1}. {v.name || `${v.lat.toFixed(1)}, ${v.lon.toFixed(1)}`}</span>
                <button onClick={() => removeStop(i)} className="text-graphite/40 hover:text-red-400 text-xs px-1">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Slider label="Pause" value={(v as any).pauseSec ?? 0} min={0} max={6} step={0.2} onChange={(val) => patchStop(i, { pauseSec: val })} format={(val) => val <= 0 ? "none" : `${val.toFixed(1)}s`} />
                <Slider label="Leg %" value={(v as any).weight ?? 1} min={0.2} max={4} step={0.1} onChange={(val) => patchStop(i, { weight: val })} format={(val) => `${val.toFixed(1)}×`} />
              </div>
            </div>
          ))}
          <PlaceSearch size="sm" placeholder="+ Add a stop…" onPick={addStop} />
        </div>
      )}
      <Field label="To" hint={layer.to?.name}>
        <div className="space-y-1.5">
          <PlaceSearch size="sm" placeholder="End place…" onPick={pickTo} />
          <PickOnMap label="Place end on map" lon={layer.to?.lon} lat={layer.to?.lat} onPick={(lon, lat) => pickTo({ lon, lat })} />
          {(layer.via?.length ?? 0) === 0 && layer.from && layer.to && (
            <PlaceSearch size="sm" placeholder="+ Add a stop in between (multi-stop)…" onPick={addStop} />
          )}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Path" hint="Follow roads/sea, or a straight line">
          <Select value={layer.pathStyle ?? "auto"} onChange={(e) => changePath(e.target.value)}>
            <option value="auto">Follow roads / sea</option>
            <option value="direct">Direct line</option>
          </Select>
        </Field>
        <Field label="Direction"><Select value={layer.direction ?? "forward"} onChange={(e) => set({ direction: e.target.value })}><option value="forward">Start → End</option><option value="reverse">End → Start</option></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Transport"><Select value={layer.transport} onChange={(e) => changeTransport(e.target.value)} disabled={(layer.pathStyle ?? "auto") === "direct"}><option value="driving">Driving</option><option value="walking">Walking</option><option value="cycling">Cycling</option><option value="boat">Boat</option><option value="aircraft">Aircraft</option></Select></Field>
        <Field label="Reveal"><Select value={layer.reveal === "dotted" ? "draw" : layer.reveal} onChange={(e) => set({ reveal: e.target.value })}><option value="draw">Draw on</option><option value="grow">Grow in</option><option value="fade">Fade in</option><option value="pulse">Pulse</option><option value="static">Static</option></Select></Field>
      </div>
      <Field label="Camera (when priority)" hint="How the camera moves if this route is on top">
        <Select value={layer.cameraMode ?? "follow"} onChange={(e) => set({ cameraMode: e.target.value })}>
          <option value="follow">Follow the vehicle</option>
          <option value="frame">Frame the whole journey</option>
          <option value="chase">Chase (turn into each leg)</option>
          <option value="orbit">Orbit the journey</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
        <Field label="Width"><NumberInput value={layer.width} step={1} min={1} max={40} onChange={(v) => set({ width: v })} /></Field>
      </div>
      <div className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-graphite/45">Line style</span>
          <Toggle label="Show line" checked={layer.showLine !== false} onChange={(v) => set({ showLine: v })} />
          <Toggle label="Endpoint pins" checked={(layer as any).showEndpoints !== false} onChange={(v) => set({ showEndpoints: v })} />
        </div>
        <Field label="Pattern">
          <Select value={layer.dashStyle ?? "solid"} onChange={(e) => set({ dashStyle: e.target.value })}>
            <option value="solid">Solid</option>
            <option value="dotted">Dotted</option>
            <option value="dashed">Dashed</option>
          </Select>
        </Field>
        <Slider label="Opacity" value={layer.opacity ?? 1} onChange={(v) => set({ opacity: v })} />
        <Slider label="Glow" value={layer.glow ?? 0.35} min={0} max={1.5} onChange={(v) => set({ glow: v })} />
        <Slider label="Smooth (bezier)" value={layer.smoothness ?? 0} onChange={(v) => set({ smoothness: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Vehicle" hint="Sets the icon + routes it correctly">
          <Select value={layer.icon} onChange={(e) => pickVehicle(e.target.value)}>
            <option value="none">None</option>
            <option value="car">🚗 Car (roads)</option>
            <option value="truck">🚚 Truck (roads)</option>
            <option value="train">🚆 Train (roads)</option>
            <option value="bike">🚴 Bike (cycle)</option>
            <option value="walk">🚶 Walk (paths)</option>
            <option value="run">🏃 Run (paths)</option>
            <option value="plane">✈️ Plane (air arc)</option>
            <option value="heli">🚁 Heli (air)</option>
            <option value="rocket">🚀 Rocket (air)</option>
            <option value="boat">⛵ Boat (water)</option>
            <option value="ship">🚢 Ship (water)</option>
            <option value="pin">📍 Pin</option>
          </Select>
        </Field>
        <Field label="Custom icon" hint="Any emoji — overrides">
          <Input value={(layer as any).iconEmoji ?? ""} placeholder="e.g. 🦅 🛸 🐎" maxLength={4} onChange={(e) => set({ iconEmoji: e.target.value })} />
        </Field>
      </div>
      <Field label="Travel time" hint="Line, vehicle & follow-camera speed">
        <NumberInput value={Math.round(layer.drawFraction * 100)} step={5} min={10} max={100} unit="%" onChange={(v) => set({ drawFraction: v / 100 })} />
      </Field>
      <div className="text-[10px] text-graphite/45">
        {busy ? "Resolving path…" : resolved ? `Path resolved (${layer.coordinates.length} points). The vehicle, the drawn line and (when this route is the priority) the camera all travel together.` : "Pick From + To to draw the route."}
      </div>
    </Section>
  );
};

/* ── Highlight needs a region-polygon search ──────────────────────────────── */

const HighlightFields: React.FC<{ layer: Extract<Layer, { type: "highlight" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => {
  const patchComposition = useEditor((s) => s.patchComposition);
  const layers = useEditor((s) => s.project.composition.layers);
  const patchLayer = useEditor((s) => s.patchLayer);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/highlight-search?q=${encodeURIComponent(term)}`);
      const d = await r.json();
      setResults(d.results ?? []);
    } catch { setResults([]); }
    setLoading(false);
  };

  const pick = (r: any) => {
    set({ geojson: cleanCountryGeo(r.geojson), place: r.shortName ?? r.name, countryISO: r.countryISO ?? null });
    // recenter the camera on the region
    const cam = layers.find((l) => l.type === "camera");
    if (cam && r.center) {
      patchLayer(cam.id, {
        end: { lon: r.center.lon, lat: r.center.lat, zoom: 4.6, pitch: 30, bearing: 0 },
        start: { lon: r.center.lon, lat: r.center.lat, zoom: 2.4, pitch: 0, bearing: 0 },
      });
    }
    setQ(""); setResults([]);
  };

  return (
    <Section title="Highlight">
      <PriorityControl layerId={layer.id} type="highlight" />
      <Field label="Region / country" hint="Search a place, or draw a region on the map">
        <div className="space-y-1.5">
          <div className="relative">
            <input value={q} onChange={(e) => search(e.target.value)} placeholder={layer.place || "Search a region…"} className="w-full rounded-md bg-paper-50 border border-line px-3 py-1.5 text-sm text-graphite placeholder:text-graphite/45 focus:outline-none focus:border-iris/50" />
            {loading && <span className="absolute right-2 top-2 text-[10px] text-iris/60">…</span>}
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-white shadow-elevated">
                {results.slice(0, 6).map((r) => (
                  <button key={r.id} onClick={() => pick(r)} className="block w-full truncate px-3 py-1.5 text-left text-xs text-graphite/75 hover:bg-iris/10">{r.shortName ?? r.name} <span className="text-graphite/45">· {r.placeType}</span></button>
                ))}
              </div>
            )}
          </div>
          <DrawRegionOnMap onPick={(geojson, center) => {
            set({ geojson, place: layer.place || "Custom area", countryISO: null, flagISO: null });
            const cam = layers.find((l) => l.type === "camera");
            if (cam) patchLayer(cam.id, {
              end: { lon: center.lon, lat: center.lat, zoom: 4.6, pitch: 30, bearing: 0 },
              start: { lon: center.lon, lat: center.lat, zoom: 2.4, pitch: 0, bearing: 0 },
            });
          }} />
        </div>
      </Field>
      <Field label="Fill" hint="How the country area is filled">
        <Select value={layer.fillType} onChange={(e) => {
          const ft = e.target.value;
          // A flag at the faint solid default (0.22) looks washed out — bump it.
          set(ft === "flag" && layer.fillOpacity < 0.6 ? { fillType: ft, fillOpacity: 0.85 } : { fillType: ft });
        }}>
          <option value="solid">Solid color</option>
          <option value="flag">🏳️ Country flag</option>
          <option value="hatch">Hatch</option>
          <option value="crosshatch">Crosshatch</option>
          <option value="stripes">Stripes</option>
          <option value="dots">Dots</option>
        </Select>
      </Field>
      {layer.fillType === "flag" && (
        <div className="flex items-center gap-2">
          {(layer.flagISO || layer.countryISO) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://flagcdn.com/w40/${(layer.flagISO || layer.countryISO || "").toLowerCase()}.png`} alt="" className="h-5 w-7 shrink-0 rounded border border-line object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          )}
          <Field label="Flag country (ISO-2)" hint="Auto from the region; override here">
            <Input value={layer.flagISO ?? ""} maxLength={2} placeholder={layer.countryISO ?? "FR"} onChange={(e) => set({ flagISO: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") || null })} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={layer.fillType === "flag" ? "Flag opacity" : "Fill opacity"}><NumberInput value={layer.fillOpacity} step={0.02} min={0} max={1} onChange={(v) => set({ fillOpacity: v })} /></Field>
        <Field label="Animation"><Select value={layer.animation} onChange={(e) => set({ animation: e.target.value })}><option value="fade">Fade</option><option value="sweep">Sweep</option><option value="pulse">Pulse</option><option value="border-first">Border first</option><option value="grow">Grow (expansion)</option><option value="shrink">Shrink (contraction)</option><option value="static">Static</option></Select></Field>
      </div>
      {layer.animation === "border-first" && (
        <Field label="Fill delay" hint="how long the border stays alone">
          <NumberInput value={(layer as any).fillDelaySec ?? 1.2} step={0.1} min={0.2} max={5} unit="s" onChange={(v) => set({ fillDelaySec: v })} />
        </Field>
      )}
      {(layer.animation === "grow" || layer.animation === "shrink") && (
        <div className="rounded-lg border border-line/60 bg-paper-100/40 px-2.5 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-graphite/45">{layer.animation === "grow" ? "Spread" : "Recede"} — the territory {layer.animation === "grow" ? "grows from" : "shrinks toward"} an origin</div>
          <Field label="Spread time"><NumberInput value={(layer as any).growSpanSec ?? 3.5} step={0.25} min={0.5} max={20} unit="s" onChange={(v) => set({ growSpanSec: v })} /></Field>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-graphite/45">Origin{(layer as any).growOrigin ? " · set" : " · region centre"}</span>
            <div className="flex items-center gap-1.5">
              <PlaceSearch onPick={(r) => set({ growOrigin: { lon: r.lon, lat: r.lat } })} placeholder="spread from…" size="sm" />
              {(layer as any).growOrigin && <button onClick={() => set({ growOrigin: null })} className="text-[10px] text-graphite/35 hover:text-iris">reset</button>}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fill color"><ColorInput value={layer.fillColor} onChange={(v) => set({ fillColor: v })} /></Field>
        <Field label="Border"><ColorInput value={layer.borderColor} onChange={(v) => set({ borderColor: v })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Glow color"><ColorInput value={layer.glowColor} onChange={(v) => set({ glowColor: v })} /></Field>
        <Field label="Glow size"><NumberInput value={layer.glowWidth} step={1} min={0} max={60} onChange={(v) => set({ glowWidth: v })} /></Field>
      </div>

      {/* Border thickness + style + 3D extrusion */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Border width" hint="0 = no border"><NumberInput value={(layer as any).borderWidth ?? 3.5} step={0.5} min={0} max={20} onChange={(v) => set({ borderWidth: v })} /></Field>
        <Field label="Border style"><Select value={(layer as any).borderDash ?? "solid"} onChange={(e) => set({ borderDash: e.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></Select></Field>
        <Field label="Border opacity"><NumberInput value={Math.round(((layer as any).borderOpacity ?? 1) * 100)} step={5} min={0} max={100} unit="%" onChange={(v) => set({ borderOpacity: v / 100 })} /></Field>
        <Field label="3D extrude" hint="Raise the region (needs camera tilt)"><NumberInput value={(layer as any).extrude ?? 0} step={2} min={0} max={100} onChange={(v) => set({ extrude: v })} /></Field>
      </div>

      {/* Editable on-map label */}
      <div className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5">
        <Field label="On-map label" hint={layer.place ? "Overrides the region name" : "Type a label to show"}>
          <Input value={(layer as any).labelText ?? ""} placeholder={layer.place || "e.g. THE FRONTIER"} onChange={(e) => set({ labelText: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text size"><NumberInput value={(layer as any).labelSize ?? 46} step={2} min={10} max={240} unit="px" onChange={(v) => set({ labelSize: v })} /></Field>
          <Field label="Text color"><ColorInput value={(layer as any).labelColor ?? "#ffffff"} onChange={(v) => set({ labelColor: v })} /></Field>
        </div>
      </div>
    </Section>
  );
};
