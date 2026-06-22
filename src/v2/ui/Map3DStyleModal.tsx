"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X, Boxes, RotateCcw, Sliders, Globe2 } from "lucide-react";
import { useEditor } from "../store/editor";
import { MAP3D_STYLES } from "@/lib/presets/map3dStyles";
import { loadGoogleKey } from "./SettingsModal";

/**
 * Creative 3D Map Styles — one click turns the whole map into a distinctive 3D
 * world (holographic, neon, miniature diorama, blueprint, molten…). Applies the
 * style's basemap + look over the current composition and sets the camera pitch.
 */
export const Map3DStyleModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const comp = useEditor((s) => s.project.composition);
  const patchComposition = useEditor((s) => s.patchComposition);
  const layers = useEditor((s) => s.project.composition.layers);
  const patchLayer = useEditor((s) => s.patchLayer);
  if (!open || typeof document === "undefined") return null;

  const activeId = (comp.basemap as any).style3d || "";

  const apply = (id: string) => {
    const style = MAP3D_STYLES.find((s) => s.id === id);
    if (!style) return;
    patchComposition({
      basemap: { ...comp.basemap, ...style.basemap, style3d: style.id } as any,
      look: { ...comp.look, ...style.look } as any,
    });
    const cam = layers.find((l) => l.type === "camera") as any;
    if (cam && typeof style.pitch === "number") {
      patchLayer(cam.id, { end: { ...cam.end, pitch: style.pitch } } as any);
    }
  };

  const reset = () => {
    patchComposition({
      basemap: { ...comp.basemap, style3d: "", landColor: "", waterColor: "", buildingColor: "", buildingOpacity: 0.62, buildingHeightMult: 1, buildingGradient: false, boundaryGlow: "", buildings3d: false } as any,
    });
  };

  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-white" onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 40px 110px -34px rgba(20,28,55,0.42), 0 6px 20px -8px rgba(20,28,55,0.18)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6E7BFF]/50 to-transparent" />
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#2FE0FF)" }}><Boxes size={13} /></span>
            <h2 className="text-sm font-semibold text-graphite">Creative 3D map styles</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-graphite/60 transition-colors hover:border-graphite/25 hover:text-graphite"><RotateCcw size={12} /> Reset</button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-graphite/45 transition-colors hover:bg-graphite/[0.05] hover:text-graphite"><X size={16} /></button>
          </div>
        </div>

        <div className="max-h-[74vh] overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[12px] leading-relaxed text-graphite/55">
            One click reimagines the whole map as a 3D world — recoloured land &amp; water, art-directed 3D buildings, glowing edges, relief and grade. Tweak any of it after in the inspector.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MAP3D_STYLES.map((s) => {
              const on = activeId === s.id;
              return (
                <button key={s.id} onClick={() => apply(s.id)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 ${on ? "border-[#6E7BFF] ring-1 ring-[#6E7BFF]/50" : "border-line hover:border-[#6E7BFF]/40"}`}>
                  {/* Swatch preview — a tiny 3D-map motif from the style's palette */}
                  <div className="relative h-20 w-full overflow-hidden" style={{ background: s.swatches[0] }}>
                    <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 120%, ${s.swatches[1]}55, transparent 60%)` }} />
                    {/* faux extruded blocks */}
                    <div className="absolute bottom-2 left-3 h-7 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.85, boxShadow: `0 0 10px ${s.swatches[2]}` }} />
                    <div className="absolute bottom-2 left-7 h-10 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.95, boxShadow: `0 0 12px ${s.swatches[2]}` }} />
                    <div className="absolute bottom-2 left-11 h-5 w-3 rounded-sm" style={{ background: s.swatches[1], opacity: 0.8 }} />
                    <div className="absolute bottom-2 right-3 h-8 w-3 rounded-sm" style={{ background: s.swatches[2], opacity: 0.9, boxShadow: `0 0 12px ${s.swatches[2]}` }} />
                    {/* horizon glow line */}
                    <div className="absolute bottom-2 left-0 right-0 h-px" style={{ background: s.swatches[2], opacity: 0.5 }} />
                  </div>
                  <div className="px-2.5 py-2">
                    <div className={`text-[12px] font-semibold ${on ? "text-iris" : "text-graphite/80"}`}>{s.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-graphite/45">{s.tagline}</div>
                  </div>
                  {on && <span className="absolute right-2 top-2 rounded-full bg-[#6E7BFF] px-1.5 py-0.5 text-[8px] font-bold text-white">ACTIVE</span>}
                </button>
              );
            })}
          </div>
          {/* ── Super-adjustable fine-tune — every 3D knob, live ───────────── */}
          <FineTune comp={comp} patchComposition={patchComposition} layers={layers} patchLayer={patchLayer} />

          <div className="mt-3 text-[10px] text-graphite/40">3D buildings show at city zoom; recolour, relief and grade carry every shot. Switch the map style picker for a different base.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

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
        <Slider label="Camera tilt" min={0} max={84} step={1} value={pitch} onChange={setPitch} fmt={(v) => `${Math.round(v)}°`} />
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
