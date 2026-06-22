"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";
import { RevealEditor } from "@/components/ui/RevealEditor";
import { ColorInput } from "@/components/ui/ColorInput";
import type { LowerThirdSceneSpec } from "@/lib/types";

export const LowerThirdBuilder: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setName = useStudio((s) => s.setName);
  const setDuration = useStudio((s) => s.setDuration);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as LowerThirdSceneSpec;

  if (spec.kind !== "lowerthird" || !scene?.reveal) {
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
            step={0.5}
            min={1}
            max={20}
            onChange={(v) => setDuration(v)}
          />
        </Field>
        <Field label="Position">
          <select
            value={scene.position}
            onChange={(e) =>
              patchScene({ position: e.target.value as LowerThirdSceneSpec["position"] })
            }
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="left">Bottom-left</option>
            <option value="right">Bottom-right</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={scene.accentBar}
            onChange={(e) => patchScene({ accentBar: e.target.checked })}
            className="accent-amber"
          />
          Accent bar
        </label>
      </Section>

      <Section title="Copy">
        <Field label="Name (big)">
          <Input
            value={scene.name}
            onChange={(e) => patchScene({ name: e.target.value })}
          />
        </Field>
        <Field label="Role (small, accent color)">
          <Input
            value={scene.role}
            onChange={(e) => patchScene({ role: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Look & feel">
        <Field label="Entrance animation">
          <select
            value={scene.animation ?? "slide"}
            onChange={(e) => patchScene({ animation: e.target.value as LowerThirdSceneSpec["animation"] })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="slide">Slide in</option>
            <option value="fade">Fade</option>
            <option value="wipe">Wipe</option>
          </select>
        </Field>
        <Field label="Text size">
          <NumberInput
            value={scene.fontScale ?? 1}
            step={0.05} min={0.5} max={2} unit="×"
            onChange={(v) => patchScene({ fontScale: v })}
          />
        </Field>
        <Field label="Accent color" hint="Bar + role text">
          <div className="flex items-center gap-2">
            <ColorInput
              value={scene.accentColor ?? spec.style.palette.borderColor ?? "#f5b642"}
              ariaLabel="Lower third accent color"
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

      <div className="px-5 py-3 text-[11px] text-white/40 border-t border-ink-700">
        Tip: lower thirds render on a transparent background — set DaVinci Resolve
        clip composite mode to <span className="text-amber">normal</span> over your
        footage, no alpha extraction needed for ProRes 4444 / PNG sequence renders.
      </div>
    </>
  );
};
