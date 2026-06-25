"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Video, Globe2, Plane, MapPin, Flag, Type, BarChart3, Image as ImageIcon,
  Swords, MessageSquare, Share2, Sun, Eye, EyeOff, ChevronUp, ChevronDown, Trash2, Plus, Copy, Route, Loader2, CircleDot, X, Spline, Flame,
} from "lucide-react";
import { useEditor } from "../store/editor";
import { LAYER_REGISTRY } from "../layers/registry";
import type { LayerType } from "../doc/schema";
import { parseTrackFile } from "../track";
import { STYLE_PRESETS, VARIANT_PRESETS } from "../track/presets";

const ICONS: Record<string, React.ReactNode> = {
  Video: <Video size={14} />, Globe2: <Globe2 size={14} />, Plane: <Plane size={14} />,
  MapPin: <MapPin size={14} />, Flag: <Flag size={14} />, Type: <Type size={14} />,
  BarChart3: <BarChart3 size={14} />, Image: <ImageIcon size={14} />, Swords: <Swords size={14} />,
  MessageSquare: <MessageSquare size={14} />, Share2: <Share2 size={14} />, Sun: <Sun size={14} />,
  Route: <Route size={14} />, CircleDot: <CircleDot size={14} />, Spline: <Spline size={14} />, Flame: <Flame size={14} />,
};
const iconFor = (t: LayerType) => ICONS[LAYER_REGISTRY[t].icon] ?? <MapPin size={14} />;

/** Add-layer palette, grouped so every overlay (incl. Highlight) is easy to find. */
const ADD_CATEGORIES: { label: string; types: LayerType[] }[] = [
  { label: "Places & pins", types: ["label", "marker", "flag", "annotation", "spotlight"] },
  { label: "Regions & data", types: ["highlight", "choropleth", "bubble", "heatmap", "chart"] },
  { label: "Routes & networks", types: ["route", "connections", "flow"] },
  { label: "Titles & media", types: ["title", "image"] },
];

