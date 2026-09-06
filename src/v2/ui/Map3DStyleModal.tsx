"use client";

import React, { useState } from "react";
import { RotateCcw, Sliders, Globe2, ChevronDown } from "lucide-react";
import { useEditor } from "../store/editor";
import { recordTaste } from "@/lib/taste";
import { createLayer } from "../doc/factory";
import { MAP3D_STYLES, map3dStyleById } from "@/lib/presets/map3dStyles";
import { PRO_MAP_STYLES, elementPaletteFor } from "@/lib/presets/proMapStyles";
import { EARTH_PRESETS, EARTH_CATEGORIES, earthLayerOverrides, type EarthPreset } from "@/lib/presets/earthLayers";
import { loadGoogleKey } from "./SettingsModal";

/** The colour patch a style's palette applies to each overlay element, so
 *  switching a style restyles the WHOLE scene — every route/marker/highlight/
 *  label takes on the look — not just the basemap. Structural colours → the
 *  style accent; text → readable ink; data ramps + the spotlight mask are left. */
function elementRestyle(l: any, pal: { accent: string; ink: string; water: string }): Record<string, unknown> | null {
  switch (l.type) {
    case "highlight":   return { borderColor: pal.accent, glowColor: pal.accent, fillColor: pal.accent, labelColor: pal.ink };
    case "route":       return { color: pal.accent };
    case "track":       return { color: pal.accent };
    case "flow":        return { color: pal.accent };
    case "connections": return { color: pal.accent };
    case "radius":      return { color: pal.accent };
    case "marker":      return { color: pal.accent, labelColor: pal.ink };
    case "label":       return { color: pal.ink, accent: pal.accent };
    case "annotation":  return { color: pal.ink, accent: pal.accent };
    case "timestamp":   return { accent: pal.accent };
    case "title":       return { accent: pal.accent };
    case "chart":       return { accent: pal.accent };
    default:            return null; // choropleth/bubble/heatmap ramps, spotlight mask, atmosphere, image
  }
}

/** LIVE EARTH — real NASA data as one-click looks. Each entry swaps the base
 *  style and lays a verified GIBS raster over it — the planet as it actually is:
 *  Blue Marble, city lights, active fires, vegetation, ocean heat, snow. All
 *  configs live in one place (src/lib/presets/earthLayers) and are verified to
 *  return imagery in Web Mercator (the old set silently 404'd for most). */
const LIVE_EARTH = EARTH_PRESETS;

/**
 * Map Style Gallery — the studio's ONE map-style picker, shown inline in the
 * Inspector's "Map style" section. One click turns the whole scene into a
 * distinctive look: 30 documentary/cinematic styles, real-data Live Earth, and
 * creative 3D worlds (holographic, neon, miniature diorama, blueprint, molten…).
 * Applies the style's basemap + look over the current composition, restyles
 * every overlay element to match, and sets the camera pitch. Available to all.
 */
