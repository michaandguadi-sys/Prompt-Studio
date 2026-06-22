"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";
import { RevealEditor } from "@/components/ui/RevealEditor";
import { ColorInput } from "@/components/ui/ColorInput";
import type { QuoteSceneSpec } from "@/lib/types";

export const QuoteBuilder: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setName = useStudio((s) => s.setName);
  const setDuration = useStudio((s) => s.setDuration);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as QuoteSceneSpec;

  if (spec.kind !== "quote" || !scene?.reveal) {
    return <div className="p-5 text-sm text-white/40">Loading…</div>;
  }

  return (
    <>
      <Section title="Scene">
        <Field label="Scene name">
          <Input value={spec.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Duration (sec)">
          <NumberInput
            value={spec.durationSec}
            step={0.5} min={2} max={20}
            onChange={(v) => setDuration(v)}
          />
        </Field>
        <Field label="Variant">
          <select
            value={scene.variant}
            onChange={(e) => patchScene({ variant: e.target.value as QuoteSceneSpec["variant"] })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="centered">Centered</option>
            <option value="left">Left-aligned</option>
          </select>
        </Field>
        <Field label="Background">
          <select
            value={scene.background}
            onChange={(e) => patchScene({ background: e.target.value as QuoteSceneSpec["background"] })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="solid">Solid dark</option>
            <option value="gradient">Palette gradient</option>
            <option value="transparent">Transparent (overlay)</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={scene.showQuoteMarks}
            onChange={(e) => patchScene({ showQuoteMarks: e.target.checked })}
            className="accent-amber"
          />
          Show oversized opening quote mark
        </label>
      </Section>

      <Section title="Copy">
        <Field label="The quote" hint="Serif typography — full quote text">
          <textarea
            value={scene.quote}
            onChange={(e) => patchScene({ quote: e.target.value })}
            rows={4}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-2 text-sm text-white focus:border-amber/60 focus:outline-none resize-y"
          />
        </Field>
        <Field label="Attribution">
          <Input
            value={scene.attribution}
            onChange={(e) => patchScene({ attribution: e.target.value })}
          />
        </Field>
        <Field label="Context (optional, small line below)">
          <Input
            value={scene.context}
            onChange={(e) => patchScene({ context: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Look & feel">
        <Field label="Entrance animation">
          <select
            value={scene.animation ?? "fade-up"}
            onChange={(e) => patchScene({ animation: e.target.value as QuoteSceneSpec["animation"] })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="fade-up">Fade up</option>
            <option value="fade">Fade</option>
            <option value="scale">Scale in</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text size">
            <NumberInput
              value={scene.fontScale ?? 1}
              step={0.05} min={0.5} max={2} unit="×"
              onChange={(v) => patchScene({ fontScale: v })}
            />
          </Field>
          <Field label="Max width">
            <NumberInput
              value={Math.round((scene.maxWidthPct ?? 0.8) * 100)}
              step={5} min={40} max={100} unit="%"
              onChange={(v) => patchScene({ maxWidthPct: v / 100 })}
            />
          </Field>
        </div>
        <Field label="Accent color" hint="Quote marks + attribution">
          <div className="flex items-center gap-2">
            <ColorInput
              value={scene.accentColor ?? spec.style.palette.borderColor ?? "#f5b642"}
              ariaLabel="Quote accent color"
              onChange={(v) => patchScene({ accentColor: v })}
            />
            {scene.accentColor && (
              <button
                onClick={() => patchScene({ accentColor: undefined })}
                className="text-[10px] text-white/40 hover:text-amber transition"
                title="Reset to palette color"
              >
                Reset
              </button>
            )}
          </div>
        </Field>
      </Section>

      <RevealEditor
        reveal={scene.reveal}
        fps={spec.fps}
        durationSec={spec.durationSec}
        onChange={(reveal) => patchScene({ reveal })}
      />
    </>
  );
};
