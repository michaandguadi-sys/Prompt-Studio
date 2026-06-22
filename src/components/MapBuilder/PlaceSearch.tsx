"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";

export type PlaceResult = {
  id: string;
  name: string;
  shortName?: string;
  placeType: string;
  lon: number;
  lat: number;
  zoom: number;
  countryISO?: string | null;
};

/**
 * Debounced place search backed by /api/geocode (Mapbox forward geocoding).
 *
 * Lets a creator type a city / landmark / country and pick it from a dropdown
 * instead of hand-entering raw lon/lat. On select it calls `onPick` with the
 * resolved coordinates + names so the caller can drop a titled pin or move a
 * camera. Fully self-contained — no external state.
 */
export const PlaceSearch: React.FC<{
  onPick: (place: PlaceResult) => void;
  placeholder?: string;
  /** Optional compact styling for tight rows. */
  size?: "sm" | "md";
}> = ({ onPick, placeholder = "Search a place…", size = "md" }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: ac.signal });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setOpen(true);
        setActive(0);
      } catch {
        /* aborted or network — ignore */
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (r: PlaceResult) => {
    onPick(r);
    setQ("");
    setResults([]);
    setOpen(false);
  };

  const pad = size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm";

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-graphite/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
          placeholder={placeholder}
          className={[
            "w-full rounded-md bg-paper-50 border border-line pl-8 pr-7 text-graphite placeholder:text-graphite/25",
            pad,
            "hover:border-line focus:outline-none focus:border-iris/50 focus:ring-1 focus:ring-iris/20 transition-colors",
          ].join(" ")}
        />
        {loading && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-amber/60" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-white shadow-elevated">
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
              className={[
                "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                i === active ? "bg-iris/10" : "hover:bg-paper-100",
              ].join(" ")}
            >
              <MapPin size={12} className="mt-0.5 shrink-0 text-amber/70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-graphite">{r.shortName ?? r.name}</span>
                <span className="block truncate text-[10px] text-graphite/40">
                  {r.placeType}
                  {r.shortName && r.name !== r.shortName ? ` · ${r.name}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
