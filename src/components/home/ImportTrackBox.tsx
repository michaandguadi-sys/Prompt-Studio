"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Upload, Loader2, MountainSnow, Route as RouteIcon, X, ArrowRight, MapPin } from "lucide-react";
import { parseTrackFile, buildTrackProject, VARIANT_PRESETS, STYLE_PRESETS, type NormalizedTrack } from "@/v2/track";
import type { TrackVariant, TrackStyle } from "@/v2/doc/schema";

const VARIANTS = Object.keys(VARIANT_PRESETS) as TrackVariant[];
const STYLES = Object.keys(STYLE_PRESETS) as TrackStyle[];
const fmtKm = (m: number) => (m / 1000).toFixed(m < 10000 ? 1 : 0);

/**
 * Import a recorded GPS track (GPX/TCX/KML/GeoJSON) → an editable cinematic
 * flythrough. The whole parse runs in the browser (the file never leaves the
 * device); the user picks a camera variant + look, then opens the editor where
 * everything stays adjustable.
 */
export const ImportTrackBox: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<NormalizedTrack | null>(null);
  const [source, setSource] = useState("");
  const [variant, setVariant] = useState<TrackVariant>("overview-draw");
  const [style, setStyle] = useState<TrackStyle>("vox-dark");
  const [drag, setDrag] = useState(false);

  const reset = () => { setTrack(null); setError(null); setSource(""); setVariant("overview-draw"); setStyle("vox-dark"); };

  async function ingest(file: File) {
    setBusy(true); setError(null);
    try {
      const { track } = await parseTrackFile(file);
      setTrack(track); setSource(file.name); setOpen(true);
    } catch (e: any) {
      setError(e?.message || "Couldn’t read that file."); setOpen(true);
    } finally { setBusy(false); }
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) ingest(f); };

  function create() {
    if (!track) return;
    setBusy(true);
    try {
      const proj = buildTrackProject(track, source, variant, style);
      load(proj);
      router.push("/studio2");
    } catch {
      setError("Something went wrong building the animation."); setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {/* Collapsed entry strip */}
      {!open && (
        <button
          onClick={() => { setOpen(true); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-[13px] font-medium transition-colors ${drag ? "border-iris bg-iris/10 text-iris" : "border-line bg-graphite/[0.03] text-graphite/60 hover:border-graphite/25 hover:text-graphite/80"}`}
        >
          <Upload size={14} /> Import a GPS route — GPX, TCX, KML, GeoJSON
        </button>
      )}

      {open && (
        <div className="rounded-xl border border-line bg-graphite/[0.04] p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-graphite/85"><RouteIcon size={15} className="text-iris" /> Flythrough from a GPS track</div>
            <button onClick={() => { setOpen(false); reset(); }} className="text-graphite/45 hover:text-graphite"><X size={15} /></button>
          </div>

          {/* Dropzone / parsed summary */}
          {!track ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center transition-colors ${drag ? "border-iris bg-iris/10" : "border-line hover:border-graphite/25"}`}
              >
                {busy ? <Loader2 size={20} className="animate-spin text-iris" /> : <Upload size={20} className="text-graphite/55" />}
                <div className="text-[13px] text-graphite/70">{busy ? "Reading track…" : "Drop a file or click to choose"}</div>
                <div className="text-[11px] text-graphite/40">Strava, Garmin, Wahoo, Coros, Komoot, Apple/Google — .gpx · .fit · .tcx · .kml · .kmz · .geojson</div>
              </div>
              <input ref={fileRef} type="file" accept=".gpx,.fit,.tcx,.kml,.kmz,.geojson,.json,application/gpx+xml,application/xml,text/xml,application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) ingest(f); e.currentTarget.value = ""; }} />
              {error && <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>}
            </>
          ) : (
            <>
              {/* Track stat chips */}
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-graphite/70">
                <span className="truncate rounded-md bg-graphite/[0.06] px-2 py-1 font-medium text-graphite/85">{track.name}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-graphite/[0.06] px-2 py-1"><MapPin size={11} className="text-iris" /> {fmtKm(track.stats.distanceM)} km</span>
                {track.hasElevation && <span className="inline-flex items-center gap-1 rounded-md bg-graphite/[0.06] px-2 py-1"><MountainSnow size={11} className="text-cyan" /> ↑{Math.round(track.stats.ascentM)} m</span>}
                {track.segments.length > 0 && <span className="rounded-md bg-graphite/[0.06] px-2 py-1">{track.segments.length + 1} segments</span>}
                <span className="rounded-md bg-graphite/[0.06] px-2 py-1 text-graphite/45">{track.points.length} pts</span>
              </div>

              {/* Variant picker */}
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/45">Camera</div>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {VARIANTS.map((v) => {
                  const dis = VARIANT_PRESETS[v].terrain && !track.hasElevation;
                  return (
                    <button key={v} disabled={dis} onClick={() => setVariant(v)}
                      title={dis ? "Needs elevation data" : VARIANT_PRESETS[v].blurb}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${variant === v ? "border-iris bg-iris/15" : "border-line hover:border-graphite/25"} ${dis ? "opacity-35 cursor-not-allowed" : ""}`}>
                      <div className="text-[12px] font-semibold text-graphite/85">{VARIANT_PRESETS[v].label}</div>
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-graphite/50">{VARIANT_PRESETS[v].blurb}</div>
                    </button>
                  );
                })}
              </div>

              {/* Style picker */}
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/45">Look</div>
              <div className="mb-4 grid grid-cols-4 gap-1.5">
                {STYLES.map((s) => {
                  const sb = STYLE_PRESETS[s];
                  return (
                    <button key={s} onClick={() => setStyle(s)}
                      className={`overflow-hidden rounded-lg border text-center transition-colors ${style === s ? "border-iris" : "border-line hover:border-graphite/25"}`}>
                      <div className="h-7 w-full" style={{ background: sb.bgColor }}>
                        <div className="h-full w-full" style={{ background: `linear-gradient(90deg, transparent, ${sb.routeGlow}66)` }} />
                      </div>
                      <div className="px-1 py-1 text-[10px] font-medium capitalize text-graphite/70">{s.replace("-", " ")}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => reset()} className="rounded-lg border border-line px-3 py-2 text-[12px] text-graphite/60 hover:text-graphite">Change file</button>
                <button onClick={create} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-iris to-[#9b5cff] px-4 py-2 text-[13px] font-semibold text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform disabled:opacity-60">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Open in editor
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
