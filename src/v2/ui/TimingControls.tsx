"use client";

import React from "react";
import { Field, NumberInput, Select, Section } from "./controls";
import type { Timing } from "../doc/schema";

/**
 * The ONE animation/timing editor for every layer. Because the renderer reads
 * the same Timing contract, what you set here is exactly what you get —
 * including a real "stays to the end" (no fade-out) option, which v1 lacked.
 */
export const TimingControls: React.FC<{
  timing: Timing;
  durationSec: number;
  onChange: (patch: Partial<Timing>) => void;
}> = ({ timing, durationSec, onChange }) => {
  const hasOut = timing.outSec != null;

  return (
    <Section title="Animation">
      <div className="grid grid-cols-2 gap-2">
        <Field label="In at" hint="when it has finished entering">
          <NumberInput
            value={Math.round(timing.inSec * 100) / 100}
            step={0.1} min={0} max={durationSec} unit="s"
            onChange={(v) => onChange({ inSec: v })}
          />
        </Field>
        <Field label="Fade in" hint="how long the enter takes">
          <NumberInput
            value={Math.round((timing.fadeInSec ?? 0.35) * 100) / 100}
            step={0.05} min={0} max={6} unit="s"
            onChange={(v) => onChange({ fadeInSec: v })}
          />
        </Field>
      </div>
      <Field label="Enter">
        <Select value={timing.enter} onChange={(e) => onChange({ enter: e.target.value as Timing["enter"] })}>
          <option value="fade">Fade</option>
          <option value="slide-up">Slide up</option>
          <option value="slide-down">Slide down</option>
          <option value="scale">Scale</option>
          <option value="none">None (cut)</option>
        </Select>
      </Field>

      {/* Fade out / none */}
      <Field label="Exit" hint="Turn off to keep it on screen to the end">
        <label className="flex items-center gap-2 text-xs text-graphite/80">
          <input
            type="checkbox"
            checked={hasOut}
            onChange={(e) => onChange({ outSec: e.target.checked ? Math.max(0, durationSec - 0.6) : null })}
            className="accent-iris"
          />
          {hasOut ? "Animates out" : "Stays to end (no exit)"}
        </label>
      </Field>

      {hasOut && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Out at" hint="when it begins leaving">
              <NumberInput
                value={Math.round((timing.outSec as number) * 100) / 100}
                step={0.1} min={0} max={durationSec} unit="s"
                onChange={(v) => onChange({ outSec: v })}
              />
            </Field>
            <Field label="Fade out" hint="how long the exit takes">
              <NumberInput
                value={Math.round((timing.fadeOutSec ?? 0.35) * 100) / 100}
                step={0.05} min={0} max={6} unit="s"
                onChange={(v) => onChange({ fadeOutSec: v })}
              />
            </Field>
          </div>
          <Field label="Exit style">
            <Select value={timing.exit} onChange={(e) => onChange({ exit: e.target.value as Timing["exit"] })}>
              <option value="fade">Fade</option>
              <option value="slide-down">Slide down</option>
              <option value="scale">Scale</option>
              <option value="none">None (cut)</option>
            </Select>
          </Field>
        </>
      )}

      <Field label="Easing">
        <Select value={timing.easing} onChange={(e) => onChange({ easing: e.target.value as Timing["easing"] })}>
          <option value="easeInOut">Ease in-out (smooth)</option>
          <option value="easeOut">Ease out</option>
          <option value="easeIn">Ease in</option>
          <option value="linear">Linear</option>
          <option value="spring">Spring</option>
        </Select>
      </Field>
    </Section>
  );
};