export const MapStyleGallery: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const patchComposition = useEditor((s) => s.patchComposition);
  const layers = useEditor((s) => s.project.composition.layers);
  const patchLayer = useEditor((s) => s.patchLayer);
  const addLayers = useEditor((s) => s.addLayers);
  const removeLayer = useEditor((s) => s.removeLayer);

  /** Apply a LIVE EARTH look: lay the real NASA raster OVER whatever map style is
   *  already chosen — it does NOT replace the style. The raster renders under the
   *  style's borders/labels/grid (see MapComposition's beforeId), so the creator
   *  keeps their favourite look AND sees the live NASA imagery/data through it.
   *  Shows INSTANTLY (no fade delay) and every dataset is verified to load.
   *  Tune the blend with the earth layer's Opacity in the inspector. */
  const applyLiveEarth = (le: EarthPreset) => {
    recordTaste("style", le.key);
    // One live layer at a time — replace any existing earth observation layer.
    for (const l of layers) if (l.type === "earthlayer") removeLayer(l.id);
    addLayers([createLayer("earthlayer", earthLayerOverrides(le))]);
  };

  const activeId = (comp.basemap as any).style3d || "";

  const apply = (id: string) => {
    const style = map3dStyleById(id);
    if (!style) return;
    recordTaste("style", id); // the taste engine learns which looks you keep choosing
    patchComposition({
      basemap: { ...comp.basemap, ...style.basemap, style3d: style.id } as any,
      look: { ...comp.look, ...style.look } as any,
    });
    // Restyle EVERY element to the style's palette so the whole scene changes,
    // not just the map — routes, highlights, markers and labels all take on the
    // look (same palette the landing preview derives, so preview == editor).
    const pal = elementPaletteFor(style);
    for (const l of layers) {
      if (l.type === "camera") {
        if (typeof style.pitch === "number") patchLayer(l.id, { end: { ...(l as any).end, pitch: style.pitch } } as any);
        continue;
      }
      const patch = elementRestyle(l as any, pal);
      if (patch) patchLayer(l.id, patch as any);
    }
  };

  const reset = () => {
    patchComposition({
      basemap: { ...comp.basemap, style3d: "", landColor: "", waterColor: "", buildingColor: "", buildingOpacity: 0.62, buildingHeightMult: 1, buildingGradient: false, boundaryGlow: "", buildings3d: false } as any,
    });
  };

  const anyStyle = !!activeId || !!(comp.basemap as any).photoreal3d;
  const [tab, setTab] = useState<"pro" | "earth" | "creative">("pro");
  const [showTune, setShowTune] = useState(false);

  const TABS: { key: "pro" | "earth" | "creative"; label: string; count: number }[] = [
    { key: "pro", label: "Documentary", count: PRO_MAP_STYLES.length },
    { key: "earth", label: "Live Earth", count: LIVE_EARTH.length },
    { key: "creative", label: "Creative", count: MAP3D_STYLES.length },
  ];

  return (
    <div>
      {/* Segmented category switch — one scannable grid at a time keeps the panel
          calm (the whole gallery used to unroll ~50 cards and bury everything
          below it). Fine-tune hides behind progressive disclosure. */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex rounded-lg bg-graphite/[0.05] p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tab === t.key ? "bg-white text-graphite shadow-sm" : "text-graphite/50 hover:text-graphite/75"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {anyStyle && (
          <button onClick={reset} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-graphite/45 transition-colors hover:text-iris"><RotateCcw size={11} /> Reset</button>
        )}
      </div>

      {tab === "earth" && (
        <div className="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-emerald-600">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
          Real NASA data · updates daily
        </div>
      )}

      {/* Bounded, internally-scrolling grid so the Map-style section stays a
          predictable height no matter how many looks ship. */}
      <div className="grid max-h-[44vh] grid-cols-2 gap-2 overflow-y-auto pr-0.5">
        {tab === "pro" && PRO_MAP_STYLES.map((s) => <StyleCard key={s.id} s={s} on={activeId === s.id} onApply={apply} />)}
        {tab === "earth" && EARTH_CATEGORIES.map((cat) => (
          <React.Fragment key={cat}>
            <div className="col-span-2 mt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-graphite/40 first:mt-0">{cat}</div>
            {LIVE_EARTH.filter((le) => le.category === cat).map((le) => (
              <StyleCard
                key={le.key}
                s={{ id: le.key, name: le.name, tagline: le.tagline, swatches: le.swatches }}
                on={layers.some((l) => l.type === "earthlayer" && (l as any).datasetId === le.cfg.datasetId)}
                onApply={() => applyLiveEarth(le)}
              />
            ))}
          </React.Fragment>
        ))}
        {tab === "creative" && MAP3D_STYLES.map((s) => <StyleCard key={s.id} s={s} on={activeId === s.id} onApply={apply} />)}
      </div>

      {/* ── Fine-tune — every 3D knob, but out of the way until you want it ── */}
      <button
        onClick={() => setShowTune((v) => !v)}
        className="mt-2.5 flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-graphite/60 transition-colors hover:border-iris/40 hover:text-graphite"
      >
        <span className="inline-flex items-center gap-1.5"><Sliders size={11} className="text-iris/70" /> Fine-tune this world</span>
        <ChevronDown size={13} className={`transition-transform duration-300 ${showTune ? "" : "-rotate-90"}`} />
      </button>
      {showTune && <FineTune comp={comp} patchComposition={patchComposition} layers={layers} patchLayer={patchLayer} />}

      <div className="mt-2.5 text-[10px] text-graphite/40">One tap restyles the whole scene — map, routes, markers and labels. 3D buildings show at city zoom.</div>
    </div>
  );
};

