"use client";

import React from "react";

/** Light-theme form primitives for the v2 editor (mirror the v1 API). */

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-medium text-graphite-muted">{label}</span>
      {hint && <span className="truncate text-[10px] text-graphite-muted/70">{hint}</span>}
    </div>
    {children}
  </label>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={[
      "w-full rounded-lg bg-paper-50 border border-line px-3 py-1.5 text-sm text-graphite",
      "placeholder:text-graphite-muted/50 hover:border-graphite/20",
      "focus:outline-none focus:border-iris/60 focus:ring-2 focus:ring-iris/15 transition-colors",
      className ?? "",
    ].join(" ")}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...props }) => (
  <select
    {...props}
    className={[
      "w-full rounded-lg bg-paper-50 border border-line px-2.5 py-1.5 text-sm text-graphite",
      "hover:border-graphite/20 focus:outline-none focus:border-iris/60 focus:ring-2 focus:ring-iris/15 transition-colors",
      className ?? "",
    ].join(" ")}
  >
    {children}
  </select>
);

/**
 * Number input that NEVER fights your typing. The text is held locally while
 * editing (so "1" on the way to "15" isn't snapped to min) and every valid
 * keystroke commits the clamped value live — no Enter needed, last value wins.
 * On blur the text normalises to the actual value. Bounded inputs also get a
 * slim slider underneath for one-drag adjustment.
 */
export const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string;
  /** Hide the inline slider even when min+max exist (for tight layouts). */
  noSlider?: boolean;
}> = ({ value, onChange, step = 1, min, max, unit, noSlider }) => {
  const [text, setText] = React.useState<string | null>(null); // null = mirror the prop
  const clamp = (v: number) => {
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };
  const bounded = min != null && max != null && !noSlider;
  return (
    <div>
      <div className="flex items-center rounded-lg bg-paper-50 border border-line focus-within:border-iris/60 focus-within:ring-2 focus-within:ring-iris/15 transition-colors">
        <input
          type="number"
          value={text ?? String(value)}
          step={step} min={min} max={max}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== "" && !Number.isNaN(v)) onChange(clamp(v));
          }}
          onBlur={() => setText(null)}
          className="w-full bg-transparent px-3 py-1.5 text-sm text-graphite focus:outline-none"
        />
        {unit && <span className="pr-2.5 text-[11px] text-graphite-muted">{unit}</span>}
      </div>
      {bounded && (
        <input
          type="range" min={min} max={max} step={step} value={clamp(value)}
          onChange={(e) => { setText(null); onChange(Number(e.target.value)); }}
          className="mt-1 block h-1 w-full accent-iris"
        />
      )}
    </div>
  );
};

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-2 text-left text-xs text-graphite/80 cursor-pointer"
  >
    <span>{label}</span>
    <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? "bg-iris" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${checked ? "left-3.5" : "left-0.5"}`} />
    </span>
  </button>
);

/**
 * Labelled slider with a live readout and a custom FILLED track (gradient up to
 * the thumb) — the signature slider-first control. Built as a styled track with
 * a transparent native range on top, so it looks identical cross-browser without
 * any global CSS.
 */
export const Slider: React.FC<{
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; format?: (v: number) => string; hint?: string;
}> = ({ label, value, onChange, min = 0, max = 1, step = 0.01, format, hint }) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-graphite-muted">{label}{hint && <span className="ml-1.5 font-normal text-graphite-muted/60">{hint}</span>}</span>
        <span className="shrink-0 text-[10px] tabular-nums font-medium text-graphite/70">{format ? format(value) : Math.round(value * 100) + "%"}</span>
      </div>
      <div className="group relative flex h-4 items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-line" />
        <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-iris to-[#9b5cff]" style={{ width: `${pct}%` }} />
        <div className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-iris bg-white shadow transition-transform group-hover:scale-110" style={{ left: `${pct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-line px-4 py-3.5 space-y-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite-muted/80">{title}</div>
    {children}
  </div>
);
