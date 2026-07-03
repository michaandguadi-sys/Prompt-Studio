"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapPin, Upload, Sparkles, Boxes, Mic, Play, Square, X as XIcon, Loader2 } from "lucide-react";
import { hasVoiceoverKey, loadVoiceoverSettings, generateVoiceover, measureAudioDuration } from "@/lib/voiceover";
import { MAP3D_STYLES } from "@/lib/presets/map3dStyles";
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
import { useTier } from "@/hooks/useTier";
import { TimingControls } from "./TimingControls";
import { ThemePanel } from "./ThemePanel";
import { FONT_CHOICES, FONT_GROUPS } from "../doc/themes";
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

// The Camera layer is now the SOLE camera driver — routes/highlights never
// hijack the framing — so the old per-layer "drive the camera" picker is gone.
// Kept as a no-op component so existing call sites stay valid (and easy to drop).
const PriorityControl: React.FC<{ layerId: string; type: "camera" | "route" | "highlight" }> = () => null;

const IDENTITY_TF = { offsetXPct: 0, offsetYPct: 0, scale: 1, rotation: 0 };

/** Numeric position / scale / rotation — mirrors the preview drag handles. */
const TransformControls: React.FC<{ t: any; onChange: (tf: any) => void; kf?: any[]; onKf?: (k: any[]) => void }> = ({ t, onChange, kf, onKf }) => {
  const v = { ...IDENTITY_TF, ...(t ?? {}) };
  const touched = v.offsetXPct !== 0 || v.offsetYPct !== 0 || v.scale !== 1 || v.rotation !== 0;
  // The final framing's zoom — used as the reference so "scale with zoom" reads 1:1 there.
  const camZoom = useEditor((s) => { const c = s.project.composition.layers.find((l) => l.type === "camera") as any; return c?.end?.zoom ?? 8; });
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
      <label className="flex items-center justify-between gap-2 rounded-md bg-paper-50 px-2 py-1.5 text-[11px] text-graphite/75">
        <span>Scale with map zoom <span className="text-graphite/40">· grows/shrinks with the map</span></span>
        <input type="checkbox" checked={!!v.scaleWithZoom}
          onChange={(e) => onChange({ ...v, scaleWithZoom: e.target.checked, anchorZoom: e.target.checked ? camZoom : 0 })}
          className="accent-iris" />
      </label>
      {onKf && (
        <div className="space-y-1.5 border-t border-line pt-2">
          <span className="text-[10px] uppercase tracking-wider text-graphite/45">Motion keyframes <span className="font-normal normal-case text-graphite/35">· animate position / scale / rotation</span></span>
          {(kf ?? []).map((k, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-line bg-paper-50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-graphite/40">Key {i + 1}</span>
                <button onClick={() => onKf((kf ?? []).filter((_, j) => j !== i))} className="px-1 text-xs text-graphite/45 hover:text-red-400">✕</button>
              </div>
              <Slider label="Time" value={k.t ?? 0} min={0} max={1} step={0.02} onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, t: val }; onKf(next); }} format={(val) => `${Math.round(val * 100)}%`} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="X offset"><NumberInput value={Math.round(k.offsetXPct ?? 0)} step={1} min={-100} max={100} unit="%" onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, offsetXPct: val }; onKf(next); }} /></Field>
                <Field label="Y offset"><NumberInput value={Math.round(k.offsetYPct ?? 0)} step={1} min={-100} max={100} unit="%" onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, offsetYPct: val }; onKf(next); }} /></Field>
                <Field label="Scale"><NumberInput value={Math.round((k.scale ?? 1) * 100)} step={5} min={10} max={500} unit="%" onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, scale: val / 100 }; onKf(next); }} /></Field>
                <Field label="Rotation"><NumberInput value={Math.round(k.rotation ?? 0)} step={5} min={-180} max={180} unit="°" onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, rotation: val }; onKf(next); }} /></Field>
              </div>
              <Slider label="Opacity" value={k.opacity ?? 1} min={0} max={1} step={0.05} onChange={(val) => { const next = [...(kf ?? [])]; next[i] = { ...k, opacity: val }; onKf(next); }} format={(val) => `${Math.round(val * 100)}%`} />
            </div>
          ))}
          <button onClick={() => { const cur = kf ?? []; const t0 = cur.length ? Math.min(1, (cur[cur.length - 1].t ?? 0) + 0.25) : 0; onKf([...cur, { t: t0, offsetXPct: v.offsetXPct, offsetYPct: v.offsetYPct, scale: v.scale, rotation: v.rotation, opacity: 1 }]); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-[11px] uppercase tracking-wider text-graphite/50 hover:border-iris hover:text-iris transition">
            + Add keyframe
          </button>
          {(kf ?? []).length === 1 && <div className="text-[10px] text-graphite/40">Add a 2nd keyframe to animate between them.</div>}
        </div>
      )}
      <div className="text-[10px] text-graphite/40">Tip: drag it directly in the preview to move, scale & rotate.</div>
    </div>
  );
};

/** Font picker shared by text layers — the full grouped family catalogue
 *  (Sans / Serif / Display / Condensed / Handwritten / Mono). */
const FontField: React.FC<{ value: string | null; onChange: (v: string | null) => void }> = ({ value, onChange }) => (
  <Field label="Font" hint="Overrides the theme font">
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Theme default</option>
      {FONT_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {FONT_CHOICES.filter((f) => f.group === g).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </optgroup>
      ))}
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
 * One full camera POSE editor — location (place search + frame-on-map) plus
 * zoom, tilt and rotation. Reused IDENTICALLY for the Start shot, every Stop and
 * the End shot, so all three read the same (consistent order + naming) and every
 * value is directly editable with no hidden style-coupling.
 */
const PoseEditor: React.FC<{ label: string; hint?: string; pose: any; onChange: (p: any) => void; onRemove?: () => void }> = ({ label, hint, pose, onChange, onRemove }) => (
  <div className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-graphite">{label}{hint ? <span className="ml-1 font-normal text-graphite/45">· {hint}</span> : null}</span>
      {onRemove && <button onClick={onRemove} className="px-1 text-xs text-graphite/45 hover:text-red-400">✕</button>}
    </div>
    <PlaceSearch size="sm" placeholder={pose.lon || pose.lat ? `${pose.lat.toFixed(2)}, ${pose.lon.toFixed(2)} — search to move` : "Search a place…"} onPick={(p) => onChange({ ...pose, lon: p.lon, lat: p.lat, zoom: p.zoom })} />
    <FrameOnMap lon={pose.lon} lat={pose.lat} zoom={pose.zoom} pitch={pose.pitch} bearing={pose.bearing} onPick={(v) => onChange({ ...pose, lon: v.lon, lat: v.lat, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing })} />
    <Slider label="Zoom" hint="how close" value={pose.zoom} min={1} max={20} step={0.2} onChange={(v) => onChange({ ...pose, zoom: v })} format={(v) => v.toFixed(1)} />
    <div className="grid grid-cols-2 gap-2">
      <Slider label="Tilt" value={pose.pitch ?? 0} min={0} max={85} step={1} onChange={(v) => onChange({ ...pose, pitch: v })} format={(v) => `${Math.round(v)}°`} />
      <Slider label="Rotation" value={pose.bearing ?? 0} min={-180} max={180} step={5} onChange={(v) => onChange({ ...pose, bearing: v })} format={(v) => `${Math.round(v)}°`} />
    </div>
  </div>
);

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

