"use client";

import React, { useEffect, useRef, useState } from "react";
import Map, { MapMouseEvent, MapRef, Marker, Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  X, MapPin, Check, Compass, ZoomIn, Circle as CircleIcon,
  Pentagon, Undo2, Sparkles, Search,
} from "lucide-react";
import { resolveMapStyle } from "@/lib/maplibre";

export type PickedView = {
  lon: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
  /**
   * Optional drawn shape — populated when the user picked a CIRCLE or POLYGON.
   * Used by the highlight picker; ignored by the waypoint picker.
   *
   * For "circle": geojson is a regular polygon approximation of a circle
   * centered at (lon, lat) with `radiusKm`.
   * For "polygon": geojson is the (optionally smoothed) polygon the user drew.
   */
  shape?:
    | { kind: "circle"; radiusKm: number; geojson: any }
    | { kind: "polygon"; geojson: any };
};

type PickMode = "pin" | "circle" | "polygon";

/**
 * Map picker modal with three modes:
 *   - "pin"     → single click drops a point (waypoint flow)
 *   - "circle"  → single click + radius slider creates a round highlight
 *   - "polygon" → Shift+click adds vertices, "Finish" closes the shape;
 *                 optional Chaikin smoothing for organic edges
 *
 * Modes are mutually exclusive. Holding Shift while clicking auto-switches
 * from circle/pin → polygon mode (so the user can just start drawing).
 *
 * The picker remembers the user's last-used shape mode across opens within
 * a session, but defaults to "pin" / "circle" depending on `defaultMode`.
 */
