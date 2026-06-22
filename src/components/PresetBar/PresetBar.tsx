"use client";

import React, { useEffect, useState } from "react";
import { useStudio } from "@/store/studio";
import { Save, ChevronDown, Trash2 } from "lucide-react";

type Preset = { id: string; data: unknown };
type Kind = "style" | "scene";

export const PresetBar: React.FC<{ kind?: Kind }> = ({ kind: initialKind = "scene" }) => {
  const spec       = useStudio((s) => s.spec);
  const setSpec    = useStudio((s) => s.setSpec);
  const patchStyle = useStudio((s) => s.patchStyle);

  // Which kind we're saving/loading: a full "scene" (every adjustment) or just
  // the reusable "style"/look (palette + fonts + typography). Toggleable so the
  // one bar covers both without remounting per call-site.
  const [kind, setKind]       = useState<Kind>(initialKind);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [saving, setSaving]   = useState(false);

  const refresh = async () => {
    const res = await fetch(`/api/presets?kind=${kind}`);
    const data = await res.json();
    setPresets(data.presets ?? []);
  };

  useEffect(() => { refresh(); }, [kind]);

  const save = async () => {
    const useName = name.trim() || (kind === "style" ? spec.style.name : spec.name);
    setSaving(true);
    const res = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name: useName,
        data: kind === "style" ? spec.style : spec,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(`Save failed: ${d.error ?? res.statusText}`);
      return;
    }
    setName("");
    await refresh();
  };

  const load = (p: Preset) => {
    if (kind === "style") patchStyle(p.data as Parameters<typeof patchStyle>[0]);
    else setSpec(p.data as Parameters<typeof setSpec>[0]);
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete preset "${id}"?`)) return;
    await fetch(`/api/presets?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="border-b border-ink-700/60 bg-ink-800/20 px-4 py-2.5">
      {/* Scene / Look toggle — choose what a saved preset captures */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex items-center rounded-md border border-ink-700/60 bg-ink-900 p-0.5">
          {(["scene", "style"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setOpen(false); }}
              className={[
                "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-all",
                kind === k ? "bg-amber/15 text-amber" : "text-white/40 hover:text-white/70",
              ].join(" ")}
              title={k === "scene" ? "Save every adjustment in this scene" : "Save just the look (palette + fonts) to reuse on any scene"}
            >
              {k === "scene" ? "Scene" : "Look"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-white/30">
          {kind === "scene" ? "Saves all adjustments" : "Saves palette + fonts only"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Name input */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={kind === "scene" ? "Name this scene preset…" : "Name this look…"}
          className="flex-1 min-w-0 rounded-md bg-ink-900 border border-ink-700/60 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-amber/50 focus:ring-1 focus:ring-amber/15 transition-colors"
        />

        {/* Save */}
        <button
          onClick={save}
          disabled={saving}
          title="Save preset"
          className="flex items-center gap-1.5 rounded-md bg-amber/10 border border-amber/25 px-2.5 py-1.5 text-[11px] font-medium text-amber hover:bg-amber/20 hover:border-amber/40 transition-all disabled:opacity-40"
        >
          <Save size={11} />
          {saving ? "…" : "Save"}
        </button>

        {/* Presets dropdown */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-md bg-ink-800 border border-ink-700/60 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white hover:bg-ink-700 transition-all"
        >
          <span className="tabular-nums">{presets.length}</span>
          <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown list */}
      {open && (
        <div className="mt-2 rounded-lg border border-ink-700/60 bg-ink-900 overflow-hidden shadow-elevated">
          {presets.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-white/30">
              No saved {kind}s yet
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-ink-700/40">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-ink-800/60 transition-colors group">
                  <button
                    onClick={() => load(p)}
                    className="flex-1 text-left text-xs text-white/70 hover:text-amber transition-colors truncate"
                    title={p.id}
                  >
                    {p.id}
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
