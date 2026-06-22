"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Plane,
  Car,
  Bike,
  Ship,
  PersonStanding,
  Search,
  Loader2,
  X,
  Sparkles,
  Image as ImageIcon,
  Plus,
  Crosshair,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import { Section, Field, NumberInput } from "@/components/ui/Field";
import { ColorInput } from "@/components/ui/ColorInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { SortableList, DragHandle } from "@/components/ui/SortableList";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import type { MapSceneSpec, RouteSpec, TransportMode, RouteIconPreset } from "@/lib/types";

const MODE_ICONS: Record<TransportMode, React.ReactNode> = {
  walking: <PersonStanding size={14} />,
  cycling: <Bike size={14} />,
  driving: <Car size={14} />,
  "driving-traffic": <Car size={14} />,
  boat: <Ship size={14} />,
  aircraft: <Plane size={14} />,
};

const MODE_LABELS: Record<TransportMode, string> = {
  walking: "Walk",
  cycling: "Bike",
  driving: "Drive",
  "driving-traffic": "Traffic",
  boat: "Boat",
  aircraft: "Flight",
};

const MODE_HINTS: Record<TransportMode, string> = {
  walking: "Streets + footpaths + hiking trails (OSM)",
  cycling: "Streets + bike paths + cycle ways (OSM)",
  driving: "Streets passable by car",
  "driving-traffic": "Streets with current traffic data",
  boat: "Great-circle arc — add stops in water for coastal voyages",
  aircraft: "Great-circle (the shortest path on a sphere)",
};

const ICON_PRESETS: { id: RouteIconPreset; label: string; node: React.ReactNode }[] = [
  { id: "walking",  label: "Walking",  node: <PersonStanding size={14} /> },
  { id: "bike",     label: "Bike",     node: <Bike size={14} /> },
  { id: "car",      label: "Car",      node: <Car size={14} /> },
  { id: "boat",     label: "Boat",     node: <Ship size={14} /> },
  { id: "aircraft", label: "Aircraft", node: <Plane size={14} /> },
  { id: "custom",   label: "Custom",   node: <ImageIcon size={14} /> },
];

/** "X hours Y min" or "Z min" — used in the route status pill. */
function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const defaultRouteStyle = (palette: any) => ({
  // Default to WHITE so the route always contrasts against any basemap
  // (dark, light, satellite). Users can change to a brand color afterward.
  color: "#ffffff",
  width: 6,
  glowColor: palette.glowColor,
  glowWidth: 24,
  casingColor: "#06080f",
  casingWidth: 14,
  dashed: false,
});

/** Compute a sensible camera frame for two points (centered + zoom-to-fit). */
function frameBbox(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const cLon = (a.lon + b.lon) / 2;
  const cLat = (a.lat + b.lat) / 2;
  const span = Math.max(Math.abs(a.lon - b.lon), Math.abs(a.lat - b.lat));
  const zoom = Math.max(2, Math.min(13, Math.log2(360 / Math.max(0.01, span)) - 1));
  return {
    start: { lon: cLon, lat: cLat, zoom: Math.max(2, zoom - 0.5) },
    end: { lon: cLon, lat: cLat, zoom, pitch: 0, bearing: 0 },
  };
}

type Stop = { lon: number; lat: number; name?: string };