export const MapPicker: React.FC<{
  open: boolean;
  title?: string;
  initialLon: number;
  initialLat: number;
  initialZoom: number;
  initialBearing?: number;
  initialPitch?: number;
  mapStyleUrl?: string;
  /** "pin" for waypoint picker · "circle" for highlight picker (with polygon fallback). */
  defaultMode?: PickMode;
  /** Show the circle/polygon mode toggles. Off for the waypoint picker. */
  allowShapes?: boolean;
  onPick: (view: PickedView) => void;
  onClose: () => void;
}> = ({
  open,
  title = "Pick a location",
  initialLon,
  initialLat,
  initialZoom,
  initialBearing = 0,
  initialPitch = 0,
  mapStyleUrl,
  defaultMode = "pin",
  allowShapes = false,
  onPick,
  onClose,
}) => {
  const mapRef = useRef<MapRef>(null);
  const [pinned, setPinned] = useState<{ lon: number; lat: number } | null>(null);
  const [polygon, setPolygon] = useState<[number, number][]>([]);
  const [mode, setMode] = useState<PickMode>(defaultMode);
  const [radiusKm, setRadiusKm] = useState(20);
  const [smooth, setSmooth] = useState(true);
  const [view, setView] = useState({ zoom: initialZoom, bearing: initialBearing, pitch: initialPitch });

  // In-picker place search → fly the map to any location/area.
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (term: string) => {
    setSearchQ(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (term.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setSearchResults(Array.isArray(d.results) ? d.results.slice(0, 6) : []);
      } catch { setSearchResults([]); }
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
    setSearchQ(res.shortName ?? res.name ?? "");
    setSearchResults([]);
  };

  // Reset state on open
  useEffect(() => {
    if (open) {
      setPinned(null);
      setPolygon([]);
      setMode(defaultMode);
      setSearchQ("");
      setSearchResults([]);
    }
  }, [open, defaultMode]);

  if (!open) return null;

  const handleClick = (e: MapMouseEvent) => {
    if (!e?.lngLat) return;
    const { lng, lat } = e.lngLat;
    // Shift = polygon mode (auto-switch). Also active if mode is already polygon.
    const isPoly = mode === "polygon" || (e.originalEvent && (e.originalEvent as any).shiftKey);
    if (isPoly && allowShapes) {
      if (mode !== "polygon") setMode("polygon");
      setPolygon((p) => [...p, [lng, lat]]);
      setPinned(null);
    } else {
      setPinned({ lon: lng, lat });
      setPolygon([]);
    }
  };

  // ── Geometry builders ────────────────────────────────────────────────
  const circlePolygon = (cx: number, cy: number, rKm: number, steps = 64): any => {
    // Convert km → degrees (approximate, account for latitude)
    const dLat = rKm / 111;
    const dLon = rKm / (111 * Math.cos((cy * Math.PI) / 180));
    const coords: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      coords.push([cx + dLon * Math.cos(a), cy + dLat * Math.sin(a)]);
    }
    return { type: "Polygon", coordinates: [coords] };
  };

  /** Chaikin's corner-cutting — applied N times for stronger smoothing. */
  const chaikin = (pts: [number, number][], iters = 3): [number, number][] => {
    let out = pts;
    for (let k = 0; k < iters; k++) {
      const next: [number, number][] = [];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], b = out[i + 1];
        next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      // Close the ring
      const a = out[out.length - 1], b = out[0];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      out = next;
    }
    return out;
  };

  const confirm = () => {
    const m = mapRef.current?.getMap();
    const z = m?.getZoom() ?? view.zoom;
    const b = m?.getBearing() ?? view.bearing;
    const p = m?.getPitch() ?? view.pitch;

    if (mode === "polygon" && polygon.length >= 3) {
      let ring = [...polygon, polygon[0]]; // close
      if (smooth) {
        ring = chaikin(polygon, 3);
        ring.push(ring[0]); // close after smoothing
      }
      // Centroid for the lon/lat anchor
      const cx = ring.reduce((s, [x]) => s + x, 0) / ring.length;
      const cy = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
      onPick({
        lon: cx, lat: cy, zoom: z, bearing: b, pitch: p,
        shape: { kind: "polygon", geojson: { type: "Polygon", coordinates: [ring] } },
      });
    } else if (mode === "circle" && pinned) {
      onPick({
        lon: pinned.lon, lat: pinned.lat, zoom: z, bearing: b, pitch: p,
        shape: { kind: "circle", radiusKm, geojson: circlePolygon(pinned.lon, pinned.lat, radiusKm) },
      });
    } else if (pinned) {
      onPick({ lon: pinned.lon, lat: pinned.lat, zoom: z, bearing: b, pitch: p });
    }
    setPinned(null);
    setPolygon([]);
  };

  const canConfirm =
    (mode === "polygon" && polygon.length >= 3) ||
    ((mode === "pin" || mode === "circle") && pinned);

  // GeoJSON for the live preview shape
  const previewGeoJson =
    mode === "polygon" && polygon.length >= 2
      ? ({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: polygon.length >= 3 ? [...polygon, polygon[0]] : polygon,
          },
        })
      : mode === "circle" && pinned
        ? ({
            type: "Feature" as const,
            properties: {},
            geometry: circlePolygon(pinned.lon, pinned.lat, radiusKm),
          })
        : null;

  return (
    <div className="fixed inset-0 z-[100] bg-graphite/40 backdrop-blur-sm flex flex-col">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-line bg-white px-5 py-3 flex-wrap">
        <MapPin size={16} className="text-iris" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite">
          {title}
        </h2>

        {/* Mode toggle (only if shapes allowed) */}
        {allowShapes && (
          <div className="flex items-center gap-0.5 ml-2 rounded-lg bg-paper-100 p-0.5">
            <ModeBtn icon={<MapPin size={11} />} label="Pin" active={mode === "pin"} onClick={() => { setMode("pin"); setPolygon([]); }} />
            <ModeBtn icon={<CircleIcon size={11} />} label="Circle" active={mode === "circle"} onClick={() => { setMode("circle"); setPolygon([]); }} />
            <ModeBtn icon={<Pentagon size={11} />} label="Polygon" active={mode === "polygon"} onClick={() => { setMode("polygon"); setPinned(null); }} hint="Or Shift+click anywhere" />
          </div>
        )}

        <div className="flex-1" />

        {/* Live view-state badge */}
        {(pinned || polygon.length > 0) && (
          <div className="text-[10px] text-graphite/45 font-mono flex items-center gap-3">
            {pinned && <span>{pinned.lat.toFixed(3)}, {pinned.lon.toFixed(3)}</span>}
            {polygon.length > 0 && <span>{polygon.length} vertices</span>}
            <span className="flex items-center gap-1"><ZoomIn size={10} /> {view.zoom.toFixed(1)}</span>
            <span className="flex items-center gap-1"><Compass size={10} /> {view.bearing.toFixed(0)}°</span>
            {view.pitch > 0.5 && <span>↗ {view.pitch.toFixed(0)}°</span>}
          </div>
        )}

        <button
          onClick={confirm}
          disabled={!canConfirm}
          className="flex items-center gap-1.5 rounded-lg bg-brand text-white px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-30 disabled:bg-paper-200 disabled:text-graphite/30"
        >
          <Check size={12} />
          Use this {mode === "polygon" ? "shape" : mode === "circle" ? "circle" : "point"}
        </button>
        <button onClick={() => { setPinned(null); setPolygon([]); onClose(); }} className="rounded-lg p-1.5 text-graphite/40 hover:text-graphite hover:bg-paper-100">
          <X size={18} />
        </button>
      </div>

      {/* ── Sub-toolbar for circle radius + polygon smoothing ─── */}
      {allowShapes && (mode === "circle" || mode === "polygon") && (
        <div className="flex items-center gap-4 bg-paper-50 border-b border-line px-5 py-2 text-xs">
          {mode === "circle" && (
            <>
              <span className="text-graphite/55 uppercase tracking-wider text-[10px]">Radius</span>
              <input
                type="range" min={1} max={500} step={1}
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                className="flex-1 max-w-xs accent-iris"
              />
              <span className="font-mono text-iris w-16 text-right">{radiusKm} km</span>
            </>
          )}
          {mode === "polygon" && (
            <>
              <label className="flex items-center gap-2 text-graphite/65">
                <input
                  type="checkbox"
                  checked={smooth}
                  onChange={(e) => setSmooth(e.target.checked)}
                  className="accent-iris"
                />
                <Sparkles size={11} className="text-iris" />
                Smooth edges (Chaikin)
              </label>
              <button
                onClick={() => setPolygon((p) => p.slice(0, -1))}
                disabled={polygon.length === 0}
                className="flex items-center gap-1 text-graphite/55 hover:text-iris disabled:opacity-30"
              >
                <Undo2 size={11} /> Undo vertex
              </button>
              <button
                onClick={() => setPolygon([])}
                disabled={polygon.length === 0}
                className="text-graphite/55 hover:text-red-500 disabled:opacity-30"
              >
                Clear
              </button>
              <span className="text-[10px] text-graphite/40 ml-auto">
                Click to add vertices · need ≥3 to confirm
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Map ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {/* In-picker search — fly to any place or area */}
        <div className="absolute left-4 top-4 z-20 w-72">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite/40" />
            <input
              value={searchQ}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search a place or area to fly there…"
              className="w-full rounded-lg border border-line bg-white/95 backdrop-blur pl-8 pr-3 py-2 text-sm text-graphite placeholder:text-graphite/40 shadow-elevated focus:outline-none focus:border-iris/60"
            />
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-iris/60">…</span>}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-elevated">
              {searchResults.map((r) => (
                <button key={r.id} onClick={() => flyToResult(r)} className="block w-full truncate px-3 py-2 text-left text-xs text-graphite/80 hover:bg-iris/10">
                  {r.shortName ?? r.name} <span className="text-graphite/40">· {r.placeType}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Map
          ref={mapRef}
          mapStyle={resolveMapStyle(mapStyleUrl) as any}
          initialViewState={{
            longitude: initialLon,
            latitude: initialLat,
            zoom: Math.max(2, Math.min(15, initialZoom)),
            bearing: initialBearing,
            pitch: initialPitch,
          }}
          onClick={handleClick}
          onMove={(e) => setView({ zoom: e.viewState.zoom, bearing: e.viewState.bearing, pitch: e.viewState.pitch })}
          interactive
          dragRotate
          pitchWithRotate
          attributionControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          {pinned && mode === "pin" && (
            <Marker longitude={pinned.lon} latitude={pinned.lat} anchor="bottom">
              <div style={{ width: 36, height: 36, marginBottom: -4, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}>
                <MapPin size={36} fill="#6E7BFF" stroke="#ffffff" strokeWidth={1.5} />
              </div>
            </Marker>
          )}

          {/* Polygon vertex markers */}
          {polygon.map(([lon, lat], i) => (
            <Marker key={i} longitude={lon} latitude={lat} anchor="center">
              <div className="h-2.5 w-2.5 rounded-full bg-iris border-2 border-white shadow-lg" />
            </Marker>
          ))}

          {/* Live preview of circle / polygon */}
          {previewGeoJson && (
            <Source id="picker-preview" type="geojson" data={previewGeoJson}>
              {mode === "circle" ? (
                <>
                  <Layer
                    id="picker-circle-fill" type="fill"
                    paint={{ "fill-color": "#6E7BFF", "fill-opacity": 0.18 }}
                  />
                  <Layer
                    id="picker-circle-border" type="line"
                    paint={{ "line-color": "#6E7BFF", "line-width": 2.5 }}
                  />
                </>
              ) : (
                <Layer
                  id="picker-poly-line" type="line"
                  paint={{ "line-color": "#6E7BFF", "line-width": 2.5, "line-dasharray": [3, 2] }}
                />
              )}
            </Source>
          )}
        </Map>

        {/* Hint banner */}
        {!pinned && polygon.length === 0 && (
          <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs text-white/80 backdrop-blur-sm">
            {mode === "polygon"
              ? "Click to add vertices · Shift+click works too"
              : "Click anywhere on the map to drop a pin · hold Shift to draw a polygon"}
          </div>
        )}
      </div>
    </div>
  );
};

const ModeBtn: React.FC<{
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; hint?: string;
}> = ({ icon, label, active, onClick, hint }) => (
  <button
    onClick={onClick}
    title={hint ?? label}
    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition ${
      active ? "bg-amber text-ink-950 font-semibold" : "text-white/60 hover:text-white"
    }`}
  >
    {icon}
    {label}
  </button>
);
