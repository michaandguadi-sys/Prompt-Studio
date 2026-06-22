"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { PALETTES } from "@/lib/presets/palettes";
import { Field, Input, Section } from "@/components/ui/Field";
import type { Palette } from "@/lib/types";

const COLOR_KEYS: (keyof Omit<Palette, "name" | "tone">)[] = [
  "borderColor",
  "glowColor",
  "fillColor",
  "countryStroke",
  "dotColor",
  "ringColor",
];

export const PaletteEditor: React.FC = () => {
  const palette = useStudio((s) => s.spec.style.palette);
  const setPalette = useStudio((s) => s.setPalette);
  const brandPalette = useStudio((s) => s.brandPalette);

  return (
    <Section title="Palette">
      {/* Palette presets */}
      <div className="grid grid-cols-2 gap-1.5">
        {brandPalette && (
          <button
            onClick={() => setPalette(brandPalette)}
            className={`col-span-2 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
              palette.name === "Brand Custom"
                ? "border-amber/60 bg-amber/10"
                : "border-amber/20 hover:border-amber/50 bg-amber/[0.04]"
            }`}
          >
            {/* Color strip */}
            <div className="flex h-5 flex-1 overflow-hidden rounded border border-black/20">
              {([brandPalette.borderColor, brandPalette.glowColor, brandPalette.fillColor, brandPalette.ringColor] as const)
                .map((c, idx) => (
                  <div key={idx} className="flex-1" style={{ background: c }} />
                ))}
            </div>
            <div className="text-[10px] font-medium text-amber/70 shrink-0">Brand</div>
          </button>
        )}
        {PALETTES.map((p) => (
          <button
            key={p.name}
            onClick={() => setPalette(p)}
            className={`flex flex-col gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
              palette.name === p.name
                ? "border-amber/60 bg-amber/8"
                : "border-ink-700/60 hover:border-ink-600 bg-ink-900/50"
            }`}
          >
            {/* Color strip */}
            <div className="flex h-4 w-full overflow-hidden rounded border border-black/20">
              {([p.borderColor, p.glowColor, p.fillColor, p.ringColor] as const)
                .map((c, idx) => (
                  <div key={idx} className="flex-1" style={{ background: c }} />
                ))}
            </div>
            <div className="text-[10px] text-white/60 leading-none">{p.name}</div>
          </button>
        ))}
      </div>

      {/* Manual color fields */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {COLOR_KEYS.map((k) => (
          <Field key={k} label={k}>
            <div className="flex gap-1.5">
              <label className="cursor-pointer">
                <input
                  type="color"
                  value={palette[k]}
                  onChange={(e) =>
                    setPalette({ ...palette, name: "Custom", tone: "custom", [k]: e.target.value })
                  }
                  className="sr-only"
                />
                <div
                  className="h-[30px] w-[30px] rounded-md border border-ink-700 hover:border-amber/50 transition-colors"
                  style={{ background: palette[k] }}
                />
              </label>
              <Input
                value={palette[k]}
                onChange={(e) =>
                  setPalette({ ...palette, name: "Custom", tone: "custom", [k]: e.target.value })
                }
              />
            </div>
          </Field>
        ))}
      </div>
    </Section>
  );
};