/** Voiceover panel — shows any attached TTS audio, lets the creator play/remove/regenerate it.
 *  The audio bakes into exported video via Remotion's <Audio> component. */
const VoiceoverPanel: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const patchComposition = useEditor((s) => s.patchComposition);
  const voiceover: { url: string; durationSec: number; voice?: string } | undefined = (comp as any).voiceover;

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasKey = hasVoiceoverKey();

  const togglePlay = () => {
    if (!voiceover?.url) return;
    if (!audioRef.current) { audioRef.current = new Audio(voiceover.url); audioRef.current.onended = () => setPlaying(false); }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.src = voiceover.url; audioRef.current.play().catch(() => setPlaying(false)); setPlaying(true); }
  };

  const remove = () => {
    audioRef.current?.pause(); audioRef.current = null; setPlaying(false);
    patchComposition({ voiceover: undefined } as any);
  };

  const regenerate = async () => {
    const narrationLines: Array<{ text: string; startSec: number }> = (comp as any).narrationLines ?? [];
    const singleNarration: string = (comp as any).narration ?? "";
    const text = narrationLines.length > 1
      ? narrationLines.map((l) => l.text).filter(Boolean).join("  ")
      : singleNarration;
    if (!text.trim()) { setError("Add narration first."); return; }
    setLoading(true); setError(null);
    try {
      const settings = loadVoiceoverSettings();
      const { dataUrl, durationSec } = await generateVoiceover(text, settings);
      const realDur = await measureAudioDuration(dataUrl);
      audioRef.current = null; setPlaying(false);
      patchComposition({ voiceover: { url: dataUrl, durationSec: realDur > 0 ? realDur : durationSec } } as any);
    } catch (e: any) { setError(e.message ?? "Failed — check ElevenLabs key in Settings."); }
    finally { setLoading(false); }
  };

  if (!voiceover && !hasKey) return null;

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Mic size={11} className="text-iris/70" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-graphite/45">Voiceover</span>
      </div>
      {voiceover ? (
        <div className="flex items-center gap-2 rounded-lg border border-iris/20 bg-iris/[0.04] px-2.5 py-2">
          <button onClick={togglePlay} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iris/30 text-iris transition-colors hover:bg-iris/10">
            {playing ? <Square size={9} fill="currentColor" /> : <Play size={9} fill="currentColor" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-graphite/80">Narration audio</div>
            <div className="text-[9px] text-graphite/45">{Math.round(voiceover.durationSec)}s · bakes into export</div>
          </div>
          <button onClick={regenerate} disabled={loading || !hasKey} className="rounded px-1.5 py-0.5 text-[9px] font-medium text-iris/60 hover:text-iris disabled:opacity-30">
            {loading ? <Loader2 size={9} className="animate-spin" /> : "↺ redo"}
          </button>
          <button onClick={remove} className="rounded p-1 text-graphite/30 hover:text-red-400"><XIcon size={11} /></button>
        </div>
      ) : (
        <button
          onClick={regenerate}
          disabled={loading}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-iris/25 py-2 text-[10px] font-medium text-iris/60 transition-colors hover:border-iris/50 hover:text-iris disabled:opacity-40"
        >
          {loading ? <><Loader2 size={10} className="animate-spin" /> Generating…</> : <><Mic size={10} /> Generate voiceover from narration</>}
        </button>
      )}
      {error && <div className="mt-1 text-[10px] text-red-400/80">{error}</div>}
    </div>
  );
};

/** Narration captions control: toggle visibility + edit text inline.
 *  When the AI generated multi-beat narrationLines, shows each beat's text
 *  in a mini-filmstrip so the creator can tweak line by line. */
