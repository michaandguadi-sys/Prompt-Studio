"use client";

import React, { useCallback, useState } from "react";
import {
  Search,
  Globe2,
  Building2,
  MapPin,
  Waves,
  Trees,
  Loader2,
  X,
  Sparkles,
  Plus,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import { Section, Field, NumberInput } from "@/components/ui/Field";
import { ColorInput } from "@/components/ui/ColorInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { SortableList, DragHandle } from "@/components/ui/SortableList";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { MapPicker } from "@/components/MapPicker/MapPicker";
import { defaultHighlightStyle } from "@/lib/highlightStyle";
import { FILL_TYPE_OPTIONS } from "@/lib/mapPatterns";
import { HIGHLIGHT_PRESETS, type HighlightPreset } from "@/lib/presets/highlightPresets";
import type { MapSceneSpec, HighlightSpec } from "@/lib/types";

type Result = {
  id: string;
  name: string;
  shortName?: string;
  placeType: string;
  center: { lat: number; lon: number };
  bbox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  countryISO?: string | null;
  geojson: any;
};

const ICONS: Record<string, React.ReactNode> = {
  country: <Globe2 size={14} />,
  region: <Globe2 size={14} />,
  district: <Building2 size={14} />,
  city: <Building2 size={14} />,
  neighborhood: <MapPin size={14} />,
  ocean: <Waves size={14} />,
  river: <Waves size={14} />,
  custom: <Trees size={14} />,
};

/** Heuristic: pick a good camera zoom for a given bbox (latitude in deg) */
function zoomForBbox(bbox: Result["bbox"]): number {
  if (!bbox) return 9;
  const latSpan = Math.max(0.001, bbox.maxLat - bbox.minLat);
  const lonSpan = Math.max(0.001, bbox.maxLon - bbox.minLon);
  const span = Math.max(latSpan, lonSpan);
  return Math.max(2, Math.min(14, Math.log2(360 / span) - 0.8));
}

/** Normalize legacy single-`highlight` field into the new `highlights` array. */
function getHighlights(scene: MapSceneSpec): HighlightSpec[] {
  if (Array.isArray(scene.highlights)) return scene.highlights;
  if (scene.highlight) return [scene.highlight];
  return [];
}

export const HighlightEditor: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as MapSceneSpec;
  const palette = spec.style.palette;

  const highlights = getHighlights(scene);
  const [q, setQ] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(highlights.length === 1 ? 0 : null);

  const fetcher = useCallback(
    async (q: string, signal: AbortSignal): Promise<Result[]> => {
      const res = await fetch(`/api/highlight-search?q=${encodeURIComponent(q)}`, { signal });
      const d = await res.json();
      return d.results ?? [];
    },
    [],
  );
  const { results, loading } = useDebouncedSearch<Result>(q, fetcher);

  const writeList = (next: HighlightSpec[]) => {
    // Also clear the deprecated single-`highlight` field so back-compat code
    // doesn't accidentally render a stale highlight.
    patchScene({ highlights: next, highlight: null });
  };

  const apply = (r: Result, target: "new" | number = "new") => {
    const newHl: HighlightSpec = {
      name: r.shortName ?? r.name.split(",")[0],
      placeType: r.placeType,
      geojson: r.geojson,
      style: defaultHighlightStyle(palette),
      ...(r.countryISO ? { countryISO: r.countryISO } : {}),
    };
    if (target === "new") {
      const next = [...highlights, newHl];
      writeList(next);
      setOpenIdx(next.length - 1);
      // Only auto-frame camera for the FIRST highlight — adding more shouldn't
      // hijack the camera that's already set up.
      if (highlights.length === 0) {
        const zoom = zoomForBbox(r.bbox);
        patchScene({
          end: { ...scene.end, lon: r.center.lon, lat: r.center.lat, zoom },
        });
      }
    } else {
      const next = [...highlights];
      next[target] = newHl;
      writeList(next);
    }
    setQ("");
  };

  const remove = (i: number) => writeList(highlights.filter((_, idx) => idx !== i));

  const updateStyle = (
    i: number,
    k: keyof HighlightSpec["style"],
    v: number | string,
  ) => {
    const next = [...highlights];
    next[i] = { ...next[i], style: { ...next[i].style, [k]: v } };
    writeList(next);
  };

  const resetStyle = (i: number) => {
    const next = [...highlights];
    next[i] = { ...next[i], style: defaultHighlightStyle(palette) };
    writeList(next);
  };

  // Apply a curated look — overwrites style + animation, keeps geometry/label/flag.
  const applyPreset = (i: number, p: HighlightPreset) => {
    const next = [...highlights];
    next[i] = { ...next[i], style: { ...p.style }, animationStyle: p.animationStyle };
    writeList(next);
  };

  const updateField = <K extends keyof HighlightSpec>(
    i: number, key: K, value: HighlightSpec[K],
  ) => {
    const next = [...highlights];
    next[i] = { ...next[i], [key]: value };
    writeList(next);
  };

  const updateLabel = (
    i: number,
    patch: Partial<NonNullable<HighlightSpec["label"]>>,
  ) => {
    const next = [...highlights];
    const current = next[i].label ?? { text: next[i].name.toUpperCase() };
    next[i] = { ...next[i], label: { ...current, ...patch } };
    writeList(next);
  };

  const toggleLabel = (i: number, on: boolean) => {
    const next = [...highlights];
    if (on) {
      next[i] = {
        ...next[i],
        label: next[i].label ?? {
          text: next[i].name.toUpperCase(),
          fade: { in: 0.4, out: 1 },
        },
      };
    } else {
      const { label, ...rest } = next[i];
      next[i] = rest as HighlightSpec;
    }
    writeList(next);
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const resolvePick = useStudio((s) => s.resolvePick);
  const startPickingDeprecated = useStudio((s) => s.startPicking);

  // When the modal returns a view, decide how to create the highlight:
  //  - If user drew a SHAPE (circle or polygon), use it directly — no API call.
  //  - Else lon/lat only → Nominatim reverse-lookup for the containing polygon.
  const handlePicked = async (view: {
    lon: number; lat: number;
    shape?: { kind: "circle" | "polygon"; geojson: any; radiusKm?: number };
  }) => {
    setPickerOpen(false);
    if (view.shape) {
      const newHl: HighlightSpec = {
        name: view.shape.kind === "circle"
          ? `Circle ${view.shape.radiusKm}km · ${view.lat.toFixed(2)},${view.lon.toFixed(2)}`
          : `Drawn shape · ${view.lat.toFixed(2)},${view.lon.toFixed(2)}`,
        placeType: "custom",
        geojson: view.shape.geojson,
        style: defaultHighlightStyle(palette),
      };
      writeList([...highlights, newHl]);
      setOpenIdx(highlights.length); // expand the new one
      return;
    }
    // Fallback: lon/lat → Nominatim reverse lookup
    startPickingDeprecated({ kind: "highlight-coord" });
    await resolvePick(view.lon, view.lat);
  };

  return (
    <Section title={`Highlight areas${highlights.length > 0 ? ` (${highlights.length})` : ""}`}>
      {/* ── Search — adds a new highlight ────────────────────────── */}
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            highlights.length === 0
              ? 'Search a place to highlight ("Balingen", "Pacific", "Bavaria"…)'
              : "Search to add another highlight…"
          }
          className="w-full rounded-md bg-ink-900 border border-ink-700 pl-9 pr-9 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber/60 focus:ring-1 focus:ring-amber/40"
        />
        {loading && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-amber"
          />
        )}
      </div>

      {/* ── Pick-on-map button — opens full Google-Maps-style modal ── */}
      <button
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-md border bg-ink-900 text-white/60 border-ink-700 hover:text-amber hover:border-amber/40 px-3 py-1.5 text-xs uppercase tracking-wider transition"
      >
        <Crosshair size={12} />
        Pick on map (zoom + pan freely)
      </button>

      {loading && q.length >= 2 && <Skeleton rows={3} height={28} />}
      {!loading && results.length > 0 && (
        <div className="space-y-0.5">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => apply(r, "new")}
              className="group flex w-full items-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-left text-xs text-white/80 hover:bg-ink-700 hover:text-white"
            >
              <span className="text-amber/80">{ICONS[r.placeType] ?? ICONS.custom}</span>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                {r.placeType}
              </span>
              <Plus size={11} className="text-amber" />
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && !loading && results.length === 0 && (
        <div className="rounded-md bg-ink-900 px-3 py-2 text-xs text-white/40">
          No polygon found. Try a more specific name.
        </div>
      )}

      {/* ── Highlights list ────────────────────────────────────────── */}
      {highlights.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-700 p-3 text-[11px] text-white/40">
          No highlights yet. Search above to add the first one — camera will
          auto-frame on it. Add more to highlight multiple regions in the same scene.
        </div>
      ) : (
        <SortableList
          items={highlights}
          getId={(_, i) => `hl-${i}`}
          onReorder={(next) => {
            writeList(next);
            // Keep "open" pointed at whatever the user was editing
            // (re-find by reference — index may have changed)
            if (openIdx !== null) {
              const wasOpen = highlights[openIdx];
              const newIdx = next.indexOf(wasOpen);
              setOpenIdx(newIdx >= 0 ? newIdx : null);
            }
          }}
          renderItem={(h, i, handle) => {
            const open = openIdx === i;
            const enabled = h.enabled !== false;
            return (
              <div
                className={`rounded-md border mb-1.5 transition ${
                  open ? "border-amber/40 bg-amber/5"
                  : enabled ? "border-ink-700 bg-ink-900/60"
                  : "border-ink-700/50 bg-ink-900/30 opacity-50"
                }`}
              >
                {/* Header row — click to expand */}
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <DragHandle handle={handle} />
                  <button
                    onClick={() => {
                      const next = [...highlights];
                      next[i] = { ...h, enabled: !enabled };
                      writeList(next);
                    }}
                    className={enabled ? "text-amber" : "text-white/30 hover:text-white"}
                    title={enabled ? "Hide highlight" : "Show highlight"}
                  >
                    {enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="text-white/40 hover:text-amber"
                  >
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-amber">
                    {i + 1}
                  </span>
                  <span className="text-amber/80">{ICONS[h.placeType] ?? ICONS.custom}</span>
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="flex-1 text-left text-xs text-white truncate hover:text-amber"
                  >
                    {h.name}
                  </button>
                  <div
                    className="h-4 w-4 rounded-sm border border-black/30"
                    style={{ background: h.style.borderColor }}
                    title="Border color"
                  />
                  <button
                    onClick={() => remove(i)}
                    className="text-white/40 hover:text-red-400"
                    title="Remove highlight"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Expanded controls */}
                {open && (
                  <div className="border-t border-ink-700 p-3 space-y-3">
                    {/* ── One-click looks (history / geopolitics) ─────── */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
                        Quick look
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {HIGHLIGHT_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => applyPreset(i, p)}
                            title={p.description}
                            className="flex items-center gap-1.5 rounded border border-ink-700 bg-ink-900 px-1.5 py-1 text-[10px] text-white/70 hover:border-amber/50 hover:text-white transition"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm border"
                              style={{ background: p.style.fillColor, borderColor: p.style.borderColor }}
                            />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Per-highlight fade timing (overrides global) ── */}
                    <div className="rounded-md bg-ink-900/60 border border-ink-700 p-2 space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!h.fade}
                          onChange={(e) => {
                            const next = [...highlights];
                            if (e.target.checked) {
                              next[i] = { ...h, fade: { in: 0.3 + i * 0.15, out: 1 } };
                            } else {
                              const { fade, ...rest } = h;
                              next[i] = rest as HighlightSpec;
                            }
                            writeList(next);
                          }}
                          className="accent-amber"
                        />
                        Custom timing (otherwise uses global beats)
                      </label>
                      {h.fade && (
                        <div className="pl-5 space-y-2">
                          <FadeSlider
                            label="Fade in at"
                            value={h.fade.in}
                            onChange={(v) => updateField(i, "fade", { ...h.fade!, in: v })}
                          />
                          <FadeSlider
                            label="Fade out at"
                            value={h.fade.out}
                            onChange={(v) => updateField(i, "fade", { ...h.fade!, out: v })}
                          />
                        </div>
                      )}
                    </div>

                    {/* ── Animation style ─────────────────────────── */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
                        Animation
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {([
                          { id: "fade",         label: "Fade",      hint: "Border + fill fade in together" },
                          { id: "sweep",        label: "Sweep",     hint: "Border draws around polygon, then fill" },
                          { id: "border-first", label: "Border 1st",hint: "Border first, fill delayed" },
                          { id: "pulse-in",     label: "Pulse",     hint: "Border grows + opacity ramps" },
                          { id: "static",       label: "Static",    hint: "Always fully visible" },
                        ] as const).map((opt) => {
                          const active = (h.animationStyle ?? "fade") === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => updateField(i, "animationStyle", opt.id)}
                              title={opt.hint}
                              className={`rounded px-1.5 py-1 text-[10px] border transition ${
                                active
                                  ? "bg-amber/20 border-amber text-white"
                                  : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Label on polygon ────────────────────────── */}
                    <div className="rounded-md bg-ink-900/60 border border-ink-700 p-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!h.label}
                          onChange={(e) => toggleLabel(i, e.target.checked)}
                          className="accent-amber"
                        />
                        Show label on this highlight
                      </label>
                      {h.label && (
                        <div className="space-y-1.5 pl-5">
                          <Field label="Text">
                            <input
                              value={h.label.text}
                              onChange={(e) => updateLabel(i, { text: e.target.value })}
                              className="w-full rounded bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
                              placeholder="GERMANY"
                            />
                          </Field>
                          <Field label="Sub-line" hint="Optional secondary text">
                            <input
                              value={h.label.sub ?? ""}
                              onChange={(e) => updateLabel(i, { sub: e.target.value })}
                              className="w-full rounded bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
                              placeholder="EUROPE · MEMBER OF EU"
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Anchor">
                              <select
                                value={typeof h.label.anchor === "string" ? h.label.anchor : "centroid"}
                                onChange={(e) =>
                                  updateLabel(i, { anchor: e.target.value as "centroid" | "top" | "bottom" })
                                }
                                className="w-full rounded bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
                              >
                                <option value="centroid">Centroid (auto)</option>
                                <option value="top">Top of polygon</option>
                                <option value="bottom">Bottom of polygon</option>
                              </select>
                            </Field>
                            <Field label="Text color">
                              <ColorInput
                                value={h.label.style?.color ?? "#ffffff"}
                                onChange={(v) =>
                                  updateLabel(i, { style: { ...(h.label?.style ?? {}), color: v } })
                                }
                                ariaLabel="Label text color"
                              />
                            </Field>
                            <Field label="Font size (px)">
                              <NumberInput
                                value={h.label.style?.size ?? 50}
                                min={20} max={300} step={2}
                                onChange={(v) =>
                                  updateLabel(i, { style: { ...(h.label?.style ?? {}), size: v } })
                                }
                              />
                            </Field>
                            <Field label="Letter spacing">
                              <NumberInput
                                value={h.label.style?.spacing ?? 14}
                                min={0} max={50} step={1}
                                onChange={(v) =>
                                  updateLabel(i, { style: { ...(h.label?.style ?? {}), spacing: v } })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Country flag badge ──────────────────────── */}
                    <div className="rounded-md bg-ink-900/60 border border-ink-700 p-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!h.flag?.show}
                          onChange={(e) =>
                            updateField(i, "flag", e.target.checked
                              ? { show: true, iso: (h.flag?.iso || h.countryISO || "").toUpperCase(), anchor: h.flag?.anchor ?? "centroid", size: h.flag?.size ?? 220, showCode: h.flag?.showCode ?? true }
                              : { ...(h.flag ?? { iso: "" }), show: false })
                          }
                          className="accent-amber"
                        />
                        Show country flag badge
                        {!h.countryISO && !h.flag?.iso && (
                          <span className="text-[10px] text-white/30">(enter a country code)</span>
                        )}
                      </label>
                      {h.flag?.show && (
                        <div className="space-y-1.5 pl-5">
                          <div className="flex items-center gap-2">
                            {/* Live flag preview */}
                            {(h.flag.iso || h.countryISO) && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`https://flagcdn.com/w80/${(h.flag.iso || h.countryISO || "").toLowerCase()}.png`}
                                alt="flag"
                                className="h-6 w-9 shrink-0 rounded border border-ink-700 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                              />
                            )}
                            <Field label="Country code (ISO-2)" hint="e.g. FR, US, DE">
                              <input
                                value={h.flag.iso}
                                maxLength={2}
                                onChange={(e) =>
                                  updateField(i, "flag", { ...h.flag!, iso: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
                                }
                                placeholder={h.countryISO ?? "FR"}
                                className="w-full rounded bg-ink-900 border border-ink-700 px-2 py-1 text-xs uppercase text-white"
                              />
                            </Field>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Anchor">
                              <select
                                value={h.flag.anchor ?? "centroid"}
                                onChange={(e) =>
                                  updateField(i, "flag", { ...h.flag!, anchor: e.target.value as "centroid" | "top" | "bottom" })
                                }
                                className="w-full rounded bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
                              >
                                <option value="centroid">Centroid (auto)</option>
                                <option value="top">Top of polygon</option>
                                <option value="bottom">Bottom of polygon</option>
                              </select>
                            </Field>
                            <Field label="Size (px)">
                              <NumberInput
                                value={h.flag.size ?? 220}
                                min={80} max={600} step={10}
                                onChange={(v) => updateField(i, "flag", { ...h.flag!, size: v })}
                              />
                            </Field>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={h.flag.showCode !== false}
                              onChange={(e) => updateField(i, "flag", { ...h.flag!, showCode: e.target.checked })}
                              className="accent-amber"
                            />
                            Show country code beside flag
                          </label>
                        </div>
                      )}
                    </div>

                    {/* ── Style controls ─────────────────────────── */}
                    <div className="grid grid-cols-2 gap-2">
                      <ColorWidthRow
                        label="Border"
                        color={h.style.borderColor}
                        width={h.style.borderWidth}
                        max={20}
                        onColor={(v) => updateStyle(i, "borderColor", v)}
                        onWidth={(v) => updateStyle(i, "borderWidth", v)}
                      />
                      <ColorWidthRow
                        label="Glow"
                        color={h.style.glowColor}
                        width={h.style.glowWidth}
                        max={60}
                        onColor={(v) => updateStyle(i, "glowColor", v)}
                        onWidth={(v) => updateStyle(i, "glowWidth", v)}
                      />
                      <Field label="Glow blur" hint="0 = sharp">
                        <NumberInput
                          value={h.style.glowBlur}
                          min={0} max={40} step={1}
                          onChange={(v) => updateStyle(i, "glowBlur", v)}
                        />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Fill texture" hint="Hatch / stripes / dots — the 'contested territory' look">
                          <div className="grid grid-cols-5 gap-1">
                            {FILL_TYPE_OPTIONS.map((opt) => {
                              const active = (h.style.fillType ?? "solid") === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => updateStyle(i, "fillType", opt.id)}
                                  className={`rounded px-1 py-1 text-[10px] border transition ${
                                    active
                                      ? "bg-amber/20 border-amber text-white"
                                      : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>
                      </div>
                      <Field label="Fill opacity" hint="0–1">
                        <NumberInput
                          value={h.style.fillOpacity}
                          min={0} max={1} step={0.02}
                          onChange={(v) => updateStyle(i, "fillOpacity", v)}
                        />
                      </Field>
                      <Field label="Fill color">
                        <ColorInput
                          value={h.style.fillColor}
                          onChange={(v) => updateStyle(i, "fillColor", v)}
                          ariaLabel="Fill color"
                        />
                      </Field>
                      <div className="flex items-end">
                        <button
                          onClick={() => resetStyle(i)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-ink-900 border border-ink-700 px-2 py-1.5 text-[11px] uppercase tracking-wider text-white/60 hover:text-amber hover:border-amber/40"
                        >
                          <Sparkles size={11} />
                          Reset to palette
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <MapPicker
        open={pickerOpen}
        title="Pick / draw an area to highlight"
        initialLon={scene.end.lon}
        initialLat={scene.end.lat}
        initialZoom={scene.end.zoom}
        mapStyleUrl={scene.mapStyleUrl}
        defaultMode="circle"
        allowShapes={true}
        onPick={handlePicked}
        onClose={() => setPickerOpen(false)}
      />
    </Section>
  );
};

/** Compact fade-timing slider (0–100%). */
const FadeSlider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
        <div className="text-[10px] font-mono text-amber">{pct}%</div>
      </div>
      <input
        type="range" min={0} max={100} step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-amber"
      />
    </div>
  );
};

/** Single-source color + width — uses shared ColorInput (no dual widget). */
const ColorWidthRow: React.FC<{
  label: string;
  color: string;
  width: number;
  max: number;
  onColor: (v: string) => void;
  onWidth: (v: number) => void;
}> = ({ label, color, width, max, onColor, onWidth }) => (
  <Field label={label}>
    <div className="flex items-center gap-1.5">
      <ColorInput value={color} onChange={onColor} ariaLabel={`${label} color`} />
      <input
        type="number"
        value={width}
        min={0} max={max} step={0.5}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onWidth(v); }}
        className="w-14 shrink-0 rounded-md bg-ink-900 border border-ink-700 px-2 py-1 text-xs text-white"
        title="Width (px)"
      />
    </div>
  </Field>
);