/* ── One style card (shared by both collections) ──────────────────────────── */
const StyleCard: React.FC<{ s: { id: string; name: string; tagline: string; swatches: [string, string, string] }; on: boolean; onApply: (id: string) => void }> = ({ s, on, onApply }) => (
  <button onClick={() => onApply(s.id)}
    className={`group relative overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 ${on ? "border-[#6E7BFF] ring-1 ring-[#6E7BFF]/50" : "border-line hover:border-[#6E7BFF]/40"}`}>
    {/* Swatch preview — a tiny map motif from the style's palette */}
    <div className="relative h-20 w-full overflow-hidden" style={{ background: s.swatches[0] }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 120%, ${s.swatches[1]}55, transparent 60%)` }} />
      <div className="absolute bottom-2 left-3 h-7 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.85, boxShadow: `0 0 10px ${s.swatches[2]}` }} />
      <div className="absolute bottom-2 left-7 h-10 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.95, boxShadow: `0 0 12px ${s.swatches[2]}` }} />
      <div className="absolute bottom-2 left-11 h-5 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.8 }} />
      <div className="absolute bottom-2 right-3 h-8 w-3 rounded-sm" style={{ background: s.swatches[2], opacity: 0.9, boxShadow: `0 0 12px ${s.swatches[2]}` }} />
      <div className="absolute bottom-2 left-0 right-0 h-px" style={{ background: s.swatches[2], opacity: 0.5 }} />
    </div>
    <div className="px-2.5 py-2">
      <div className={`text-[12px] font-semibold ${on ? "text-iris" : "text-graphite/80"}`}>{s.name}</div>
      <div className="mt-0.5 truncate text-[10px] text-graphite/45">{s.tagline}</div>
    </div>
    {on && <span className="absolute right-2 top-2 rounded-full bg-[#6E7BFF] px-1.5 py-0.5 text-[8px] font-bold text-white">ACTIVE</span>}
  </button>
);

/* ── Live fine-tune controls for the active 3D world ──────────────────────── */
const FineTune: React.FC<{ comp: any; patchComposition: (p: any) => void; layers: any[]; patchLayer: (id: string, p: any) => void }> = ({ comp, patchComposition, layers, patchLayer }) => {
  const bm = comp.basemap as any;
  const hasKey = !!loadGoogleKey();
  const setBM = (patch: any) => patchComposition({ basemap: { ...comp.basemap, ...patch } });
  const cam = layers.find((l) => l.type === "camera") as any;
  const pitch = cam?.end?.pitch ?? 45;
  const setPitch = (v: number) => { if (cam) patchLayer(cam.id, { end: { ...cam.end, pitch: v } }); };

  return (
    <div className="mt-4 rounded-xl border border-line bg-graphite/[0.02] p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/45">
        <Sliders size={11} className="text-iris/70" /> Fine-tune this world
      </div>

      {/* Photoreal 3D (Google Earth) — gated on a BYO Google Maps key */}
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[#2FE0FF]/25 bg-[#2FE0FF]/[0.05] p-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-graphite"><Globe2 size={12} className="text-[#0e7d92]" /> Photoreal 3D — Google Earth</div>
          <div className="mt-0.5 text-[10px] leading-snug text-graphite/50">{hasKey ? "Real Earth 3D world in the live preview (export falls back to satellite + terrain)." : "Add a Google Maps key in Settings → Photoreal 3D to enable."}</div>
        </div>
        <button
          onClick={() => { if (hasKey) setBM({ photoreal3d: !bm.photoreal3d }); }}
          disabled={!hasKey}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${bm.photoreal3d ? "bg-[#2FE0FF]" : "bg-white/15"}`}
          title={hasKey ? "Toggle Google Earth photoreal 3D" : "Needs a Google Maps key"}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${bm.photoreal3d ? "left-4" : "left-0.5"}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Toggle label="3D buildings" on={!!bm.buildings3d} onChange={(v) => setBM({ buildings3d: v })} />
        <Toggle label="Glassy gradient" on={!!bm.buildingGradient} onChange={(v) => setBM({ buildingGradient: v })} />
        <ColorBox label="Building color" value={bm.buildingColor} fallback="#b9c2d6" onChange={(c) => setBM({ buildingColor: c })} />
        <ColorBox label="Edge glow" value={bm.boundaryGlow} fallback="#6E7BFF" onChange={(c) => setBM({ boundaryGlow: c })} />
        <Slider label="Building opacity" min={0} max={1} step={0.05} value={bm.buildingOpacity ?? 0.62} onChange={(v) => setBM({ buildingOpacity: v })} fmt={(v) => v.toFixed(2)} />
        <Slider label="Building height" min={0.2} max={8} step={0.1} value={bm.buildingHeightMult ?? 1} onChange={(v) => setBM({ buildingHeightMult: v })} fmt={(v) => `${v.toFixed(1)}×`} />
        <ColorBox label="Land color" value={bm.landColor} fallback="#0b0f1d" onChange={(c) => setBM({ landColor: c })} />
        <ColorBox label="Water color" value={bm.waterColor} fallback="#0c1828" onChange={(c) => setBM({ waterColor: c })} />
        <Toggle label="3D terrain" on={!!bm.terrain} onChange={(v) => setBM({ terrain: v })} />
        <Slider label="Terrain strength" min={0} max={5} step={0.1} value={bm.terrainStrength ?? 1.4} onChange={(v) => setBM({ terrainStrength: v })} fmt={(v) => v.toFixed(1)} />
        <Slider label="Camera tilt" min={0} max={85} step={1} value={pitch} onChange={setPitch} fmt={(v) => `${Math.round(v)}°`} />
      </div>
    </div>
  );
};

const Slider: React.FC<{ label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt: (v: number) => string }> = ({ label, min, max, step, value, onChange, fmt }) => (
  <label className="flex flex-col gap-1">
    <span className="flex items-center justify-between text-[10px] text-graphite/60"><span>{label}</span><span className="tabular-nums text-graphite/45">{fmt(value)}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="h-1 w-full accent-[#6E7BFF]" />
  </label>
);

const ColorBox: React.FC<{ label: string; value: string; fallback: string; onChange: (c: string) => void }> = ({ label, value, fallback, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[10px] text-graphite/60">{label}</span>
    <div className="flex items-center gap-1">
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-5 w-7 cursor-pointer rounded border border-white/15 bg-transparent p-0" title={value || "default"} />
      {value && <button onClick={() => onChange("")} title="Clear" className="text-[10px] text-graphite/40 hover:text-graphite/70">✕</button>}
    </div>
  </div>
);

const Toggle: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
  <button onClick={() => onChange(!on)} className="flex items-center justify-between gap-2 text-left">
    <span className="text-[10px] text-graphite/60">{label}</span>
    <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-[#6E7BFF]" : "bg-white/15"}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${on ? "left-3.5" : "left-0.5"}`} />
    </span>
  </button>
);
