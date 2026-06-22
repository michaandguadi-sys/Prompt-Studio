"use client";

import React from "react";
import { Field, NumberInput, Section } from "./Field";

export type Reveal = { inFrame: number; holdFrame: number; outFrame: number };

/**
 * Shared reveal-timing editor.
 *
 * Storage stays in FRAMES (Remotion + codegen consume frames), but the UI
 * speaks SECONDS — which is what creators actually think in. One component so
 * every builder shows identical, consistent timing controls.
 *
 *   In   — when the element has finished animating in
 *   Hold — when it starts animating out
 *   Out  — when it has finished animating out
 */
export const RevealEditor: React.FC<{
  reveal: Reveal;
  fps: number;
  /** Scene length in seconds — used to cap the Out value. */
  durationSec: number;
  onChange: (next: Reveal) => void;
}> = ({ reveal, fps, durationSec, onChange }) => {
  const toSec = (f: number) => Math.round((f / fps) * 100) / 100;
  const toFrame = (s: number) => Math.max(0, Math.round(s * fps));

  const set = (key: keyof Reveal, sec: number) =>
    onChange({ ...reveal, [key]: toFrame(sec) });

  return (
    <Section title="Reveal timing">
      <div className="grid grid-cols-3 gap-2">
        <Field label="In">
          <NumberInput
            value={toSec(reveal.inFrame)}
            step={0.1}
            min={0}
            max={durationSec}
            unit="s"
            onChange={(v) => set("inFrame", v)}
          />
        </Field>
        <Field label="Hold">
          <NumberInput
            value={toSec(reveal.holdFrame)}
            step={0.1}
            min={0}
            max={durationSec}
            unit="s"
            onChange={(v) => set("holdFrame", v)}
          />
        </Field>
        <Field label="Out">
          <NumberInput
            value={toSec(reveal.outFrame)}
            step={0.1}
            min={0}
            max={durationSec}
            unit="s"
            onChange={(v) => set("outFrame", v)}
          />
        </Field>
      </div>
    </Section>
  );
};
