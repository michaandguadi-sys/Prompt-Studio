"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

/** Polished form primitives for the v2 editor — token-themed, soft + tactile. */

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-medium tracking-tight text-graphite-muted">{label}</span>
      {hint && <span className="truncate text-[10px] text-graphite-muted/60">{hint}</span>}
    </div>
    {children}
  </label>
);

// One shared field skin so inputs / selects feel identical and intentional.
const FIELD =
  "w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-[13px] text-graphite transition-all duration-150 " +
  "placeholder:text-graphite-muted/45 hover:border-graphite/25 focus:border-iris/70 focus:outline-none focus:ring-[3px] focus:ring-iris/15";

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input {...props} className={[FIELD, className ?? ""].join(" ")} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...props }) => (
  <div className="relative">
    <select {...props} className={[FIELD, "cursor-pointer appearance-none pr-8", className ?? ""].join(" ")}>
      {children}
    </select>
    <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite-muted/55" />
  </div>
);

/**
 * Number input that NEVER fights your typing. The text is held locally while
 * editing (so "1" on the way to "15" isn't snapped to min) and every valid
 * keystroke commits the clamped value live — no Enter needed, last value wins.
 * On blur the text normalises. Bounded inputs get a slim drag-slider underneath.
 */
export const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string;
  noSlider?: boolean;
}> = ({ value, onChange, step = 1, min, max, unit, noSlider }) => {
  const [text, setText] = useState<string | null>(null); // null = mirror the prop
  const clamp = (v: number) => {
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };
  const bounded = min != null && max != null && !noSlider;
  const pct = bounded ? ((clamp(value) - (min as number)) / ((max as number) - (min as number) || 1)) * 100 : 0;
  return (
    <div>
      <div className="flex items-center rounded-lg border border-line bg-paper-50 transition-all duration-150 hover:border-graphite/25 focus-within:border-iris/70 focus-within:ring-[3px] focus-within:ring-iris/15">
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
          className="w-full bg-transparent px-3 py-2 text-[13px] tabular-nums text-graphite focus:outline-none"
        />
        {unit && <span className="pr-3 text-[11px] font-medium text-graphite-muted">{unit}</span>}
      </div>
      {bounded && (
        <div className="group relative mt-1.5 flex h-3 items-center px-0.5">
          <div className="absolute inset-x-0.5 h-1 rounded-full bg-graphite/15" />
          <div className="absolute h-1 rounded-full bg-iris/80" style={{ left: 2, width: `calc(${pct}% - 4px)` }} />
          <div className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-iris bg-white shadow transition-transform group-hover:scale-110" style={{ left: `${pct}%` }} />
          <input
            type="range" min={min} max={max} step={step} value={clamp(value)}
            onChange={(e) => { setText(null); onChange(Number(e.target.value)); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      )}
    </div>
  );
};

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
    className="group flex w-full cursor-pointer items-center justify-between gap-3 text-left text-[12px] text-graphite/85 transition-colors hover:text-graphite"
  >
    <span>{label}</span>
    <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition-all duration-200 ${checked ? "bg-iris shadow-[0_2px_10px_-2px_rgba(110,123,255,0.7)]" : "bg-graphite/20 group-hover:bg-graphite/30"}`}>
      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-[left] duration-300 ease-[cubic-bezier(0.34,1.5,0.6,1)] ${checked ? "left-[16px]" : "left-0.5"}`} />
    </span>
  </button>
);

/**
 * Labelled slider with a live readout pill and a FILLED gradient track — the
 * signature slider-first control. Styled track + transparent native range on
 * top, so it looks identical cross-browser with no global CSS.
 */
export const Slider: React.FC<{
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; format?: (v: number) => string; hint?: string;
}> = ({ label, value, onChange, min = 0, max = 1, step = 0.01, format, hint }) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium tracking-tight text-graphite-muted">{label}{hint && <span className="ml-1.5 font-normal text-graphite-muted/55">{hint}</span>}</span>
        <span className="shrink-0 rounded-md bg-graphite/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-graphite/75">{format ? format(value) : Math.round(value * 100) + "%"}</span>
      </div>
      <div className="group relative flex h-5 items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-graphite/15" />
        <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-iris to-[#9b6cff] shadow-[0_0_8px_-1px_rgba(110,123,255,0.55)]" style={{ width: `${pct}%` }} />
        <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-iris bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-transform duration-150 group-hover:scale-110 group-active:scale-95" style={{ left: `${pct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
};

/**
 * Collapsible section. Default open so nothing hides on you, but every group can
 * be folded away to tame the long Inspector — smooth grid-rows height animation,
 * a soft iris tick, and a rotating chevron. Same `<Section title>…</Section>` API.
 */
export const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-graphite/[0.03]"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite-muted/80 transition-colors group-hover:text-graphite">
          <span className="h-2.5 w-[3px] rounded-full bg-iris/70" />{title}
        </span>
        <ChevronDown size={13} className={`text-graphite-muted/45 transition-transform duration-300 group-hover:text-graphite-muted ${open ? "" : "-rotate-90"}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="space-y-2.5 px-4 pb-4 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
};
