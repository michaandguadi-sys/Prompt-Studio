"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";
import { RevealEditor } from "@/components/ui/RevealEditor";
import type { TitleSceneSpec, TitleAnimation } from "@/lib/types";
import { TITLE_TEMPLATES } from "@/lib/presets/titleTemplates";
import { Check } from "lucide-react";

export const TitleBuilder: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setName = useStudio((s) => s.setName);
  const setDuration = useStudio((s) => s.setDuration);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as TitleSceneSpec;

  if (spec.kind !== "title" || !scene?.reveal) {
    return <div className="p-5 text-sm text-white/40">Loading…</div>;
  }

  const activeTemplate = scene.template ?? "classic";

  return (
    <>
      {/* ── Template picker — pick a complete look, then adjust below ──── */}
      <Section title="Template">
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_TEMPLATES.map((t) => {
            const active = activeTemplate === t.id;
            return (
              <button
                key={t.id}
                onClick={() => patchScene(t.patch)}
                className={`flex flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left transition ${
                  active ? "border-amber bg-amber/10" : "border-ink-700 bg-ink-900 hover:border-amber/40"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className={`text-[11px] font-semibold ${active ? "text-amber" : "text-white"}`}>
                    {t.name}
                  </span>
                  {active && <Check size={10} className="text-amber" />}
                </span>
                <span className="text-[9px] leading-snug text-white/40">{t.description}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Scene">
        <Field label="Scene name">
          <Input value={spec.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Duration (sec)">
          <NumberInput value={spec.durationSec} step={0.5} min={1} max={10} onChange={(v) => setDuration(v)} />
        </Field>
        <Field label="Background">
          <select
            value={scene.background}
            onChange={(e) => patchScene({ background: e.target.value as TitleSceneSpec["background"] })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="solid">Solid dark</option>
            <option value="gradient">Palette gradient</option>
            <option value="transparent">Transparent (overlay)</option>
          </select>
        </Field>
      </Section>

      <Section title="Copy">
        <Field label="Kicker" hint="Small text above title (chapter number, location…)">
          <Input value={scene.kicker} onChange={(e) => patchScene({ kicker: e.target.value })} />
        </Field>
        <Field label="Title">
          <Input value={scene.title} onChange={(e) => patchScene({ title: e.target.value })} />
        </Field>
        <Field label="Subtitle">
          <Input value={scene.subtitle} onChange={(e) => patchScene({ subtitle: e.target.value })} />
        </Field>
      </Section>

      {/* ── Adjustability — every template knob is editable ───────────── */}
      <Section title="Layout & style">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Align">
            <select
              value={scene.align ?? (scene.variant === "left" ? "left" : "center")}
              onChange={(e) => patchScene({ align: e.target.value as TitleSceneSpec["align"] })}
              className="w-full rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-xs text-white"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Position">
            <select
              value={scene.position ?? "center"}
              onChange={(e) => patchScene({ position: e.target.value as TitleSceneSpec["position"] })}
              className="w-full rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-xs text-white"
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
          </Field>
        </div>

        <Field label="Animation">
          <select
            value={scene.animation ?? "fade-up"}
            onChange={(e) => patchScene({ animation: e.target.value as TitleAnimation })}
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-xs text-white"
          >
            <option value="fade-up">Fade up</option>
            <option value="fade">Fade</option>
            <option value="scale">Scale in</option>
            <option value="word-reveal">Word reveal</option>
            <option value="wipe">Wipe</option>
          </select>
        </Field>

        <Slider
          label="Title size"
          value={scene.titleScale ?? 1}
          min={0.5}
          max={2}
          step={0.05}
          suffix="×"
          onChange={(v) => patchScene({ titleScale: v })}
        />
        <Slider
          label="Text width"
          value={scene.maxWidthPct ?? 0.84}
          min={0.3}
          max={1}
          step={0.02}
          suffix="%"
          display={(v) => `${Math.round(v * 100)}`}
          onChange={(v) => patchScene({ maxWidthPct: v })}
        />
        <Slider
          label="Title weight"
          value={scene.titleWeight ?? 200}
          min={100}
          max={900}
          step={100}
          onChange={(v) => patchScene({ titleWeight: v })}
        />

        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="Accent"
            value={scene.accentColor ?? spec.style.palette.borderColor}
            onChange={(v) => patchScene({ accentColor: v })}
          />
          <ColorField
            label="Title color"
            value={scene.titleColor ?? "#ffffff"}
            onChange={(v) => patchScene({ titleColor: v })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={scene.uppercaseTitle ?? false}
            onChange={(e) => patchScene({ uppercaseTitle: e.target.checked })}
            className="accent-amber"
          />
          Uppercase title
        </label>
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

// ── Local helpers ──────────────────────────────────────────────────────────
const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, suffix, display, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between">
      <div className="text-[11px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="text-xs font-mono text-amber">
        {display ? display(value) : value}{suffix ?? ""}
      </div>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber"
    />
  </div>
);

const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Field label={label}>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0 rounded border border-ink-700 bg-ink-900 cursor-pointer"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  </Field>
);
