"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, children, className }) => (
  <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
    <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40 select-none">
      {label}
    </span>
    {children}
    {hint && (
      <span className="text-[10px] text-white/30 leading-snug">{hint}</span>
    )}
  </label>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    {...props}
    className={[
      "w-full rounded-md bg-ink-950 border border-ink-700",
      "px-3 py-1.5 text-sm text-white placeholder:text-white/25",
      "hover:border-ink-600",
      "focus:outline-none focus:border-amber/50 focus:ring-1 focus:ring-amber/20",
      "transition-colors duration-150",
      className ?? "",
    ].join(" ")}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...props
}) => (
  <select
    {...props}
    className={[
      "w-full rounded-md bg-ink-950 border border-ink-700",
      "px-3 py-1.5 text-sm text-white",
      "hover:border-ink-600",
      "focus:outline-none focus:border-amber/50",
      "transition-colors duration-150 cursor-pointer",
      className ?? "",
    ].join(" ")}
  />
);

export const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ value, onChange, step = 1, min, max, unit }) => (
  <div className="relative">
    <Input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      className={unit ? "pr-8" : ""}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
    {unit && (
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/30">
        {unit}
      </span>
    )}
  </div>
);

export const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
}> = ({ title, children, collapsible = false, defaultOpen = true, badge }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-ink-700/60 last:border-b-0">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={[
          "w-full flex items-center justify-between px-5 py-3",
          collapsible ? "cursor-pointer hover:bg-ink-800/30 transition-colors" : "cursor-default",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35 select-none">
            {title}
          </h3>
          {badge && (
            <span className="rounded-full border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[9px] text-amber/80 uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        {collapsible && (
          <ChevronDown
            size={12}
            className={`text-white/30 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          />
        )}
      </button>
      {(!collapsible || open) && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
};

export const Divider: React.FC = () => (
  <div className="border-t border-ink-700/40 my-1" />
);
