"use client";

import React from "react";
import { PALETTES } from "@/lib/presets/palettes";

export default function StylesPage() {
  return (
    <div className="h-full overflow-auto bg-paper-50">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-line/40 px-10 pt-12 pb-10">
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-[280px] w-[500px] rounded-full bg-amber/[0.04] blur-[80px]" />
        <div className="relative max-w-5xl mx-auto">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px w-8 bg-amber/60" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber/80">Shared Styles</span>
          </div>
          <h1 className="text-4xl font-light tracking-tight text-graphite mb-2">Palette Library</h1>
          <p className="text-sm text-graphite/40 max-w-lg leading-relaxed">
            Pre-built palettes inspired by Vox, Johnny Harris, and Wendover.
            Apply any palette inside a scene editor — or build your own in Brand.
          </p>
        </div>
      </div>

      {/* ── Palette grid ─────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-10 py-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PALETTES.map((p, i) => (
            <div
              key={p.name}
              className="rounded-xl border border-line/60 bg-paper-100 p-6 hover:border-line transition-colors duration-200 anim-fade-up"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-graphite">{p.name}</h2>
                <span className="rounded-full border border-line bg-paper-100 px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-graphite/40">
                  {p.tone}
                </span>
              </div>

              {/* Large swatch row */}
              <div className="flex gap-2 mb-5">
                {[p.borderColor, p.glowColor, p.fillColor, p.countryStroke, p.dotColor, p.ringColor].map((c, ci) => (
                  <div
                    key={ci}
                    className="h-10 flex-1 rounded-lg border border-black/20 transition-transform hover:scale-105"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>

              {/* Color detail rows */}
              <div className="space-y-1.5">
                {([
                  ["borderColor",    p.borderColor],
                  ["glowColor",      p.glowColor],
                  ["fillColor",      p.fillColor],
                  ["countryStroke",  p.countryStroke],
                  ["dotColor",       p.dotColor],
                  ["ringColor",      p.ringColor],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded border border-black/20 shrink-0"
                      style={{ background: v }}
                    />
                    <span className="text-[11px] text-graphite/35 w-28 font-mono">{k}</span>
                    <span className="text-[11px] font-mono text-graphite/60">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