const NarrationCaptionField: React.FC = () => {
  const look = (useEditor((s) => s.project.composition.look) ?? DEFAULT_LOOK) as Look;
  const comp = useEditor((s) => s.project.composition);
  const patchComposition = useEditor((s) => s.patchComposition);
  const set = (patch: Partial<Look>) => patchComposition({ look: { ...look, ...patch } });

  const narrationLines: Array<{ text: string; startSec: number }> = (comp as any).narrationLines ?? [];
  const singleNarration: string = (comp as any).narration ?? "";
  const hasMulti = narrationLines.length > 1;

  const updateLine = (i: number, text: string) => {
    const next = narrationLines.map((l, idx) => idx === i ? { ...l, text } : l);
    patchComposition({ narrationLines: next } as any);
  };
  const updateSingle = (text: string) => patchComposition({ narration: text } as any);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-graphite/45">Narration captions</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-graphite/60">
          <input type="checkbox" checked={look.showCaptions ?? false} onChange={(e) => set({ showCaptions: e.target.checked })} className="accent-iris" />
          {look.showCaptions ? "Visible" : "Hidden"}
        </label>
      </div>
      {hasMulti ? (
        <div className="space-y-1.5">
          {narrationLines.map((line, i) => (
            <div key={i} className="rounded-lg border border-line bg-paper-50 p-1.5">
              <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-graphite/35">Beat {i + 1} · {line.startSec.toFixed(1)}s</div>
              <textarea
                value={line.text}
                onChange={(e) => updateLine(i, e.target.value)}
                rows={2}
                className="w-full resize-none rounded border-0 bg-transparent text-[11px] leading-snug text-graphite/80 placeholder:text-graphite/30 focus:outline-none"
                placeholder="Narration for this beat…"
              />
            </div>
          ))}
        </div>
      ) : (
        <textarea
          value={singleNarration}
          onChange={(e) => updateSingle(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-paper-50 p-2 text-[11px] leading-snug text-graphite/80 placeholder:text-graphite/30 focus:border-iris/50 focus:outline-none"
          placeholder="Add narration text — shows as animated subtitles…"
          onFocus={() => { if (!look.showCaptions) set({ showCaptions: true }); }}
        />
      )}
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
      <VoiceoverPanel />
      <NarrationCaptionField />
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
      <p className="-mt-1 text-[10px] leading-relaxed text-graphite/45">Quick controls for the one <span className="font-medium text-graphite/70">Camera layer</span> — the only thing that drives the shot. Pick the Camera layer in <span className="font-medium text-graphite/70">Layers</span> for precise Start / Stop / End framing.</p>
      <Field label="Shot move" hint="the cinematic move the camera makes">
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
type CuratedStyle = { id: string; name: string; hint: string; kind: "flat" | "photoreal" | "3d"; url?: string; preset3dId?: string; swatch: React.CSSProperties };
/** ONE curated set of distinct looks — flat bases + the standout 3D worlds +
 *  real-building Photoreal, so the picker is clear (not 19 cramped swatches). */
const CURATED_STYLES: CuratedStyle[] = [
  { id: "satellite", name: "Satellite", hint: "real imagery", kind: "flat", url: "mapbox://styles/mapbox/satellite-streets-v12", swatch: { background: "linear-gradient(135deg,#243a1c,#3b5a2a 45%,#7a6b3e 75%,#274b63)" } },
  { id: "dark", name: "Dark", hint: "cinematic default", kind: "flat", url: "mapbox://styles/mapbox/dark-v11", swatch: { background: "linear-gradient(135deg,#0a0e1a,#121830 60%,#1b2547)" } },
  { id: "minimal", name: "Minimal", hint: "clean & light", kind: "flat", url: "mapbox://styles/mapbox/light-v11", swatch: { background: "linear-gradient(135deg,#f4f5f8,#e7ebf2 60%,#d6deea)" } },
  { id: "terrain", name: "Terrain", hint: "topographic relief", kind: "flat", url: "mapbox://styles/mapbox/outdoors-v12", swatch: { background: "linear-gradient(135deg,#cfe3b8,#a9cf8e 55%,#8bbf7a)" } },
  { id: "photoreal", name: "Photoreal 3D", hint: "real buildings · like Google Earth", kind: "photoreal", swatch: { background: "linear-gradient(135deg,#3a4a2c,#6b7a4a 45%,#9a8a5a 70%,#2a4b63)" } },
  { id: "papercraft", name: "Paper-craft", hint: "folded-paper 3D", kind: "3d", preset3dId: "papercraft", swatch: { background: "linear-gradient(135deg,#efe7d6,#d8cdb6 60%,#b9a98a)" } },
  { id: "holographic", name: "Holographic", hint: "cyan hologram 3D", kind: "3d", preset3dId: "holographic", swatch: { background: "linear-gradient(135deg,#06121f,#0b3a4a 45%,#2FE0FF)" } },
  { id: "aurora", name: "Aurora", hint: "teal-violet relief 3D", kind: "3d", preset3dId: "aurora", swatch: { background: "linear-gradient(135deg,#06161a,#155e57 45%,#36d39a 72%,#6E7BFF)" } },
  { id: "molten", name: "Molten", hint: "lava & ember 3D", kind: "3d", preset3dId: "molten", swatch: { background: "linear-gradient(135deg,#120806,#7a2410 45%,#ff6a2a 78%,#ff8a3a)" } },
  { id: "neon-noir", name: "Neon Noir", hint: "synthwave magenta 3D", kind: "3d", preset3dId: "neon-noir", swatch: { background: "linear-gradient(135deg,#14061f,#5e0a55 45%,#ff3df0)" } },
  { id: "blueprint", name: "Blueprint", hint: "glowing technical 3D", kind: "3d", preset3dId: "blueprint", swatch: { background: "linear-gradient(135deg,#0a1f4d,#1d3f86 50%,#bcd4ff)" } },
  { id: "crystal-ice", name: "Crystal Ice", hint: "glacial translucent 3D", kind: "3d", preset3dId: "crystal-ice", swatch: { background: "linear-gradient(135deg,#0a1622,#3a6d8a 50%,#bfe9ff)" } },
  { id: "sakura", name: "Sakura", hint: "cherry-blossom dusk 3D", kind: "3d", preset3dId: "sakura", swatch: { background: "linear-gradient(135deg,#1a0a12,#7a2a52 48%,#ff9ec9)" } },
  { id: "emerald", name: "Emerald", hint: "bio-luminescent green 3D", kind: "3d", preset3dId: "emerald", swatch: { background: "linear-gradient(135deg,#04140c,#0f5e3a 48%,#2fd98a)" } },
  { id: "war-room", name: "War Room", hint: "tactical sand-table 3D", kind: "3d", preset3dId: "war-room", swatch: { background: "linear-gradient(135deg,#0e1622,#3a4a63 55%,#ffb020)" } },
];
/** Niche bases kept available as a small text row (not in the visual grid). */
const MORE_STYLES: { url: string; name: string }[] = [
  { url: "grid", name: "Grid" },
  { url: "https://www.openhistoricalmap.org/map-styles/main/main.json", name: "Historical" },
];

/** Map style — the PRIORITY choice: which basemap. Visual thumbnail picker plus
 *  the per-style options (terrain, labels, land/water, historical year). */
const MapStylePanel: React.FC = () => {
  const basemap = useEditor((s) => s.project.composition.basemap);
  const look = useEditor((s) => s.project.composition.look);
  const layers = useEditor((s) => s.project.composition.layers);
  const patchComposition = useEditor((s) => s.patchComposition);
  const patchLayer = useEditor((s) => s.patchLayer);
  const { tier } = useTier();
  const isPro = PRO_DATA_TIERS.has(tier ?? "");
  const [customUrl, setCustomUrl] = useState("");
  const style3d = (basemap as any).style3d || "";
  const photoreal = !!(basemap as any).photoreal3d;
  const isCustom = /^https?:\/\//i.test(basemap.styleUrl) && !MORE_STYLES.some((m) => m.url === basemap.styleUrl);
  // ── Pro Style Creator — craft a look from all art-direction fields, save + reload ──
  const [styleName, setStyleName] = useState("");
  const [stylePresets, setStylePresets] = useState<{ id: string; name: string; basemap: Record<string, unknown> }[]>([]);
  useEffect(() => { try { setStylePresets(JSON.parse(localStorage.getItem("mapanisy-style-presets") || "[]")); } catch { /* none */ } }, []);
  const persistStyles = (next: typeof stylePresets) => { setStylePresets(next); try { localStorage.setItem("mapanisy-style-presets", JSON.stringify(next)); } catch { /* quota */ } };
  const saveStyle = () => {
    const name = styleName.trim(); if (!name) return;
    const b = basemap as any;
    const keep = ["styleUrl", "style3d", "landColor", "waterColor", "buildingColor", "buildingOpacity", "buildingHeightMult", "buildingGradient", "boundaryGlow", "skyColor", "terrain", "buildings3d", "terrainStrength"];
    const snap: Record<string, unknown> = {}; for (const k of keep) snap[k] = b[k];
    persistStyles([...stylePresets.filter((x) => x.name !== name), { id: "ms_" + Math.random().toString(36).slice(2, 8), name, basemap: snap }]);
    setStyleName("");
  };
  const loadStyle = (p: { basemap: Record<string, unknown> }) => patchComposition({ basemap: { ...basemap, ...p.basemap, photoreal3d: false } as any });
  const delStyle = (id: string) => persistStyles(stylePresets.filter((x) => x.id !== id));
  // Apply a creative 3D world: merge its basemap + look + tilt the camera (same as the old modal).
  const apply3d = (st: (typeof MAP3D_STYLES)[number]) => {
    patchComposition({ basemap: { ...basemap, ...(st.basemap as any), style3d: st.id, photoreal3d: false } as any, look: { ...look, ...(st.look as any) } as any });
    const cam = layers.find((l) => l.type === "camera") as any;
    if (cam && typeof st.pitch === "number") patchLayer(cam.id, { end: { ...cam.end, pitch: st.pitch } } as any);
  };
  // Photoreal 3D — Google's real-building tiles (live preview needs a Maps key; exports as 3D satellite).
  const applyPhotoreal = () => {
    patchComposition({ basemap: { ...basemap, photoreal3d: true, style3d: "", terrain: true, buildings3d: true } as any });
    const cam = layers.find((l) => l.type === "camera") as any;
    if (cam) patchLayer(cam.id, { end: { ...cam.end, pitch: Math.max(cam.end?.pitch ?? 0, 55) } } as any);
  };
  const clear3d = () => patchComposition({ basemap: { ...basemap, style3d: "", photoreal3d: false, buildings3d: false, landColor: "", waterColor: "", buildingColor: "", boundaryGlow: "" } as any });
  const applyCurated = (c: CuratedStyle) => {
    if (c.kind === "photoreal") return applyPhotoreal();
    if (c.kind === "3d") { const st = MAP3D_STYLES.find((s) => s.id === c.preset3dId); if (st) apply3d(st); return; }
    patchComposition({ basemap: { ...basemap, styleUrl: c.url!, style3d: "", photoreal3d: false } as any });
  };
  const curatedActive = (c: CuratedStyle) =>
    c.kind === "photoreal" ? photoreal
      : c.kind === "3d" ? (!photoreal && style3d === c.preset3dId)
        : (!style3d && !photoreal && basemap.styleUrl === c.url);
  return (
    <Section title="Map style">
      {/* Visual basemap chooser — the first thing you pick. */}
      {/* ONE curated picker — distinct flat bases + standout 3D + real Photoreal. */}
      <div className="grid grid-cols-4 gap-1.5">
        {CURATED_STYLES.map((c) => {
          const active = curatedActive(c);
          return (
            <button key={c.id} onClick={() => applyCurated(c)} title={`${c.name} — ${c.hint}`}
              className="group text-center transition-transform hover:-translate-y-0.5">
              <div className={`relative flex h-11 w-full items-center justify-center overflow-hidden rounded-md border ${active ? "border-iris ring-2 ring-iris/40" : "border-black/10"}`} style={c.swatch}>
                {c.kind === "photoreal" && <Boxes size={14} className="text-white/90" />}
                {active && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-iris shadow-glow-iris" />}
              </div>
              <div className={`mt-0.5 truncate text-[9px] font-medium ${active ? "text-iris" : "text-graphite/55 group-hover:text-iris"}`}>{c.name}</div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5 text-[10px] text-graphite/45">
        <span className="uppercase tracking-wider text-graphite/35">More</span>
        {MORE_STYLES.map((m) => {
          const active = !style3d && !photoreal && basemap.styleUrl === m.url;
          return <button key={m.url} onClick={() => patchComposition({ basemap: { ...basemap, styleUrl: m.url, style3d: "", photoreal3d: false } as any })} className={`transition-colors hover:text-iris ${active ? "font-semibold text-iris" : ""}`}>{m.name}</button>;
        })}
        {(style3d || photoreal) && <button onClick={clear3d} className="ml-auto transition-colors hover:text-iris">↺ flat</button>}
      </div>
      {photoreal && <p className="text-[10px] leading-snug text-graphite/40">Photoreal 3D streams Google&apos;s real, textured buildings (like Google Earth) — needs a Google Maps key in Settings for the live preview. The difference: <b>Satellite</b> = flat aerial imagery, <b>Photoreal</b> = a real 3-D city you fly through.</p>}

      {/* Pro — bring your own map style (MapTiler / MapLibre style JSON; key lives in the URL) */}
      {isPro ? (
        <div className="space-y-1 pt-0.5">
          <div className="text-[10px] uppercase tracking-wider text-graphite/45">Custom style <span className="font-normal normal-case text-graphite/35">· your own MapTiler / MapLibre style JSON</span></div>
          <div className="flex gap-1.5">
            <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://api.maptiler.com/maps/…/style.json?key=…"
              className="min-w-0 flex-1 rounded-md border border-line bg-paper-50 px-2 py-1 text-[11px] text-graphite placeholder:text-graphite/35 focus:border-iris focus:outline-none" />
            <button onClick={() => { const u = customUrl.trim(); if (/^https?:\/\//i.test(u)) patchComposition({ basemap: { ...basemap, styleUrl: u, style3d: "", photoreal3d: false } as any }); }}
              className="shrink-0 rounded-md bg-iris px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-iris/90">Use</button>
          </div>
          {isCustom && <div className="truncate text-[10px] text-graphite/40">Active custom style: {basemap.styleUrl}</div>}
        </div>
      ) : (
        <div className="pt-0.5 text-[10px] text-graphite/40">🔒 Bring your own map-style token (MapTiler / Mapbox) — <a href="/dashboard" className="text-iris hover:underline">upgrade to Pro</a></div>
      )}

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
        {/* Time of day — real sun (lighting + shadows) on Photoreal/3D + atmosphere everywhere. */}
        <Slider label="Time of day" hint="sun, shadows & atmosphere — Google-Earth style" value={(basemap as any).timeOfDay ?? 13} min={0} max={24} step={0.5}
          onChange={(v) => patchComposition({ basemap: { ...basemap, timeOfDay: v } as any })}
          format={(v) => { const h = Math.floor(v); const m = Math.round((v % 1) * 60); const ap = h < 12 ? "AM" : "PM"; const hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; }} />
        <div className="flex items-center gap-2 text-[10px] text-graphite/45">
          <span className="uppercase tracking-wider">Date</span>
          <input type="date" value={(basemap as any).sunDate || ""} onChange={(e) => patchComposition({ basemap: { ...basemap, sunDate: e.target.value } as any })} className="rounded border border-line bg-paper-50 px-1.5 py-0.5 text-[10px] text-graphite focus:border-iris focus:outline-none" />
          {(basemap as any).sunDate ? <button onClick={() => patchComposition({ basemap: { ...basemap, sunDate: "" } as any })} className="hover:text-iris">clear</button> : <span className="text-graphite/30">(season → sun angle)</span>}
        </div>
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

        {/* ── Pro Style Creator — full art-direction + save/reload your own styles ── */}
        {isPro ? (
          <div className="space-y-2 rounded-lg border border-iris/25 bg-iris/[0.03] p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-iris/70">Style creator <span className="font-normal normal-case text-graphite/40">· craft &amp; save your own look</span></div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Building colour"><ColorInput value={(basemap as any).buildingColor || "#2a3550"} onChange={(v) => patchComposition({ basemap: { ...basemap, buildingColor: v, buildings3d: true } as any })} /></Field>
              <Field label="Boundary glow"><ColorInput value={(basemap as any).boundaryGlow || "#6E7BFF"} onChange={(v) => patchComposition({ basemap: { ...basemap, boundaryGlow: v } as any })} /></Field>
            </div>
            <Slider label="Building opacity" value={(basemap as any).buildingOpacity ?? 0.62} onChange={(v) => patchComposition({ basemap: { ...basemap, buildingOpacity: v } as any })} />
            <Slider label="Building height" value={(basemap as any).buildingHeightMult ?? 1} min={0.2} max={8} step={0.1} onChange={(v) => patchComposition({ basemap: { ...basemap, buildingHeightMult: v } as any })} format={(v) => `${v.toFixed(1)}×`} />
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Glassy buildings" checked={(basemap as any).buildingGradient ?? false} onChange={(v) => patchComposition({ basemap: { ...basemap, buildingGradient: v } as any })} />
              <Field label="Sky tint"><ColorInput value={(basemap as any).skyColor || "#0a1430"} onChange={(v) => patchComposition({ basemap: { ...basemap, skyColor: v } as any })} /></Field>
            </div>
            <div className="flex gap-1.5">
              <input value={styleName} onChange={(e) => setStyleName(e.target.value)} placeholder="Name this style…" className="min-w-0 flex-1 rounded-md border border-line bg-paper-50 px-2 py-1 text-[11px] text-graphite placeholder:text-graphite/35 focus:border-iris focus:outline-none" />
              <button onClick={saveStyle} disabled={!styleName.trim()} className="shrink-0 rounded-md bg-iris px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-iris/90 disabled:opacity-40">Save</button>
            </div>
            {stylePresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stylePresets.map((p) => (
                  <button key={p.id} onClick={() => loadStyle(p)} onContextMenu={(e) => { e.preventDefault(); if (window.confirm(`Delete style "${p.name}"?`)) delStyle(p.id); }}
                    title={`${p.name} — click to load, right-click to delete`}
                    className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-graphite/70 transition-colors hover:border-iris hover:text-iris">{p.name}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-graphite/40">🔒 Build &amp; save your own map styles (land, water, buildings, glow) — <a href="/dashboard" className="text-iris hover:underline">upgrade to Pro</a></div>
        )}
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
  const retimeScene = useEditor((s) => s.retimeScene);
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
        {/* Fit-to: retimes EVERYTHING proportionally — layer in/outs, narration
            beats, route dwells — so the film keeps its rhythm at the new length. */}
        <Field label="Fit film to" hint="rescales every layer's timing with it">
          <div className="flex items-center gap-1.5">
            {[15, 30, 60].map((sec) => (
              <button
                key={sec}
                onClick={() => retimeScene(sec)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  Math.abs(durationSec - sec) < 0.01
                    ? "border-iris bg-iris/10 text-iris"
                    : "border-line text-graphite/60 hover:border-iris/40 hover:text-graphite"
                }`}
                title={`Retime the whole film to ${sec}s — all animations rescale proportionally`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </Field>
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
          {/* Quick move — ONE tap sets a sensible Start + End from the End location.
              Every value then stays directly editable in the pose cards below
              (no hidden style-coupling that silently rewrites your zoom). */}
          <Field label="Quick move" hint="one tap, then fine-tune each shot below">
            <div className="grid grid-cols-3 gap-1.5">
              {CAMERA_MOVES.map((m) => (
                <button key={m.v} onClick={() => {
                  const e = layer.end;
                  const delta = Math.max(1.5, Math.abs(e.zoom - layer.start.zoom)) || 6;
                  const startZoom = m.v === "zoom-out" ? Math.min(20, e.zoom + delta) : m.v === "hold" ? e.zoom : Math.max(1.4, e.zoom - delta);
                  set({
                    style: m.v,
                    end: { ...e, pitch: m.pitch },
                    start: { lon: e.lon, lat: e.lat, zoom: startZoom, pitch: m.v === "hold" ? m.pitch : Math.max(0, m.pitch - 18), bearing: m.v === "orbit" ? e.bearing - 60 : 0 },
                    ...(m.v === "hold" ? { moveFraction: 0.2 } : {}),
                  });
                }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${layer.style === m.v ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/65 hover:border-iris/40"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Start → (stops) → End — three identical pose editors, each fully
              editable: location (search + frame), zoom, tilt and rotation. */}
          <PoseEditor label="Start shot" hint="where it begins" pose={layer.start} onChange={(p) => set({ start: p })} />
          {layer.waypoints.map((wp, wi) => (
            <PoseEditor key={wi} label={`Stop ${wi + 1}`} hint="fly through" pose={wp}
              onChange={(p) => { const wps = [...layer.waypoints]; wps[wi] = p; set({ waypoints: wps }); }}
              onRemove={() => set({ waypoints: layer.waypoints.filter((_, i) => i !== wi) })} />
          ))}
          <button
            onClick={() => {
              const s = layer.start, e = layer.end;
              const mid = { lon: (s.lon + e.lon) / 2, lat: (s.lat + e.lat) / 2, zoom: (s.zoom + e.zoom) / 2, pitch: Math.round((s.pitch + e.pitch) / 2), bearing: Math.round((s.bearing + e.bearing) / 2) };
              set({ waypoints: [...layer.waypoints, mid], smoothPath: true });
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-[11px] uppercase tracking-wider text-graphite/50 hover:border-iris hover:text-iris transition">
            + Add stop
          </button>
          <PoseEditor label="End shot" hint="the final framing" pose={layer.end} onChange={(p) => set({ end: p })} />

          {/* Motion feel */}
          <div className="grid grid-cols-2 gap-2">
            <Slider label="Move vs hold" hint="how much of the scene is moving" value={layer.moveFraction} min={0.1} max={1} step={0.05} onChange={(v) => set({ moveFraction: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Field label="Ease"><Select value={layer.easing} onChange={(e) => set({ easing: e.target.value })}><option value="easeInOut">Smooth</option><option value="easeOut">Ease out</option><option value="easeIn">Ease in</option><option value="linear">Linear</option><option value="spring">Spring</option></Select></Field>
          </div>
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
            <Field label="Colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
            <Field label="Accent"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={layer.sizePx} step={2} min={16} max={200} unit="px" onChange={(v) => set({ sizePx: v })} /></Field>
            <FontField value={layer.fontFamily} onChange={(v) => set({ fontFamily: v })} />
          </div>
          <Slider label="Text shadow" value={(layer as any).shadow ?? 0.55} onChange={(v) => set({ shadow: v })} format={(v) => v <= 0 ? "off" : `${Math.round(v * 100)}%`} />
          <Toggle label="Text outline" checked={(layer as any).outline ?? false} onChange={(v) => set({ outline: v })} />
          <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} kf={(layer as any).kf} onKf={(k) => set({ kf: k })} />
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
            <Field label="Template"><Select value={layer.template} onChange={(e) => set({ template: e.target.value })}><option value="impact">Impact</option><option value="classic">Classic</option><option value="kicker">Kicker</option><option value="split">Split</option><option value="lowerthird">Lower third</option><option value="boxed">Boxed</option></Select></Field>
            <Field label="Position"><Select value={layer.position} onChange={(e) => set({ position: e.target.value })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Align"><Select value={layer.align} onChange={(e) => set({ align: e.target.value })}><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></Select></Field>
            <Field label="Accent"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
          </div>
          <FontField value={layer.fontFamily} onChange={(v) => set({ fontFamily: v })} />
          <Slider label="Text shadow" value={(layer as any).shadow ?? 0.55} onChange={(v) => set({ shadow: v })} format={(v) => v <= 0 ? "off" : `${Math.round(v * 100)}%`} />
          <Toggle label="Text outline" checked={(layer as any).outline ?? false} onChange={(v) => set({ outline: v })} />
          <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} kf={(layer as any).kf} onKf={(k) => set({ kf: k })} />
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

    case "radius":
      return <RadiusFields layer={layer} set={set} />;

    case "timestamp":
      return <TimestampFields layer={layer} set={set} />;

    case "atmosphere":
      return <AtmosphereFields layer={layer} set={set} />;

    case "track":
      return <TrackFields layer={layer} set={set} />;

    case "choropleth":
      return <DataFields layer={layer as any} set={set} kind="choropleth" />;

    case "bubble":
      return <DataFields layer={layer as any} set={set} kind="bubble" />;

    case "flow":
      return <DataFields layer={layer as any} set={set} kind="flow" />;

    case "heatmap":
      return <DataFields layer={layer as any} set={set} kind="heatmap" />;

    default:
      return null;
  }
};

/* ── Data layers (choropleth · bubble) — import REAL data, AI-cleaned, Pro-only ── */

const PRO_DATA_TIERS = new Set(["teams", "custom", "agency"]); // Pro · Studio · Enterprise
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lerp two #rrggbb hex colours → the choropleth value ramp. */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  try {
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const m = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
    return `#${[m(r1, r2), m(g1, g2), m(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch { return b; }
}

/** Fetch the best polygon for a place/country via the existing search proxy. */
async function fetchPolygon(q: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/highlight-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const j = await res.json();
    const hit = (j?.results ?? []).find((r: any) => r.geojson) ?? j?.results?.[0];
    return hit?.geojson ?? null;
  } catch { return null; }
}

const DATA_NOUN: Record<string, string> = { choropleth: "choropleth fills", bubble: "proportional bubbles", flow: "weighted flow arcs", heatmap: "a density heatmap" };
const DATA_TITLE: Record<string, string> = { choropleth: "Choropleth data", bubble: "Bubble data", flow: "Flow data", heatmap: "Heatmap data" };

const DataFields: React.FC<{ layer: any; set: (p: Record<string, unknown>) => void; kind: "choropleth" | "bubble" | "flow" | "heatmap" }> = ({ layer, set, kind }) => {
  const { tier, loading: tierLoading } = useTier();
  const isPro = PRO_DATA_TIERS.has(tier ?? "");
  const [mode, setMode] = useState<"describe" | "paste">("describe");
  const [prompt, setPrompt] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows: any[] = layer.data ?? [];

  const run = async () => {
    if (busy) return;
    setErr(null); setBusy(true); setStatus("Reading your data…");
    const apiKind = kind === "heatmap" ? "bubble" : kind; // heatmap = weighted points → reuse bubble geocoding
    try {
      const res = await fetch("/api/v2/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: apiKind, prompt: mode === "describe" ? prompt : "", raw: mode === "paste" ? raw : "" }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j?.error ?? "Couldn't build the data — try rephrasing."); setBusy(false); setStatus(null); return; }
      const data: any[] = j.rows ?? [];
      if (!data.length) { setErr("No usable rows came back."); setBusy(false); setStatus(null); return; }

      if (kind === "bubble") {
        // Area-proportional radius (sqrt) so circle AREA encodes value honestly.
        const maxV = Math.max(...data.map((r) => Math.abs(r.value) || 0), 1);
        const maxPx = layer.maxSizePx ?? 140;
        const withSize = data.map((r) => ({
          place: r.place, value: r.value, label: r.label, lon: r.lon, lat: r.lat,
          sizePx: Math.max(16, Math.sqrt(Math.abs(r.value) / maxV) * maxPx), color: layer.color ?? "#2fe0ff",
        }));
        set({ data: withSize, metric: j.metric || layer.metric, unit: j.unit || layer.unit });
        setStatus(`${withSize.length} points ready`);
      } else if (kind === "heatmap") {
        const pts = data.map((r) => ({ place: r.place, value: Math.abs(r.value) || 1, lon: r.lon, lat: r.lat }));
        set({ data: pts, metric: j.metric || layer.metric, unit: j.unit || layer.unit });
        setStatus(`${pts.length} points ready`);
      } else if (kind === "flow") {
        // Width ∝ √magnitude so the THICKNESS encodes the flow size.
        const maxV = Math.max(...data.map((r) => Math.abs(r.value) || 0), 1);
        const maxW = layer.maxWidthPx ?? 14;
        const flows = data.map((r) => ({
          from: r.from, to: r.to, value: r.value, fromLon: r.fromLon, fromLat: r.fromLat, toLon: r.toLon, toLat: r.toLat,
          widthPx: Math.max(1.5, Math.sqrt(Math.abs(r.value) / maxV) * maxW), color: layer.color ?? "#2fe0ff",
        }));
        set({ data: flows, metric: j.metric || layer.metric, unit: j.unit || layer.unit });
        setStatus(`${flows.length} flows ready`);
      } else {
        // Choropleth: resolve one polygon per row (throttled for Nominatim) + ramp colour.
        const lo = layer.colorLow ?? "#e3f2fd", hi = layer.colorHigh ?? "#0d47a1";
        const vals = data.map((r) => r.value).filter(Number.isFinite);
        const vMin = Math.min(...vals), vMax = Math.max(...vals);
        const capped = data.slice(0, 24); // keep resolution time sane
        const out: any[] = [];
        for (let i = 0; i < capped.length; i++) {
          const r = capped[i];
          setStatus(`Resolving map shapes… ${i + 1}/${capped.length}`);
          const geo = await fetchPolygon(r.place || r.iso);
          const t = vMax > vMin ? (r.value - vMin) / (vMax - vMin) : 0.5;
          out.push({ place: r.place, value: r.value, label: r.label, iso: r.iso, color: mixHex(lo, hi, t), geojson: geo ? cleanCountryGeo(geo) : undefined });
          if (i < capped.length - 1) await sleep(1100); // Nominatim: ≤1 req/s
        }
        const ok = out.filter((r) => r.geojson).length;
        set({ data: out, metric: j.metric || layer.metric, unit: j.unit || layer.unit, colorLow: lo, colorHigh: hi });
        setStatus(`${ok}/${out.length} regions mapped${ok < out.length ? " (some shapes not found)" : ""}`);
      }
    } catch { setErr("Something went wrong — try again."); }
    setBusy(false);
  };

  if (!tierLoading && !isPro) {
    return (
      <Section title="Data layer">
        <div className="rounded-lg border border-iris/30 bg-iris/5 p-3.5 text-center">
          <Sparkles size={18} className="mx-auto mb-1.5 text-iris" />
          <div className="text-xs font-semibold text-graphite">Real-data maps are a Pro feature</div>
          <div className="mt-1 text-[11px] leading-snug text-graphite/55">Import or describe data to drive {DATA_NOUN[kind]} — available on Pro and up.</div>
          <a href="/dashboard" className="mt-2.5 inline-block rounded-md bg-iris px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-iris/90 transition">Upgrade to Pro</a>
        </div>
      </Section>
    );
  }

  const describePlaceholder = kind === "bubble" ? "e.g. Population of the 15 largest cities in Japan"
    : kind === "flow" ? "e.g. Top trade flows between the US, China and the EU"
    : kind === "heatmap" ? "e.g. Earthquake epicentres in Japan since 2000"
    : "e.g. GDP per capita of every EU country";
  const pastePlaceholder = kind === "flow" ? "Paste flows — from, to, value. e.g.\nChina, USA, 480\nGermany, France, 210"
    : "Paste rows — CSV, TSV, or a list. e.g.\nFrance, 38\nGermany, 46\nSpain, 30";
  const countNoun = kind === "flow" ? "flows" : kind === "choropleth" ? "regions" : "points";

  return (
    <Section title={DATA_TITLE[kind]}>
      {/* Describe ↔ Paste */}
      <div className="flex gap-1 rounded-lg bg-paper-50 p-1">
        {(["describe", "paste"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md py-1.5 text-[11px] font-medium capitalize transition ${mode === m ? "bg-iris text-white" : "text-graphite/55 hover:text-graphite"}`}>{m === "describe" ? "Describe" : "Paste data"}</button>
        ))}
      </div>
      {mode === "describe" ? (
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={describePlaceholder}
          className="w-full resize-none rounded-lg border border-line bg-paper-50 px-3 py-2 text-xs text-graphite placeholder:text-graphite/35 focus:border-iris focus:outline-none" />
      ) : (
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder={pastePlaceholder}
          className="w-full resize-none rounded-lg border border-line bg-paper-50 px-3 py-2 font-mono text-[11px] text-graphite placeholder:text-graphite/35 focus:border-iris focus:outline-none" />
      )}
      <button onClick={run} disabled={busy || (mode === "describe" ? !prompt.trim() : !raw.trim())}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-iris py-2 text-xs font-semibold text-white transition hover:bg-iris/90 disabled:cursor-not-allowed disabled:opacity-40">
        <Sparkles size={13} />{busy ? "Working…" : rows.length ? "Rebuild data" : "Build data"}
      </button>
      {status && <div className="text-center text-[11px] text-graphite/55">{status}</div>}
      {err && <div className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-center text-[11px] text-red-400">{err}</div>}
      {rows.length > 0 && (
        <div className="rounded-lg border border-line bg-paper-50/60 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-graphite/45">{rows.length} {countNoun}</span>
            <button onClick={() => set({ data: [] })} className="text-[10px] text-graphite/45 hover:text-red-400">clear</button>
          </div>
          <div className="max-h-24 space-y-0.5 overflow-y-auto">
            {rows.slice(0, 12).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] text-graphite/70">
                <span className="truncate pr-2">{kind === "flow" ? `${r.from} → ${r.to}` : r.place}{kind === "choropleth" && !r.geojson ? " ⚠" : ""}</span>
                <span className="shrink-0 tabular-nums text-graphite/50">{typeof r.value === "number" ? r.value.toLocaleString() : r.value}</span>
              </div>
            ))}
            {rows.length > 12 && <div className="text-[10px] text-graphite/40">+{rows.length - 12} more</div>}
          </div>
        </div>
      )}

      {/* Presentation */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Field label="Metric"><Input value={layer.metric ?? ""} placeholder="Legend label" onChange={(e) => set({ metric: e.target.value })} /></Field>
        <Field label="Unit"><Input value={layer.unit ?? ""} placeholder="%, M, …" onChange={(e) => set({ unit: e.target.value })} /></Field>
      </div>
      {kind === "choropleth" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Low colour"><ColorInput value={layer.colorLow ?? "#e3f2fd"} onChange={(v) => set({ colorLow: v })} /></Field>
            <Field label="High colour"><ColorInput value={layer.colorHigh ?? "#0d47a1"} onChange={(v) => set({ colorHigh: v })} /></Field>
          </div>
          <Toggle label="Show legend" checked={layer.showLegend ?? true} onChange={(v) => set({ showLegend: v })} />
        </>
      ) : kind === "bubble" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Colour"><ColorInput value={layer.color ?? "#2fe0ff"} onChange={(v) => set({ color: v })} /></Field>
            <Field label="Max size"><NumberInput value={layer.maxSizePx ?? 140} step={10} min={40} max={300} unit="px" onChange={(v) => set({ maxSizePx: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Labels" checked={layer.showLabels ?? true} onChange={(v) => set({ showLabels: v })} />
            <Toggle label="Legend" checked={layer.showLegend ?? false} onChange={(v) => set({ showLegend: v })} />
          </div>
        </>
      ) : kind === "flow" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Colour"><ColorInput value={layer.color ?? "#2fe0ff"} onChange={(v) => set({ color: v })} /></Field>
            <Field label="Max width"><NumberInput value={layer.maxWidthPx ?? 14} step={1} min={1} max={48} unit="px" onChange={(v) => set({ maxWidthPx: v })} /></Field>
          </div>
          <Slider label="Arc curve" value={layer.curve ?? 0.3} onChange={(v) => set({ curve: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Animate">
              <Select value={layer.animate ?? "draw"} onChange={(e) => set({ animate: e.target.value })}>
                <option value="draw">Draw in</option>
                <option value="flow">Flow</option>
                <option value="none">Static</option>
              </Select>
            </Field>
            <Toggle label="Legend" checked={layer.showLegend ?? false} onChange={(v) => set({ showLegend: v })} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Low colour"><ColorInput value={layer.colorLow ?? "#1a237e"} onChange={(v) => set({ colorLow: v })} /></Field>
            <Field label="High colour"><ColorInput value={layer.colorHigh ?? "#ff3d00"} onChange={(v) => set({ colorHigh: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Radius"><NumberInput value={layer.radius ?? 40} step={4} min={4} max={160} unit="px" onChange={(v) => set({ radius: v })} /></Field>
            <Field label="Intensity"><NumberInput value={layer.intensity ?? 1} step={0.1} min={0.1} max={6} onChange={(v) => set({ intensity: v })} /></Field>
          </div>
          <Toggle label="Show legend" checked={layer.showLegend ?? false} onChange={(v) => set({ showLegend: v })} />
        </>
      )}
    </Section>
  );
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
    <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} kf={(layer as any).kf} onKf={(k) => set({ kf: k })} />
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
    <TransformControls t={(layer as any).transform} onChange={(tf) => set({ transform: tf })} kf={(layer as any).kf} onKf={(k) => set({ kf: k })} />
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

/* ── Range rings — geodesic distance circles ──────────────────────────────── */

const RadiusFields: React.FC<{ layer: Extract<Layer, { type: "radius" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Range rings">
    <Field label="Centre" hint="Where the rings radiate from">
      <div className="space-y-1.5">
        <PlaceSearch size="sm" placeholder="Search a place…" onPick={(p) => set({ center: { lon: p.lon, lat: p.lat, name: p.name } })} />
        <PickOnMap label="Centre on map" lon={layer.center.lon} lat={layer.center.lat} onPick={(lon, lat) => set({ center: { lon, lat } })} />
      </div>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Radius"><NumberInput value={layer.radiusKm} step={layer.radiusKm >= 100 ? 50 : 5} min={0.1} max={20000} unit="km" onChange={(v) => set({ radiusKm: v })} /></Field>
      <Field label="Rings"><NumberInput value={layer.rings} step={1} min={1} max={5} onChange={(v) => set({ rings: Math.round(v) })} /></Field>
    </div>
    <Field label="Animation">
      <Select value={layer.mode} onChange={(e) => set({ mode: e.target.value })}>
        <option value="grow">Grow once (staggered)</option>
        <option value="ripple">Ripple (endless sonar)</option>
        <option value="static">Static</option>
      </Select>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label={layer.mode === "ripple" ? "Pulse takes" : "Grow over"}><NumberInput value={layer.growSec} step={0.2} min={0.3} max={10} unit="s" onChange={(v) => set({ growSec: v })} /></Field>
      {layer.mode === "ripple"
        ? <Field label="Every"><NumberInput value={layer.intervalSec} step={0.2} min={0.5} max={10} unit="s" onChange={(v) => set({ intervalSec: v })} /></Field>
        : <Field label="Line width"><NumberInput value={layer.width} step={0.5} min={0.5} max={20} unit="px" onChange={(v) => set({ width: v })} /></Field>}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="Unit">
        <Select value={layer.labelUnit} onChange={(e) => set({ labelUnit: e.target.value })}>
          <option value="km">Kilometres</option>
          <option value="mi">Miles</option>
        </Select>
      </Field>
    </div>
    <Slider label="Fill tint" value={layer.fillOpacity} min={0} max={0.5} onChange={(v) => set({ fillOpacity: v })} />
    <div className="grid grid-cols-2 gap-2">
      <Toggle label="Distance labels" checked={layer.showLabels} onChange={(v) => set({ showLabels: v })} />
      <Toggle label="Dashed" checked={layer.dashed} onChange={(v) => set({ dashed: v })} />
    </div>
    <Toggle label="Centre dot" checked={layer.centerDot} onChange={(v) => set({ centerDot: v })} />
  </Section>
);

/* ── Timestamp — the documentary date ticker ──────────────────────────────── */

const TimestampFields: React.FC<{ layer: Extract<Layer, { type: "timestamp" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Timestamp">
    <Field label="Mode" hint="The ticker advances across the layer's visible window">
      <Select value={layer.mode} onChange={(e) => set({ mode: e.target.value })}>
        <option value="date-range">Date range (animates)</option>
        <option value="day-counter">Day counter (DAY 1 → 100)</option>
        <option value="fixed">Fixed text</option>
      </Select>
    </Field>
    {layer.mode === "date-range" && (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From"><Input value={layer.startDate} onChange={(e) => set({ startDate: e.target.value })} placeholder="1939-09-01" /></Field>
          <Field label="To"><Input value={layer.endDate} onChange={(e) => set({ endDate: e.target.value })} placeholder="1945-05-08" /></Field>
        </div>
        <Field label="Format">
          <Select value={layer.format} onChange={(e) => set({ format: e.target.value })}>
            <option value="year">Year — 1944</option>
            <option value="month-year">Month + year — SEP 1944</option>
            <option value="full">Full date — 6 JUN 1944</option>
          </Select>
        </Field>
      </>
    )}
    {layer.mode === "day-counter" && (
      <div className="grid grid-cols-3 gap-2">
        <Field label="Prefix"><Input value={layer.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="DAY" /></Field>
        <Field label="From"><NumberInput value={layer.dayStart} step={1} min={-100000} max={100000} onChange={(v) => set({ dayStart: Math.round(v) })} /></Field>
        <Field label="To"><NumberInput value={layer.dayEnd} step={1} min={-100000} max={100000} onChange={(v) => set({ dayEnd: Math.round(v) })} /></Field>
      </div>
    )}
    {layer.mode === "fixed" && (
      <Field label="Text"><Input value={layer.fixedText} onChange={(e) => set({ fixedText: e.target.value })} placeholder="MARCH 1944" /></Field>
    )}
    <div className="grid grid-cols-2 gap-2">
      <Field label="Position">
        <Select value={layer.position} onChange={(e) => set({ position: e.target.value })}>
          <option value="top-left">Top left</option>
          <option value="top-center">Top centre</option>
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-center">Bottom centre</option>
          <option value="bottom-right">Bottom right</option>
        </Select>
      </Field>
      <Field label="Style">
        <Select value={layer.style} onChange={(e) => set({ style: e.target.value })}>
          <option value="chip">Chip (glass badge)</option>
          <option value="minimal">Minimal (bare text)</option>
        </Select>
      </Field>
    </div>
    <Slider label="Size" value={layer.sizeVh} min={1} max={14} onChange={(v) => set({ sizeVh: v })} format={(v) => `${v.toFixed(1)}vh`} />
    <div className="grid grid-cols-2 gap-2">
      <Field label="Text colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="Accent dot"><ColorInput value={layer.accent} onChange={(v) => set({ accent: v })} /></Field>
    </div>
  </Section>
);

/* ── Atmosphere — cinematic weather particles ─────────────────────────────── */

const AtmosphereFields: React.FC<{ layer: Extract<Layer, { type: "atmosphere" }>; set: (p: Record<string, unknown>) => void }> = ({ layer, set }) => (
  <Section title="Atmosphere">
    <Field label="Effect" hint="Deterministic — preview and render match exactly">
      <Select value={layer.effect} onChange={(e) => set({ effect: e.target.value })}>
        <option value="snow">Snow</option>
        <option value="rain">Rain</option>
        <option value="embers">Embers / sparks</option>
        <option value="dust">Dust / sand</option>
        <option value="fog">Fog / mist</option>
      </Select>
    </Field>
    <Slider label="Density" value={layer.density} onChange={(v) => set({ density: v })} />
    <Slider label="Speed" value={layer.speed} min={0.1} max={3} onChange={(v) => set({ speed: v })} format={(v) => `${v.toFixed(1)}×`} />
    <Slider label="Wind" value={layer.wind} min={-2} max={2} onChange={(v) => set({ wind: v })} format={(v) => (v > 0 ? `→ ${v.toFixed(1)}` : v < 0 ? `← ${Math.abs(v).toFixed(1)}` : "0")} />
    <Slider label="Opacity" value={layer.opacity} onChange={(v) => set({ opacity: v })} />
    <Field label="Colour" hint="Empty = the effect's natural colour">
      <div className="flex items-center gap-2">
        <ColorInput value={layer.color || "#ffffff"} onChange={(v) => set({ color: v })} />
        {layer.color && <button onClick={() => set({ color: "" })} className="text-[10px] text-graphite/45 hover:text-graphite/80">reset</button>}
      </div>
    </Field>
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
        <Field label="Colour"><ColorInput value={layer.color} onChange={(v) => set({ color: v })} /></Field>
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
        <Field label="Fill colour"><ColorInput value={layer.fillColor} onChange={(v) => set({ fillColor: v })} /></Field>
        <Field label="Border"><ColorInput value={layer.borderColor} onChange={(v) => set({ borderColor: v })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Glow colour"><ColorInput value={layer.glowColor} onChange={(v) => set({ glowColor: v })} /></Field>
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
          <Field label="Text colour"><ColorInput value={(layer as any).labelColor ?? "#ffffff"} onChange={(v) => set({ labelColor: v })} /></Field>
        </div>
      </div>
    </Section>
  );
};
