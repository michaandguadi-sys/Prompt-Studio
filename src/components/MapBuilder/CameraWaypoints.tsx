"use client";

import React, { useCallback, useState } from "react";
import { useStudio } from "@/store/studio";
import {
  Search,
  Plus,
  X,
  Loader2,
  Globe2,
  Building2,
  MapPin,
  Settings2,
  Crosshair,
} from "lucide-react";
import { Section } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { SortableList, DragHandle } from "@/components/ui/SortableList";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { MapPicker } from "@/components/MapPicker/MapPicker";
import type { MapSceneSpec, CameraPos } from "@/lib/types";

type Result = {
  id: string;
  name: string;
  shortName?: string;
  placeType: string;
  lon: number;
  lat: number;
  zoom: number;
};

const ICONS: Record<string, React.ReactNode> = {
  country: <Globe2 size={12} />,
  region: <Globe2 size={12} />,
  place: <Building2 size={12} />,
  district: <Building2 size={12} />,
  locality: <Building2 size={12} />,
  default: <MapPin size={12} />,
};

/**
 * Unified camera waypoints editor (v3).
 *
 * What changed in v3:
 *  - Drag-and-drop reorder via @dnd-kit (GripVertical is now a real handle)
 *  - Active editing state shown as amber left border
 *  - Loading skeleton during search instead of empty silence
 *  - Search debounce centralized via useDebouncedSearch hook (cancellable)
 *  - "Inserting at start/end" pill stays visible so the destination is clear
 */