export const LayersPanel: React.FC = () => {
  const allLayers = useEditor((s) => s.project.composition.layers);
  const proMode = useEditor((s) => s.proMode);
  const setProMode = useEditor((s) => s.setProMode);
  // Simple mode hides the camera layer — it's auto-managed and confuses beginners.
  const layers = proMode ? allLayers : allLayers.filter((l) => l.type !== "camera");
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const patchLayer = useEditor((s) => s.patchLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const moveLayer = useEditor((s) => s.moveLayer);
  const addLayer = useEditor((s) => s.addLayer);
  const patchComposition = useEditor((s) => s.patchComposition);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Import a GPS track straight into the OPEN project as a `track` layer (the
  // home picker creates a new project; here we add to what you're editing).
  const importTrack = async (file: File) => {
    setImporting(true);
    try {
      const { track } = await parseTrackFile(file);
      const sb = STYLE_PRESETS["vox-dark"], vp = VARIANT_PRESETS["overview-draw"];
      addLayer("track", {
        name: track.name || "Track", points: track.points, segments: track.segments, stats: track.stats,
        sourceName: file.name, hasElevation: track.hasElevation, hasTime: track.hasTime,
        variant: "overview-draw", style: "vox-dark",
        routeColor: sb.routeColor, routeGlow: sb.routeGlow, routeWidth: sb.routeWidth, trailColor: sb.trailColor, dotColor: sb.dotColor,
        pitch: vp.pitch,
        labels: { start: true, end: true, distance: track.stats.distanceM > 0, elevation: track.hasElevation },
      });
      const cur = useEditor.getState().project.composition;
      patchComposition({ basemap: { ...cur.basemap, styleUrl: sb.baseStyleUrl }, look: { ...cur.look, bgColor: sb.bgColor } });
    } catch (e: any) {
      alert(e?.message || "Couldn't import that track file.");
    } finally { setImporting(false); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line/60">
        <div className="flex items-center gap-2">
          {/* Simple ↔ Pro — Pro reveals the camera + advanced fine-tuning. */}
          <button
            onClick={() => setProMode(!proMode)}
            title={proMode ? "Pro mode: camera + all controls shown. Click for Simple." : "Simple mode: camera auto-managed, panels clean. Click for Pro."}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${proMode ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/45 hover:text-graphite/70"}`}
          >
            {proMode ? "Pro" : "Simple"}
          </button>
        </div>
        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            title="Import a GPS track (GPX, TCX, KML, GeoJSON) as a flythrough layer"
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-graphite/60 hover:border-iris hover:text-iris transition-colors"
          >
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />} GPX
          </button>
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".gpx,.fit,.tcx,.kml,.kmz,.geojson,.json,application/gpx+xml,application/xml,text/xml,application/json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importTrack(f); e.currentTarget.value = ""; }}
          />
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform"
          >
            <Plus size={12} /> Add
          </button>
          {addOpen && typeof document !== "undefined" && createPortal(
            <div className="editor-pro fixed inset-0 z-[200] flex items-start justify-center bg-black/55 p-6 pt-[12vh] backdrop-blur-sm" onClick={() => setAddOpen(false)}>
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-paper-200 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85)]" style={{ animation: "scale-in 0.18s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-graphite-muted">Add to the map</span>
                  <button onClick={() => setAddOpen(false)} className="rounded-md p-1 text-graphite-muted transition-colors hover:bg-graphite/[0.08] hover:text-graphite"><X size={15} /></button>
                </div>
                <div className="max-h-[58vh] overflow-y-auto p-3">
                  {ADD_CATEGORIES.map((cat) => (
                    <div key={cat.label} className="mb-3 last:mb-0">
                      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-iris/80">{cat.label}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {cat.types.map((t) => {
                          const m = LAYER_REGISTRY[t];
                          return (
                            <button
                              key={t}
                              onClick={() => { addLayer(t); setAddOpen(false); }}
                              className="group flex items-start gap-2.5 rounded-lg border border-line/60 bg-paper/50 p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-iris/45 hover:bg-iris/10"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-graphite/[0.08] text-iris transition-colors group-hover:bg-iris/20">{iconFor(t)}</span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-graphite">{m.label}</span>
                                <span className="block text-[10px] leading-tight text-graphite-muted/80">{m.hint}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers.map((l, i) => {
          const active = l.id === selectedId;
          const enabled = l.enabled !== false;
          return (
            <div
              key={l.id}
              onClick={() => select(l.id)}
              className={[
                "group relative flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-150",
                active ? "bg-iris/[0.12] ring-1 ring-inset ring-iris/30" : "hover:bg-graphite/[0.05]",
              ].join(" ")}
            >
              {/* Active accent bar */}
              {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-iris" />}
              <button
                onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { enabled: !enabled }); }}
                className={`rounded p-0.5 transition-colors ${enabled ? "text-iris hover:bg-iris/10" : "text-graphite/25 hover:text-graphite/60"}`}
                title={enabled ? "Hide" : "Show"}
              >
                {enabled ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${active ? "bg-iris/15 text-iris" : "bg-graphite/[0.06] text-graphite/55 group-hover:text-graphite/75"}`}>{iconFor(l.type)}</span>
              <span className={`min-w-0 flex-1 truncate text-xs transition-colors ${active ? "font-medium text-graphite" : "text-graphite/80"} ${enabled ? "" : "line-through opacity-50"}`}>
                {l.name || LAYER_REGISTRY[l.type].label}
              </span>
              {l.type !== "camera" && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} disabled={i === 0} className="p-0.5 text-graphite/30 hover:text-graphite disabled:opacity-20"><ChevronUp size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} disabled={i === layers.length - 1} className="p-0.5 text-graphite/30 hover:text-graphite disabled:opacity-20"><ChevronDown size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); duplicateLayer(l.id); }} className="p-0.5 text-graphite/30 hover:text-iris"><Copy size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${l.name || l.type}"?`)) removeLayer(l.id); }} className="p-0.5 text-graphite/30 hover:text-red-400"><Trash2 size={11} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