export const RouteEditor: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as MapSceneSpec;
  const palette = spec.style.palette;

  const route = scene.route;
  const [resolving, setResolving] = useState(false);

  // Flattened stops list
  const stops: Stop[] = route ? [route.from, ...(route.via ?? []), route.to] : [];

  // ── Re-resolve when stops or transport change ─────────────────────────
  // Audit fix: AbortController on every fetch + use latest patchScene via
  // closure-fresh reference (we re-read from store, not capture).
  const stopsKey = JSON.stringify(stops);
  useEffect(() => {
    if (!route) return;
    const controller = new AbortController();
    (async () => {
      setResolving(true);
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: route.from,
            via: route.via,
            to: route.to,
            transport: route.transport,
          }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const data = await res.json();
        if (res.ok && data.coordinates?.length) {
          // Read patchScene from store at call-time, not effect-closure-time
          useStudio.getState().patchScene({
            route: {
              ...route,
              coordinates: data.coordinates,
              distanceKm: data.distanceKm,
              durationMin: data.durationMin,
              resolvedAt: Date.now(),
            },
          });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          // swallow — UX is the route just doesn't update; surface in console
          console.warn("Route resolve failed:", e);
        }
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, route?.transport]);

  const addRoute = () => {
    const from = { lon: scene.start.lon, lat: scene.start.lat };
    const to = { lon: scene.end.lon, lat: scene.end.lat };
    // Snapshot the current camera BEFORE auto-framing — we'll restore it
    // when the user toggles route visibility off, so they don't lose their
    // careful camera setup.
    const prevCamera = {
      start: { ...scene.start },
      mid: scene.mid ? { ...scene.mid } : undefined,
      extraWaypoints: scene.extraWaypoints?.map((w) => ({ ...w })),
      end: { ...scene.end },
    };
    const newRoute: RouteSpec = {
      from, to,
      via: [],
      transport: "driving",
      coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
      resolvedAt: 0,
      style: defaultRouteStyle(palette),
      icon: { preset: "car", size: 96, show: true },
      drawDuration: 0.7,
      animationStyle: "draw",
      enabled: true,
      prevCamera,
    };
    // Auto-frame the camera on the route bbox so the user actually SEES it.
    patchScene({ route: newRoute, ...frameBbox(from, to) });
  };

  const frameRoute = () => {
    if (!route?.coordinates?.length) return;
    const lons = route.coordinates.map((c) => c[0]);
    const lats = route.coordinates.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const cLon = (minLon + maxLon) / 2;
    const cLat = (minLat + maxLat) / 2;
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    const zoom = Math.max(2, Math.min(13, Math.log2(360 / Math.max(0.01, span)) - 1));
    patchScene({
      start: { lon: cLon, lat: cLat, zoom: Math.max(2, zoom - 0.5) },
      end: { ...scene.end, lon: cLon, lat: cLat, zoom },
    });
  };

  const remove = () => {
    if (!route) return;
    const wantsRestore = !!route.prevCamera;
    const msg = wantsRestore
      ? "Delete route and RESTORE the camera you had before adding it? (Undo is also available.)"
      : "Delete route and all its settings? This cannot be undone (use undo to restore).";
    if (confirm(msg)) {
      if (wantsRestore && route.prevCamera) {
        patchScene({ route: null, ...route.prevCamera });
      } else {
        patchScene({ route: null });
      }
    }
  };

  /**
   * Toggling visibility ALSO swaps the camera state:
   *  - enabled → false: restore prevCamera (the framing you had before the route)
   *  - enabled → true: re-apply the route's auto-framed bbox
   * Each transition snapshots the CURRENT camera so re-toggling round-trips cleanly.
   */
  const toggleEnabled = (enabled: boolean) => {
    if (!route) return;
    const currentCamera = {
      start: { ...scene.start },
      mid: scene.mid ? { ...scene.mid } : undefined,
      extraWaypoints: scene.extraWaypoints?.map((w) => ({ ...w })),
      end: { ...scene.end },
    };
    if (enabled) {
      // Turning ON — store the off-state camera and restore the route framing
      const restore = route.prevCamera ?? currentCamera;
      patchScene({
        route: { ...route, enabled: true, prevCamera: currentCamera },
        ...restore,
      });
    } else {
      // Turning OFF — restore the pre-route camera, save the on-state camera
      const restore = route.prevCamera ?? currentCamera;
      patchScene({
        route: { ...route, enabled: false, prevCamera: currentCamera },
        ...restore,
      });
    }
  };

  const updateRoute = (patch: Partial<RouteSpec>) => {
    if (!route) return;
    patchScene({ route: { ...route, ...patch } });
  };

  const updateStyle = (k: keyof RouteSpec["style"], v: number | string | boolean) => {
    if (!route) return;
    patchScene({ route: { ...route, style: { ...route.style, [k]: v } } });
  };

  // Stops list mutations
  const writeStops = (next: Stop[]) => {
    if (next.length < 2 || !route) return;
    patchScene({
      route: { ...route, from: next[0], via: next.slice(1, -1), to: next[next.length - 1] },
    });
  };
  const addStopAt = (pos: number, stop: Stop) => {
    const next = [...stops];
    next.splice(pos, 0, stop);
    writeStops(next);
  };
  const removeStop = (i: number) => {
    if (stops.length <= 2) return;
    writeStops(stops.filter((_, idx) => idx !== i));
  };
  const moveStop = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    writeStops(next);
  };

  if (!route) {
    return (
      <Section title="Route animation">
        <button
          onClick={addRoute}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink-600 px-3 py-3 text-xs uppercase tracking-wider text-white/60 hover:border-amber hover:text-amber transition"
        >
          <Sparkles size={14} />
          Add animated route
        </button>
        <div className="text-[10px] text-white/40">
          Seeds from current Start &amp; End. Animates a vehicle along the path.
        </div>
      </Section>
    );
  }

  const isEnabled = route.enabled !== false;
  return (
    <Section title="Route animation">
      {/* ── Visibility toggle — preserves all settings when off ──── */}
      <label className="flex items-center gap-2 text-sm text-white/80 rounded-md border border-ink-700 bg-ink-900/40 px-2 py-1.5">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          className="accent-amber"
        />
        <span className="flex-1">
          <span className="font-semibold">Show route in scene</span>
          <span className="ml-2 text-[10px] text-white/40">
            (toggle off to compare with/without — settings preserved)
          </span>
        </span>
      </label>

      {/* All controls below are dimmed when route is hidden */}
      <div className={isEnabled ? "" : "opacity-50 pointer-events-none"}>

      {/* ── Status + Frame button ──────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-md border border-amber/30 bg-amber/5 px-2 py-1.5">
        <div className={`h-2 w-2 rounded-full ${
          resolving ? "bg-amber animate-pulse" :
          route.coordinates.length > 2 ? "bg-emerald-400" : "bg-amber/60"
        }`} />
        <div className="flex-1 text-[11px] text-white/80">
          {resolving ? (
            <>Resolving route…</>
          ) : (
            <>
              {typeof route.distanceKm === "number" && (
                <>
                  <strong className="text-amber">{route.distanceKm.toLocaleString()} km</strong>
                  {typeof route.durationMin === "number" && route.durationMin > 0 && (
                    <span className="text-white/70"> · ~{formatDuration(route.durationMin)}</span>
                  )}
                  <span className="text-white/40"> · {route.transport}</span>
                </>
              )}
              {typeof route.distanceKm !== "number" && (
                <>
                  <strong className="text-amber">{route.coordinates.length}</strong> coords
                  <span className="text-white/40"> · {stops.length} stops · {route.transport}</span>
                </>
              )}
            </>
          )}
        </div>
        <button
          onClick={frameRoute}
          className="flex items-center gap-1 rounded bg-ink-900 border border-ink-700 px-2 py-0.5 text-[10px] text-white/70 hover:text-amber hover:border-amber/40"
          title="Move camera to fit the route in frame"
        >
          <Crosshair size={10} />
          Frame
        </button>
      </div>

      {/* ── Transport mode ──────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(MODE_LABELS) as TransportMode[]).map((m) => {
            const active = route.transport === m;
            return (
              <button
                key={m}
                onClick={() => updateRoute({ transport: m })}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] border transition ${
                  active
                    ? "bg-amber/20 border-amber text-white"
                    : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
                }`}
              >
                {MODE_ICONS[m]}
                <span>{MODE_LABELS[m]}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-white/40">
          {MODE_HINTS[route.transport]}
        </div>
      </div>

      {/* ── Stops list — drag to reorder ──────────────────────────────── */}
      <div className="space-y-1">
        <SortableList
          items={stops}
          getId={(_, i) => `stop-${i}`}
          onReorder={writeStops}
          renderItem={(s, i, handle) => (
            <div className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 mb-1">
              <DragHandle handle={handle} size={11} />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-amber">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-white/50">
                  {i === 0 ? "From" : i === stops.length - 1 ? "To" : `Via ${i}`}
                </div>
                <div className="text-[11px] text-white/80 truncate">
                  {s.name ?? `${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}`}
                </div>
              </div>
              <button
                onClick={() => removeStop(i)}
                disabled={stops.length <= 2}
                className="text-white/40 disabled:opacity-20 hover:text-red-400"
              >
                <X size={11} />
              </button>
            </div>
          )}
        />
        <StopSearch
          onSelect={(s, where) => addStopAt(where === "start" ? 0 : stops.length, s)}
        />
      </div>

      {/* ── Resolution status ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[11px] text-white/50">
        {resolving ? (
          <>
            <Loader2 size={12} className="animate-spin text-amber" /> Resolving route…
          </>
        ) : (
          <>{route.coordinates.length} points · {stops.length} stops · drawn over {Math.round((route.drawDuration ?? 0.7) * 100)}% of duration</>
        )}
      </div>

      {/* ── Animation style ─────────────────────────────────────────── */}
      <Field label="Animation style">
        <div className="grid grid-cols-2 gap-1">
          {([
            { id: "draw",        label: "Draw",        hint: "Line draws from start → end" },
            { id: "fade",        label: "Fade in",     hint: "Whole line, opacity ramp" },
            { id: "dotted-flow", label: "Dotted flow", hint: "Dashes flow along path" },
            { id: "static",      label: "Static",      hint: "Always visible" },
          ] as const).map((opt) => {
            const active = (route.animationStyle ?? "draw") === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => updateRoute({ animationStyle: opt.id })}
                title={opt.hint}
                className={`rounded-md px-2 py-1.5 text-[11px] border transition text-left ${
                  active
                    ? "bg-amber/20 border-amber text-white"
                    : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] text-white/50">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* ── Draw duration (hidden for static) ────────────────────────── */}
      {(route.animationStyle ?? "draw") !== "static" && (
        <div>
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-wider text-white/60">
              Animation duration
            </div>
            <div className="text-xs font-mono text-amber">
              {Math.round((route.drawDuration ?? 0.7) * 100)}%
            </div>
          </div>
          <input
            type="range" min={10} max={100} step={5}
            value={Math.round((route.drawDuration ?? 0.7) * 100)}
            onChange={(e) => updateRoute({ drawDuration: Number(e.target.value) / 100 })}
            className="w-full accent-amber"
          />
          <div className="text-[10px] text-white/40 mt-0.5">
            Fraction of scene duration the animation spans.
          </div>
        </div>
      )}

      {/* ── Vehicle icon ─────────────────────────────────────────────── */}
      <Field label="Vehicle icon">
        <div className="grid grid-cols-3 gap-1">
          {ICON_PRESETS.map((p) => {
            const active = route.icon.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => updateRoute({ icon: { ...route.icon, preset: p.id } })}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] border transition ${
                  active
                    ? "bg-amber/20 border-amber text-white"
                    : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
                }`}
              >
                {p.node}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </Field>
      {route.icon.preset === "custom" && (
        <Field label="Custom icon URL" hint="PNG/SVG/GIF — public URL or /fonts/...">
          <input
            value={route.icon.customUrl ?? ""}
            onChange={(e) => updateRoute({ icon: { ...route.icon, customUrl: e.target.value } })}
            placeholder="https://… or /fonts/plane.svg"
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white placeholder:text-white/30"
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Icon size (px)">
          <NumberInput
            value={route.icon.size}
            min={24} max={300} step={4}
            onChange={(v) => updateRoute({ icon: { ...route.icon, size: v } })}
          />
        </Field>
        <label className="flex items-end gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={route.icon.show}
            onChange={(e) => updateRoute({ icon: { ...route.icon, show: e.target.checked } })}
            className="accent-amber mb-2"
          />
          <span className="mb-1.5">Show icon</span>
        </label>
      </div>

      {/* B3 + B4 toggles */}
      <div className="space-y-1.5 rounded-md bg-ink-900/40 border border-ink-700 p-2">
        <label className="flex items-start gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={!!route.followCamera}
            onChange={(e) => updateRoute({ followCamera: e.target.checked })}
            className="accent-amber mt-0.5"
          />
          <span className="flex-1">
            <div>📷 Camera follows route</div>
            <div className="text-[10px] text-white/40">
              Camera lon/lat locks to the icon position — cinematic tracking shot.
            </div>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={route.showStopMarkers !== false}
            onChange={(e) => updateRoute({ showStopMarkers: e.target.checked })}
            className="accent-amber mt-0.5"
          />
          <span className="flex-1">
            <div>📍 Show numbered stop markers</div>
            <div className="text-[10px] text-white/40">
              Pulsing rings at each stop in the journey.
            </div>
          </span>
        </label>
      </div>

      {/* ── Style ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-ink-700">
        <ColorWidthRow label="Line" color={route.style.color} width={route.style.width} max={20}
          onColor={(v) => updateStyle("color", v)} onWidth={(v) => updateStyle("width", v)} />
        <ColorWidthRow label="Glow" color={route.style.glowColor} width={route.style.glowWidth} max={60}
          onColor={(v) => updateStyle("glowColor", v)} onWidth={(v) => updateStyle("glowWidth", v)} />
        <ColorWidthRow label="Casing" color={route.style.casingColor} width={route.style.casingWidth} max={30}
          onColor={(v) => updateStyle("casingColor", v)} onWidth={(v) => updateStyle("casingWidth", v)} />
        <label className="flex items-end gap-2 text-xs text-white/80 pb-1.5">
          <input
            type="checkbox"
            checked={route.style.dashed}
            onChange={(e) => updateStyle("dashed", e.target.checked)}
            className="accent-amber mb-1"
          />
          <span>Dashed</span>
        </label>
      </div>

      </div>

      <button
        onClick={remove}
        className="flex items-center justify-center gap-1.5 rounded-md border border-red-700/40 bg-red-900/10 px-2 py-1.5 text-[11px] text-red-400 hover:bg-red-900/20"
        title="Permanently delete route — toggle visibility above to hide without deleting"
      >
        <X size={12} /> Delete route
      </button>
    </Section>
  );
};

// ── Components ─────────────────────────────────────────────────────────

type GeocodeResult = {
  id: string;
  lon: number;
  lat: number;
  name: string;
  shortName?: string;
};

const StopSearch: React.FC<{
  onSelect: (s: Stop, where: "start" | "end") => void;
}> = ({ onSelect }) => {
  const [q, setQ] = useState("");
  const [where, setWhere] = useState<"start" | "end">("end");

  const fetcher = useCallback(async (q: string, signal: AbortSignal): Promise<GeocodeResult[]> => {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
    const d = await res.json();
    return d.results ?? [];
  }, []);
  const { results, loading } = useDebouncedSearch<GeocodeResult>(q, fetcher);

  return (
    <div className="rounded-md border border-dashed border-ink-700 bg-ink-900/40 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
        <Plus size={11} className="text-amber" />
        <span className="text-white/50">Add stop at:</span>
        {(["start", "end"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setWhere(p)}
            className={`px-1.5 py-0.5 rounded ${
              where === p ? "bg-amber text-ink-950" : "text-white/50 hover:text-white"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded bg-ink-900 border border-ink-700 pl-6 pr-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber/60"
        />
        {loading && <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-amber" />}
      </div>
      {loading && q.length >= 2 && <Skeleton rows={2} height={18} />}
      {!loading && results.length > 0 && (
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {results.slice(0, 5).map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect({ lon: r.lon, lat: r.lat, name: r.shortName ?? r.name?.split(",")[0] }, where);
                setQ("");
              }}
              className="block w-full text-left text-[11px] text-white/70 hover:text-amber px-1.5 py-0.5 rounded hover:bg-ink-700 truncate"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Single-source color + width — uses the shared ColorInput component. */
const ColorWidthRow: React.FC<{
  label: string;
  color: string;
  width: number;
  max: number;
  onColor: (v: string) => void;
  onWidth: (v: number) => void;
}> = ({ label, color, width, max, onColor, onWidth }) => (
  <Field label={label}>
    <div className="flex items-center gap-1.5">
      <ColorInput value={color} onChange={onColor} ariaLabel={`${label} color`} />
      <input
        type="number"
        value={width}
        min={0} max={max} step={0.5}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onWidth(v); }}
        className="w-14 rounded-md bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
        title="Width (px)"
      />
    </div>
  </Field>
);
