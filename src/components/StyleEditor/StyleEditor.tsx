"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { PaletteEditor } from "./PaletteEditor";
import { FontUpload } from "./FontUpload";
import { StylePackagePicker } from "./StylePackagePicker";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";

export const StyleEditor: React.FC = () => {
  const style = useStudio((s) => s.spec.style);
  const kind = useStudio((s) => s.spec.kind);
  const patchStyle = useStudio((s) => s.patchStyle);

  return (
    <>
      {/* Map scenes already get the package picker at the top of MapBuilder;
          show it here for the other scene types (title / quote / lower-third). */}
      {kind !== "map" && <StylePackagePicker />}
      <PaletteEditor />
      <FontUpload />

      <Section title="Typography">
        <Field label="Primary font family">
          <Input
            value={style.fonts.primary.family}
            onChange={(e) =>
              patchStyle({
                fonts: {
                  ...style.fonts,
                  primary: { ...style.fonts.primary, family: e.target.value },
                },
              })
            }
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title size">
            <NumberInput
              value={style.labelTypography.titleSize}
              onChange={(v) =>
                patchStyle({
                  labelTypography: { ...style.labelTypography, titleSize: v },
                })
              }
            />
          </Field>
          <Field label="Title spacing">
            <NumberInput
              value={style.labelTypography.titleSpacing}
              onChange={(v) =>
                patchStyle({
                  labelTypography: {
                    ...style.labelTypography,
                    titleSpacing: v,
                  },
                })
              }
            />
          </Field>
          <Field label="Sub size">
            <NumberInput
              value={style.labelTypography.subSize}
              onChange={(v) =>
                patchStyle({
                  labelTypography: { ...style.labelTypography, subSize: v },
                })
              }
            />
          </Field>
          <Field label="Sub spacing">
            <NumberInput
              value={style.labelTypography.subSpacing}
              onChange={(v) =>
                patchStyle({
                  labelTypography: { ...style.labelTypography, subSpacing: v },
                })
              }
            />
          </Field>
        </div>
      </Section>

      <Section title="Letterbox">
        <LetterboxControl
          height={style.letterboxHeight}
          onChange={(v) => patchStyle({ letterboxHeight: v })}
        />
      </Section>
    </>
  );
};

/** Letterbox = a simple on/off toggle plus a height slider (default 80px when on). */
const DEFAULT_LETTERBOX = 80;

const LetterboxControl: React.FC<{ height: number; onChange: (v: number) => void }> = ({
  height,
  onChange,
}) => {
  const on = height > 0;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_LETTERBOX : 0)}
          className="accent-amber"
        />
        <span className="flex-1">Cinematic letterbox bars</span>
      </label>
      {on && (
        <div>
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-wider text-white/60">Bar height</div>
            <div className="text-xs font-mono text-amber">{height}px</div>
          </div>
          <input
            type="range"
            min={20}
            max={320}
            step={4}
            value={height}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-amber"
          />
          <div className="text-[10px] text-white/40 mt-0.5">Top + bottom gradient bars (4K canvas px).</div>
        </div>
      )}
    </div>
  );
};
