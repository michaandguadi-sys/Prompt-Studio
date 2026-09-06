"use client";

import React, { useEffect, useState } from "react";
import { Check, Plus, Trash2, Type } from "lucide-react";
import { Field, Section, Select } from "./controls";
import { promptDialog } from "./dialogs";
import { ColorInput } from "@/components/ui/ColorInput";
import { useEditor } from "../store/editor";
import { THEME_PRESETS, FONT_CHOICES, FONT_GROUPS } from "../doc/themes";
import { recordTaste } from "@/lib/taste";
import type { Theme } from "../doc/schema";

const SAVED_KEY = "mapanisy-themes";

/** Read/write user-saved custom palettes from localStorage. */
function useSavedThemes() {
  const [saved, setSaved] = useState<Theme[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); if (Array.isArray(v)) setSaved(v); } catch {}
  }, []);
  const persist = (next: Theme[]) => { setSaved(next); try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {} };
  return {
    saved,
    add: (t: Theme) => persist([...saved.filter((s) => s.name !== t.name), t]),
    remove: (name: string) => persist(saved.filter((s) => s.name !== name)),
  };
}

/** Small swatch row that previews a theme's colours. */
const Swatches: React.FC<{ t: Theme }> = ({ t }) => (
  <div className="flex items-center gap-0.5">
    {[t.accent, t.fill, t.border, t.glow].map((c, i) => (
      <span key={i} className="h-3.5 w-3.5 rounded-[3px] border border-black/10" style={{ background: c }} />
    ))}
  </div>
);

/**
 * Palette & Fonts — project-wide theme. Picking a preset recolours every layer
 * and swaps fonts in one click; you can also hand-build a palette and save it.
 * Everything has sensible defaults, so this stays entirely optional.
 */
export const ThemePanel: React.FC = () => {
  const theme = useEditor((s) => s.project.composition.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const { saved, add, remove } = useSavedThemes();
  const [custom, setCustom] = useState(false);

  const apply = (t: Theme) => setTheme(t, true); // recolour layers too

  const presets = [...THEME_PRESETS, ...saved];
  const isActive = (t: Theme) =>
    t.accent === theme.accent && t.fill === theme.fill && t.fontDisplay === theme.fontDisplay && t.name === theme.name;

  return (
    <Section title="Palette & fonts">
      {/* Preset palettes */}
      <div className="grid grid-cols-1 gap-1">
        {presets.map((t) => {
          const builtIn = THEME_PRESETS.some((p) => p.name === t.name);
          return (
            <div key={t.name} className="group flex items-center gap-2">
              <button
                onClick={() => apply(t)}
                className={[
                  "flex flex-1 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition",
                  isActive(t) ? "border-iris bg-iris/5" : "border-line hover:border-iris/40 hover:bg-paper-50",
                ].join(" ")}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Swatches t={t} />
                  <span className="truncate text-xs text-graphite/75">{t.name}</span>
                </span>
                {isActive(t) ? <Check size={13} className="shrink-0 text-iris" /> : null}
              </button>
              {!builtIn && (
                <button onClick={() => remove(t.name)} title="Delete saved palette" className="p-1 text-graphite/45 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Fonts — always available, independent of palette */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Field label="Display font" hint="Titles & labels">
          <Select value={theme.fontDisplay} onChange={(e) => { recordTaste("font", e.target.value); setTheme({ fontDisplay: e.target.value }); }}>
            {FONT_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FONT_CHOICES.filter((f) => f.group === g).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Body font" hint="Sub-lines">
          <Select value={theme.fontBody} onChange={(e) => setTheme({ fontBody: e.target.value })}>
            {FONT_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FONT_CHOICES.filter((f) => f.group === g).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      {/* Custom palette builder */}
      {!custom ? (
        <button
          onClick={() => setCustom(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-[11px] uppercase tracking-wider text-graphite/50 hover:border-iris hover:text-iris transition"
        >
          <Plus size={12} /> Create your own
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-graphite/60">
            <Type size={12} className="text-iris" /> Custom palette
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Accent"><ColorInput value={theme.accent} onChange={(v) => setTheme({ accent: v, name: "Custom" }, true)} /></Field>
            <Field label="Fill"><ColorInput value={theme.fill} onChange={(v) => setTheme({ fill: v, name: "Custom" }, true)} /></Field>
            <Field label="Border"><ColorInput value={theme.border} onChange={(v) => setTheme({ border: v, name: "Custom" }, true)} /></Field>
            <Field label="Glow"><ColorInput value={theme.glow} onChange={(v) => setTheme({ glow: v, name: "Custom" }, true)} /></Field>
            <Field label="Text"><ColorInput value={theme.text} onChange={(v) => setTheme({ text: v, name: "Custom" }, true)} /></Field>
          </div>
          <button
            onClick={async () => {
              const name = await promptDialog({ title: "Name this palette", defaultValue: "My palette", confirmLabel: "Save" });
              if (!name) return;
              add({ ...theme, name });
              setTheme({ name });
              setCustom(false);
            }}
            className="w-full rounded-md bg-brand py-1.5 text-[11px] font-semibold text-white hover:opacity-90 transition"
          >
            Save palette
          </button>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-graphite/45">
        Picking a palette recolours every layer and swaps fonts. Each layer can still override its own colour & font.
      </p>
    </Section>
  );
};
