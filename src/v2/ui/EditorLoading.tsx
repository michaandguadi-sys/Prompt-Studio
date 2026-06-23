"use client";

import React from "react";
import { MapPin } from "lucide-react";

/**
 * The editor's loading screen — shown while the (heavy, client-only) Mapanisy
 * editor bundle + Remotion player + MapLibre boot. Map-themed: a location pin
 * with radar rings finding a spot, a faint graticule, a soft iris glow, and an
 * indeterminate sweep bar. Neutral-grey to match the editor it precedes.
 */
export const EditorLoading: React.FC = () => (
  <div className="editor-pro relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-paper-50 text-graphite">
    {/* Faint graticule + radial glow backdrop */}
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.5]"
      aria-hidden
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(60% 50% at 50% 50%, #000 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(60% 50% at 50% 50%, #000 30%, transparent 75%)",
      }}
    />
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{ background: "radial-gradient(50% 40% at 50% 42%, rgba(110,123,255,0.12), transparent 70%)" }}
    />

    <div className="relative flex flex-col items-center">
      {/* Pin + radar rings */}
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute h-20 w-20 rounded-full border border-iris/30 animate-ping" style={{ animationDuration: "2.4s" }} />
        <span className="absolute h-28 w-28 rounded-full border border-iris/15 animate-ping" style={{ animationDuration: "2.4s", animationDelay: "0.6s" }} />
        <span className="absolute h-16 w-16 rounded-full bg-iris/10 blur-md" />
        <span
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_10px_30px_-6px_rgba(110,123,255,0.7)]"
          style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", animation: "breathe 2.6s ease-in-out infinite" }}
        >
          <MapPin size={26} strokeWidth={2.4} />
        </span>
      </div>

      {/* Wordmark + status */}
      <div className="mt-7 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-graphite-muted/70">Mapanisy</div>
        <div className="mt-2 text-[15px] font-medium tracking-tight text-graphite/90">Preparing your studio…</div>
      </div>

      {/* Indeterminate sweep bar */}
      <div className="relative mt-6 h-[3px] w-44 overflow-hidden rounded-full bg-graphite/12">
        <div
          className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-iris to-transparent"
          style={{ animation: "loaderSweep 1.5s cubic-bezier(0.5,0,0.3,1) infinite" }}
        />
      </div>
    </div>
  </div>
);
