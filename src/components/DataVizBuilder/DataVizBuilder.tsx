"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";
import { RevealEditor } from "@/components/ui/RevealEditor";
import { ColorInput } from "@/components/ui/ColorInput";
import type { DataVizSceneSpec } from "@/lib/types";

export const DataVizBuilder: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setName = useStudio((s) => s.setName);
  const setDuration = useStudio((s) => s.setDuration);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as DataVizSceneSpec;

  // Guard: page may briefly mount with a non-dataviz spec from the store
  if (spec.kind !== "dataviz" || !scene?.reveal) {
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
        <Field label="Variant">
          <select
            value={scene.variant}
            onChange={(e) =>
              patchScene({ variant: e.target.value as DataVizSceneSpec["variant"] })
            }
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            <option value="counter">Counter</option>
            <option value="bar">Bar chart</option>
            <option value="line">Line chart</option>
          </select>
        </Field>
        <Field label="Accent color" hint="Counter / bars / line / dots — defaults to the palette">
          <div className="flex items-center gap-2">
            <ColorInput
              value={scene.accentColor ?? spec.style.palette.borderColor ?? "#f5b642"}
              ariaLabel="Data viz accent color"
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

      <Section title="Labels">
        <Field label="Title (big text)">
          <Input
            value={scene.labels.title}
            onChange={(e) =>
              patchScene({ labels: { ...scene.labels, title: e.target.value } })
            }
          />
        </Field>
        <Field label="Subtitle (small text above)">
          <Input
            value={scene.labels.subtitle}
            onChange={(e) =>
              patchScene({
                labels: { ...scene.labels, subtitle: e.target.value },
              })
            }
          />
        </Field>
      </Section>

      {scene.variant === "counter" && (
        <Section title="Counter data">
          <Field label="Value">
            <NumberInput
              value={scene.data.value ?? 0}
              step={1}
              onChange={(v) =>
                patchScene({ data: { ...scene.data, value: v } })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Prefix">
              <Input
                value={scene.data.prefix ?? ""}
                onChange={(e) =>
                  patchScene({ data: { ...scene.data, prefix: e.target.value } })
                }
              />
            </Field>
            <Field label="Suffix">
              <Input
                value={scene.data.suffix ?? ""}
                onChange={(e) =>
                  patchScene({ data: { ...scene.data, suffix: e.target.value } })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Decimals">
              <NumberInput
                value={scene.data.decimals ?? 0}
                step={1} min={0} max={4}
                onChange={(v) =>
                  patchScene({ data: { ...scene.data, decimals: v } })
                }
              />
            </Field>
            <Field label="Thousands separator">
              <label className="flex h-9 items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={scene.data.separator ?? true}
                  onChange={(e) =>
                    patchScene({ data: { ...scene.data, separator: e.target.checked } })
                  }
                  className="accent-amber"
                />
                1,000s
              </label>
            </Field>
          </div>
        </Section>
      )}

      {scene.variant === "bar" && (
        <Section title="Bar data">
          <BarsEditor
            bars={scene.data.bars ?? []}
            onChange={(bars) =>
              patchScene({ data: { ...scene.data, bars } })
            }
          />
        </Section>
      )}

      {scene.variant === "line" && (
        <Section title="Line data">
          <BarsEditor
            bars={scene.data.points ?? []}
            onChange={(points) =>
              patchScene({ data: { ...scene.data, points } })
            }
          />
        </Section>
      )}

      <RevealEditor
        reveal={scene.reveal}
        fps={spec.fps}
        durationSec={spec.durationSec}
        onChange={(reveal) => patchScene({ reveal })}
      />
    </>
  );
};

const BarsEditor: React.FC<{
  bars: { label: string; value: number }[];
  onChange: (bars: { label: string; value: number }[]) => void;
}> = ({ bars, onChange }) => (
  <div className="flex flex-col gap-2">
    {bars.map((b, i) => (
      <div key={i} className="flex gap-2 items-center">
        <Input
          value={b.label}
          placeholder="Label"
          onChange={(e) => {
            const next = [...bars];
            next[i] = { ...b, label: e.target.value };
            onChange(next);
          }}
        />
        <NumberInput
          value={b.value}
          onChange={(v) => {
            const next = [...bars];
            next[i] = { ...b, value: v };
            onChange(next);
          }}
        />
        <button
          onClick={() => onChange(bars.filter((_, j) => j !== i))}
          className="px-2 text-white/40 hover:text-red-400"
        >
          ×
        </button>
      </div>
    ))}
    <button
      onClick={() => onChange([...bars, { label: "Item", value: 100 }])}
      className="rounded-md border border-dashed border-ink-700 px-3 py-2 text-xs text-white/60 hover:border-amber hover:text-amber"
    >
      + Add data point
    </button>
  </div>
);
