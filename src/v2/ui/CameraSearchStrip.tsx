"use client";

import React, { useRef, useState } from "react";
import { Search, Video } from "lucide-react";
import { previewMapBridge } from "../render/previewMapBridge";

/**
 * The camera-mode search bar — lives ABOVE the preview (a sibling strip, never
 * floating on the map). Type a place to fly the live preview camera there; then
 * frame it with the gizmo and Add a keyframe.
 */
export const CameraSearchStrip: React.FC = () => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (term: string) => {
    setQ(term);
    if (timer.current) clearTimeout(timer.current);
    if (term.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results.slice(0, 6) : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
  };

  const flyTo = (res: any) => {
    const m = previewMapBridge.get();
    if (m) {
      if (Array.isArray(res.bbox) && res.bbox.length === 4) {
        try { (m as any).fitBounds?.([[res.bbox[0], res.bbox[1]], [res.bbox[2], res.bbox[3]]], { padding: 80, duration: 900 }); }
        catch { m.flyTo({ center: [res.lon, res.lat], zoom: res.zoom ?? 6, duration: 900 }); }
      } else {
        m.flyTo({ center: [res.lon, res.lat], zoom: res.zoom ?? 9, duration: 900 });
      }
    }
    setQ(res.shortName ?? res.name ?? "");
    setResults([]);
  };

  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-iris/40 bg-iris/10 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-iris">
        <Video size={13} /> Adjust camera
      </span>
      <div className="relative w-72">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-graphite-muted/50" />
        <input
          value={q}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Fly the camera to a place…"
          className="w-full rounded-lg border border-line bg-paper-50 py-2 pl-8 pr-3 text-[12.5px] text-graphite placeholder:text-graphite-muted/45 focus:border-iris/60 focus:outline-none focus:ring-[3px] focus:ring-iris/15"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-iris/60">…</span>}
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-elevated">
            {results.map((r) => (
              <button key={r.id} onClick={() => flyTo(r)} className="block w-full truncate px-3 py-2 text-left text-[12px] text-graphite/80 hover:bg-iris/10">
                {r.shortName ?? r.name} <span className="text-graphite/40">· {r.placeType}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="hidden text-[11px] text-graphite-muted/70 sm:block">Turn the ring to rotate · drag the bars to tilt & zoom · drag the map to pan</span>
    </div>
  );
};