export const CameraWaypoints: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as MapSceneSpec;

  // Flatten the current schema to a single array
  const list: CameraPos[] = [
    scene.start,
    ...(scene.mid ? [scene.mid] : []),
    ...(scene.extraWaypoints ?? []),
    scene.end,
  ];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [insertAt, setInsertAt] = useState<"start" | "end">("end");
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetcher = useCallback(async (q: string, signal: AbortSignal): Promise<Result[]> => {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
    const d = await res.json();
    return d.results ?? [];
  }, []);
  const { results, loading } = useDebouncedSearch<Result>(q, fetcher);

  // ── Write helpers ──────────────────────────────────────────────────────
  const writeList = (next: CameraPos[]) => {
    if (next.length < 2) return;
    const start = next[0];
    const end = { ...scene.end, ...next[next.length - 1] };
    if (next.length === 2) {
      patchScene({ start, mid: undefined, extraWaypoints: [], end });
    } else if (next.length === 3) {
      patchScene({ start, mid: next[1], extraWaypoints: [], end });
    } else {
      patchScene({ start, mid: next[1], extraWaypoints: next.slice(2, -1), end });
    }
  };

  const applyResult = (r: Result) => {
    const wp: CameraPos = { lon: r.lon, lat: r.lat, zoom: r.zoom };
    const next = [...list];
    if (insertAt === "start") next.unshift(wp);
    else next.push(wp);
    writeList(next);
    setQ("");
  };

  const remove = (i: number) => {
    if (list.length <= 2) return;
    writeList(list.filter((_, idx) => idx !== i));
    if (editingIndex === i) setEditingIndex(null);
  };

  const updateField = (i: number, field: keyof CameraPos, v: number) => {
    const next = [...list];
    next[i] = { ...next[i], [field]: v };
    writeList(next);
  };

  const updateEnd = (field: "pitch" | "bearing", v: number) => {
    patchScene({ end: { ...scene.end, [field]: v } });
  };

  const labelFor = (i: number) =>
    i === 0 ? "Start" : i === list.length - 1 ? "End" : `Stop ${i}`;

  return (
    <Section title="Camera waypoints">
      {/* B1: bezier toggle — defaults on for ≥3 waypoints */}
      {list.length >= 3 && (
        <label className="flex items-center gap-2 text-xs text-white/70 mb-1">
          <input
            type="checkbox"
            checked={scene.smoothCameraPath !== false}
            onChange={(e) => patchScene({ smoothCameraPath: e.target.checked })}
            className="accent-amber"
          />
          Smooth bezier path (no kinks at corners)
        </label>
      )}
      <SortableList
        items={list}
        getId={(_, i) => `wp-${i}`}
        onReorder={writeList}
        renderItem={(wp, i, handle) => {
          const editing = editingIndex === i;
          const isLast = i === list.length - 1;
          return (
            <div
              aria-selected={editing}
              className={`rounded-md border mb-1 ${
                editing
                  ? "border-l-4 border-amber bg-amber/5 border-r border-t border-b border-r-ink-700 border-t-ink-700 border-b-ink-700"
                  : "border-ink-700 bg-ink-900"
              }`}
            >
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <DragHandle handle={handle} />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-amber">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-white/50">
                    {labelFor(i)}
                  </div>
                  <div className="text-[11px] font-mono text-white/80 truncate">
                    {wp.lat.toFixed(2)}, {wp.lon.toFixed(2)} · z{wp.zoom.toFixed(1)}
                  </div>
                </div>
                <button
                  onClick={() => setEditingIndex(editing ? null : i)}
                  className={editing ? "text-amber" : "text-white/40 hover:text-amber"}
                  title="Edit coordinates"
                >
                  <Settings2 size={12} />
                </button>
                <button
                  onClick={() => remove(i)}
                  disabled={list.length <= 2}
                  className="text-white/40 disabled:opacity-20 hover:text-red-400"
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
              {editing && (
                <div className="border-t border-ink-700 px-3 py-2 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <CoordInput label="Lon" value={wp.lon} onChange={(v) => updateField(i, "lon", v)} />
                    <CoordInput label="Lat" value={wp.lat} onChange={(v) => updateField(i, "lat", v)} />
                    <CoordInput label="Zoom" value={wp.zoom} onChange={(v) => updateField(i, "zoom", v)} step={0.1} />
                  </div>
                  {/* B2: pitch + bearing now available on EVERY waypoint (not just end) */}
                  <div className="grid grid-cols-2 gap-2">
                    <CoordInput
                      label="Pitch (°)"
                      value={isLast ? scene.end.pitch : (wp.pitch ?? 0)}
                      onChange={(v) => isLast ? updateEnd("pitch", v) : updateField(i, "pitch" as any, v)}
                      step={1}
                    />
                    <CoordInput
                      label="Bearing (°)"
                      value={isLast ? scene.end.bearing : (wp.bearing ?? 0)}
                      onChange={(v) => isLast ? updateEnd("bearing", v) : updateField(i, "bearing" as any, v)}
                      step={1}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        }}
      />

      {/* Insert-position pill + "pick on map" button */}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
        <Plus size={11} className="text-amber" />
        <span className="text-white/50">Inserting at:</span>
        {(["start", "end"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setInsertAt(p)}
            className={`px-2 py-0.5 rounded ${
              insertAt === p ? "bg-amber text-ink-950 font-semibold" : "text-white/50 hover:text-white"
            }`}
          >
            {p}
          </button>
        ))}
        <div className="flex-1" />
        <PickButton
          active={pickerOpen}
          onClick={() => setPickerOpen(true)}
          label="Pick on map"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a location to add as waypoint…"
          className="w-full rounded-md bg-ink-900 border border-ink-700 pl-7 pr-7 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber/60"
        />
        {loading && (
          <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-amber" />
        )}
      </div>
      {loading && q.length >= 2 && (
        <Skeleton rows={3} height={22} />
      )}
      {!loading && results.length > 0 && (
        <div className="space-y-0.5 max-h-40 overflow-y-auto rounded-md bg-ink-900 border border-ink-700 p-1">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => applyResult(r)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-white/70 hover:bg-ink-700 hover:text-white"
            >
              <span className="text-amber/70">{ICONS[r.placeType] ?? ICONS.default}</span>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-[10px] font-mono text-white/40">z{r.zoom.toFixed(1)}</span>
              <Plus size={10} className="text-amber" />
            </button>
          ))}
        </div>
      )}

      <div className="text-[10px] text-white/40 flex items-center gap-1">
        <Crosshair size={10} />
        Camera pans smoothly through {list.length} waypoint{list.length === 1 ? "" : "s"}. Drag to reorder.
      </div>
      <MapPicker
        open={pickerOpen}
        title={`Pick new waypoint (inserting at ${insertAt}) — pan/zoom/rotate to set camera`}
        initialLon={scene.end.lon}
        initialLat={scene.end.lat}
        initialZoom={scene.end.zoom}
        initialBearing={scene.end.bearing}
        initialPitch={scene.end.pitch}
        mapStyleUrl={scene.mapStyleUrl}
        onPick={(view) => {
          // Use the picker's full view state — user-set zoom + bearing + pitch
          const next = [...list];
          const wp: CameraPos = {
            lon: view.lon, lat: view.lat,
            zoom: view.zoom,
            pitch: view.pitch, bearing: view.bearing,
          };
          if (insertAt === "start") next.unshift(wp);
          else next.push(wp);
          writeList(next);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Section>
  );
};

const PickButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({
  active, onClick, label,
}) => (
  <button
    onClick={onClick}
    title={active ? "Cancel picking" : "Click on the map to place"}
    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider border transition ${
      active
        ? "bg-amber text-ink-950 border-amber animate-pulse"
        : "bg-ink-900 text-white/60 border-ink-700 hover:text-amber hover:border-amber/40"
    }`}
  >
    <Crosshair size={10} />
    {active ? "Click map" : label}
  </button>
);

const CoordInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}> = ({ label, value, onChange, step = 0.001 }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-wider text-white/50">{label}</span>
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className="rounded bg-ink-900 border border-ink-700 px-1.5 py-0.5 text-[11px] font-mono text-white focus:outline-none focus:border-amber/60"
    />
  </label>
);
