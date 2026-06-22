"use client";

import React, { useState } from "react";
import { useStudio } from "@/store/studio";
import { Field, Input, NumberInput, Section } from "@/components/ui/Field";
import { CameraWaypoints } from "./CameraWaypoints";
import { HighlightEditor } from "./HighlightEditor";
import { MapStylePicker } from "./MapStylePicker";
import { RouteEditor } from "./RouteEditor";
import { PlaceSearch } from "./PlaceSearch";
import { ColorInput } from "@/components/ui/ColorInput";
import { StylePackagePicker } from "@/components/StyleEditor/StylePackagePicker";
import { matchStylePackage, STYLE_PACKAGES } from "@/lib/presets/packages";
import { Eye, EyeOff, Plus, Trash2, MapPin } from "lucide-react";
import { EASING_LABELS, type EasingType } from "@/lib/interp";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import type { MapSceneSpec } from "@/lib/types";
import { DEFAULT_FONTS } from "@/lib/presets/fonts";

export const MapBuilder: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setName = useStudio((s) => s.setName);
  const setDuration = useStudio((s) => s.setDuration);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as MapSceneSpec;

  // Disclosure state for the technical / advanced sections
  const [openTiming, setOpenTiming] = useState(false);

  // Available font families for the per-label override picker (#5):
  // the active style package's fonts first, then the bundled defaults.
  const packageFont = spec.style.fonts.primary.family;
  const fontFamilies = Array.from(
    new Set([
      spec.style.fonts.primary.family,
      spec.style.fonts.secondary.family,
      ...DEFAULT_FONTS.map((f) => f.family),
    ]),
  );

  if (spec.kind !== "map" || !scene?.start) {
    return <div className="p-5 text-sm text-white/40">Loading…</div>;
  }

  // New labels adopt the active style package's default layout (#3 + #5),
  // so adding a label under "YouTube Simple" gives a banner, under "Cinematic"
  // a tracked city label, etc.
  const activePkgId = matchStylePackage(spec.style.name);
  const defaultLabelLayout =
    STYLE_PACKAGES.find((p) => p.id === activePkgId)?.defaultLabelLayout ?? "tracked-card";

  return (
    <>
      {/* ── Curated style packages — first decision, top of the editor ── */}
      <StylePackagePicker />

      {/* ── Compact scene strip — most-used fields up top ─────────────── */}
      <div className="border-b border-ink-700 bg-ink-800/40 px-5 py-3 space-y-2">
        <div className="flex gap-2 items-end">
          <Field label="Scene name">
            <Input value={spec.name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="w-24 shrink-0">
            <Field label="Duration (s)">
              <NumberInput
                value={spec.durationSec}
                step={0.5} min={1} max={15}
                onChange={(v) => setDuration(v)}
              />
            </Field>
          </div>
        </div>
        <div className="text-[10px] text-white/40 font-mono">
          {spec.width}×{spec.height} · {spec.fps}fps · {Math.round(spec.durationSec * spec.fps)} frames
        </div>
      </div>

      {/* ── Primary creative controls ─────────────────────────────────── */}
      <CameraWaypoints />
      <MapStylePicker />
      <HighlightEditor />
      <RouteEditor />

      {/* Labels — promoted out of Advanced disclosure per UX audit */}
      <Section title={`Labels (${scene.labels.length})`}>
        {scene.labels.length === 0 && (
          <div className="text-[11px] text-white/40">
            No labels yet. Click + to add — choose Text / Card / Counter / Lower-third / Banner.
          </div>
        )}
        {scene.labels.map((lab, i) => {
          const enabled = lab.enabled !== false;
          return (
            <div
              key={i}
              className={`rounded-md border p-3 flex flex-col gap-2 transition ${
                enabled ? "border-ink-700 bg-ink-900/60" : "border-ink-700/50 bg-ink-900/30 opacity-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = [...scene.labels];
                    next[i] = { ...lab, enabled: !enabled };
                    patchScene({ labels: next });
                  }}
                  className={enabled ? "text-amber" : "text-white/30 hover:text-white"}
                  title={enabled ? "Hide label" : "Show label"}
                >
                  {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <span className="flex-1 text-[10px] uppercase tracking-wider text-white/50">
                  Label {i + 1} · {lab.layout}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Delete label "${lab.primary || "untitled"}"?`)) {
                      patchScene({ labels: scene.labels.filter((_, idx) => idx !== i) });
                    }
                  }}
                  className="text-white/40 hover:text-red-400"
                  title="Delete label"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <Field label="Primary text">
                <Input
                  value={lab.primary}
                  onChange={(e) => {
                    const next = [...scene.labels];
                    next[i] = { ...lab, primary: e.target.value };
                    patchScene({ labels: next });
                  }}
                />
              </Field>
              {lab.layout !== "stat-counter" && (
                <Field label="Secondary">
                  <Input
                    value={lab.secondary}
                    onChange={(e) => {
                      const next = [...scene.labels];
                      next[i] = { ...lab, secondary: e.target.value };
                      patchScene({ labels: next });
                    }}
                  />
                </Field>
              )}
              {/* Stat counter extra fields */}
              {lab.layout === "stat-counter" && (
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Prefix"><Input value={lab.counterPrefix ?? ""} onChange={(e) => {
                    const n = [...scene.labels]; n[i] = { ...lab, counterPrefix: e.target.value };
                    patchScene({ labels: n });
                  }} /></Field>
                  <Field label="Value">
                    <NumberInput value={lab.counterValue ?? 0} onChange={(v) => {
                      const n = [...scene.labels]; n[i] = { ...lab, counterValue: v };
                      patchScene({ labels: n });
                    }} />
                  </Field>
                  <Field label="Suffix"><Input value={lab.counterSuffix ?? ""} onChange={(e) => {
                    const n = [...scene.labels]; n[i] = { ...lab, counterSuffix: e.target.value };
                    patchScene({ labels: n });
                  }} /></Field>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Field label="In">
                  <NumberInput
                    value={Math.round((lab.primaryInFrame / spec.fps) * 100) / 100}
                    step={0.1} min={0} max={spec.durationSec} unit="s"
                    onChange={(v) => {
                      const next = [...scene.labels]; next[i] = { ...lab, primaryInFrame: Math.max(0, Math.round(v * spec.fps)) };
                      patchScene({ labels: next });
                    }}
                  />
                </Field>
                <Field label="Out">
                  <NumberInput
                    value={Math.round((lab.primaryOutFrame / spec.fps) * 100) / 100}
                    step={0.1} min={0} max={spec.durationSec} unit="s"
                    onChange={(v) => {
                      const next = [...scene.labels]; next[i] = { ...lab, primaryOutFrame: Math.max(0, Math.round(v * spec.fps)) };
                      patchScene({ labels: next });
                    }}
                  />
                </Field>
                <Field label="Variant">
                  <select
                    value={lab.layout}
                    onChange={(e) => {
                      const next = [...scene.labels]; next[i] = { ...lab, layout: e.target.value as any };
                      patchScene({ labels: next });
                    }}
                    className="w-full rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="city-projected">Text (dot + ring)</option>
                    <option value="tracked-card">Card (pill, tracked)</option>
                    <option value="stat-counter">Counter (animated number)</option>
                    <option value="lowerthird">Lower-third (accent bar)</option>
                    <option value="bottom-banner">Bottom banner (fixed)</option>
                  </select>
                </Field>
              </div>
              {/* Fade in / out — each can be turned off. Off-out = holds to end. */}
              <div className="flex items-center gap-2">
                {([
                  { key: "fadeIn" as const, label: "Fade in" },
                  { key: "fadeOut" as const, label: "Fade out" },
                ]).map(({ key, label }) => {
                  const on = lab[key] !== false;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const next = [...scene.labels];
                        next[i] = { ...lab, [key]: !on };
                        patchScene({ labels: next });
                      }}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                        on
                          ? "border-amber/50 bg-amber/10 text-amber"
                          : "border-ink-700 bg-ink-900 text-white/45 hover:text-white/70"
                      }`}
                      title={key === "fadeOut" && !on ? "Label stays on screen to the end" : undefined}
                    >
                      {label}: {on ? "On" : "None"}
                    </button>
                  );
                })}
              </div>
              {/* Accent color — drives the label's chrome (dot/ring, border, bar, counter) */}
              <Field label="Accent color" hint="Dot / ring / border / bar — defaults to the palette">
                <div className="flex items-center gap-2">
                  <ColorInput
                    value={lab.accentColor ?? spec.style.palette.borderColor ?? "#f5b642"}
                    ariaLabel="Label accent color"
                    onChange={(v) => {
                      const next = [...scene.labels];
                      next[i] = { ...lab, accentColor: v };
                      patchScene({ labels: next });
                    }}
                  />
                  {lab.accentColor && (
                    <button
                      onClick={() => {
                        const next = [...scene.labels];
                        next[i] = { ...lab, accentColor: undefined };
                        patchScene({ labels: next });
                      }}
                      className="text-[10px] text-white/40 hover:text-amber transition"
                      title="Reset to palette color"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </Field>
              {/* Per-label font override (#5) — defaults to the package font */}
              <Field label="Font" hint="Overrides the style-package font for this label only">
                <select
                  value={lab.fontFamily ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = [...scene.labels];
                    next[i] = { ...lab, fontFamily: v === "" ? undefined : v };
                    patchScene({ labels: next });
                  }}
                  className="w-full rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-xs text-white"
                  style={lab.fontFamily ? { fontFamily: `'${lab.fontFamily}', Inter, sans-serif` } : undefined}
                >
                  <option value="">Package font ({packageFont})</option>
                  {fontFamilies.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: `'${f}', Inter, sans-serif` }}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              {/* Anchor coordinates for tracked variants — search a place to fill them */}
              {(lab.layout === "city-projected" || lab.layout === "tracked-card" || lab.layout === "stat-counter" || lab.layout === "lowerthird") && (
                <div className="flex flex-col gap-2">
                  <Field label="Pin a place" hint="Search to drop this label at a real location">
                    <PlaceSearch
                      size="sm"
                      placeholder="Search city, landmark, country…"
                      onPick={(p) => {
                        const n = [...scene.labels];
                        // Fill coords; set the title from the place unless the user
                        // already typed a custom one (don't clobber real edits).
                        const isPlaceholder = !lab.primary || lab.primary === "New label" || lab.primary === "New place";
                        n[i] = {
                          ...lab,
                          projectLon: p.lon,
                          projectLat: p.lat,
                          primary: isPlaceholder ? (p.shortName ?? p.name) : lab.primary,
                        };
                        patchScene({ labels: n });
                      }}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Anchor lon">
                      <NumberInput value={lab.projectLon ?? scene.end.lon} step={0.001} onChange={(v) => {
                        const n = [...scene.labels]; n[i] = { ...lab, projectLon: v };
                        patchScene({ labels: n });
                      }} />
                    </Field>
                    <Field label="Anchor lat">
                      <NumberInput value={lab.projectLat ?? scene.end.lat} step={0.001} onChange={(v) => {
                        const n = [...scene.labels]; n[i] = { ...lab, projectLat: v };
                        patchScene({ labels: n });
                      }} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => patchScene({
              labels: [
                ...scene.labels,
                {
                  primary: "New label",
                  secondary: "",
                  primaryInFrame: 12,
                  primaryOutFrame: Math.round(spec.durationSec * spec.fps) - 12,
                  secondaryInFrame: 12,
                  layout: defaultLabelLayout,
                  projectLon: scene.end.lon,
                  projectLat: scene.end.lat,
                  enabled: true,
                },
              ],
            })}
            className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink-600 px-3 py-2 text-xs uppercase tracking-wider text-white/60 hover:border-amber hover:text-amber transition"
          >
            <Plus size={12} />
            Add label
          </button>
          <button
            onClick={() => patchScene({
              labels: [
                ...scene.labels,
                {
                  primary: "New place",
                  secondary: "",
                  primaryInFrame: 12,
                  primaryOutFrame: Math.round(spec.durationSec * spec.fps) - 12,
                  secondaryInFrame: 12,
                  // A place pin is a tracked dot + ring + title at real coords.
                  layout: "city-projected",
                  projectLon: scene.end.lon,
                  projectLat: scene.end.lat,
                  enabled: true,
                },
              ],
            })}
            className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-amber/40 px-3 py-2 text-xs uppercase tracking-wider text-amber/80 hover:border-amber hover:text-amber hover:bg-amber/5 transition"
          >
            <MapPin size={12} />
            Add place pin
          </button>
        </div>
      </Section>

      {/* ── Advanced: collapsible timing / labels / overlay ───────────── */}
      <Disclosure
        title="Animation timing & easing"
        icon={<Clock size={13} />}
        open={openTiming}
        onToggle={() => setOpenTiming(!openTiming)}
      >
        <div className="text-[11px] text-white/50 leading-relaxed mb-2">
          Beats are <span className="text-amber">percentages of total duration</span>.
        </div>
        <BeatSlider
          label="Camera reaches end at"
          hint="The whole multi-waypoint pan happens within this window."
          value={scene.beats.arrive}
          onChange={(v) => patchScene({ beats: { ...scene.beats, arrive: v } })}
        />
        <BeatSlider
          label="Highlight fades in at"
          value={scene.beats.hold}
          onChange={(v) => patchScene({ beats: { ...scene.beats, hold: v } })}
        />
        <BeatSlider
          label="Highlight fully visible at"
          value={scene.beats.breathe}
          onChange={(v) => patchScene({ beats: { ...scene.beats, breathe: v } })}
        />
        <Field label="First-phase easing" hint="Continent → region">
          <select
            value={scene.easing?.phase1 ?? "easeInOut"}
            onChange={(e) =>
              patchScene({
                easing: { phase1: e.target.value as EasingType, phase2: scene.easing?.phase2 ?? "smooth" },
              })
            }
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            {Object.entries(EASING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Subsequent-phase easing" hint="All chained pans after the first">
          <select
            value={scene.easing?.phase2 ?? "smooth"}
            onChange={(e) =>
              patchScene({
                easing: { phase1: scene.easing?.phase1 ?? "easeInOut", phase2: e.target.value as EasingType },
              })
            }
            className="w-full rounded-md bg-ink-900 border border-ink-700 px-3 py-1.5 text-sm text-white"
          >
            {Object.entries(EASING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </Disclosure>
    </>
  );
};

// ── BeatSlider + Disclosure helpers ───────────────────────────────────────

const BeatSlider: React.FC<{
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, hint, value, onChange }) => {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/60">{label}</div>
        <div className="text-xs font-mono text-amber">{pct}%</div>
      </div>
      <input
        type="range" min={0} max={100} step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-amber"
      />
      {hint && <div className="text-[10px] text-white/40 mt-0.5">{hint}</div>}
    </div>
  );
};

const Disclosure: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, children }) => (
  <section className="border-b border-ink-700">
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-ink-800/40"
    >
      {open ? <ChevronDown size={12} className="text-amber" /> : <ChevronRight size={12} className="text-white/50" />}
      <span className="text-amber">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">{title}</span>
    </button>
    {open && (
      <div className="px-5 pb-4 flex flex-col gap-3">{children}</div>
    )}
  </section>
);
