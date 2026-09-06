"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useEditor } from "../store/editor";
import { confirmDialog } from "./dialogs";
import { ADDABLE_LAYERS } from "../layers/registry";

/**
 * ⌘K command palette — a fast, keyboard-first way to drive the editor without
 * hunting through panels: add any layer, set the camera move, change aspect,
 * toggle terrain/buildings, undo/redo, save. All commands are store-driven, so
 * the palette is purely additive (no new state model).
 */
const MOVES: [string, string, number][] = [
  ["fly-in", "Fly in", 45], ["zoom-out", "Pull back", 30], ["orbit", "Orbit", 55],
  ["push-in", "Push in", 60], ["pan", "Pan", 25], ["hold", "Hold", 0],
];

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const addLayer = useEditor((s) => s.addLayer);
  const patchComposition = useEditor((s) => s.patchComposition);
  const patchLayer = useEditor((s) => s.patchLayer);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const reset = useEditor((s) => s.reset);
  const select = useEditor((s) => s.select);
  const comp = useEditor((s) => s.project.composition);
  const project = useEditor((s) => s.project);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const cam = comp.layers.find((l) => l.type === "camera") as any;
  const bm = comp.basemap as any;

  const cmds = useMemo(() => {
    const run = (fn: () => void) => () => { fn(); setOpen(false); };
    const list: { label: string; group: string; act: () => void }[] = [];
    ADDABLE_LAYERS.forEach((m) => list.push({ label: `Add ${m.label}`, group: "Add", act: run(() => addLayer(m.type)) }));
    if (cam) MOVES.forEach(([v, label, pitch]) => list.push({
      label: `Camera: ${label}`, group: "Camera", act: run(() => {
        const delta = Math.max(1.5, Math.abs(cam.end.zoom - cam.start.zoom));
        const sz = v === "zoom-out" ? cam.end.zoom + delta : Math.max(1.4, cam.end.zoom - delta);
        patchLayer(cam.id, { style: v, end: { ...cam.end, pitch }, start: { ...cam.start, zoom: v === "hold" ? cam.end.zoom : sz, pitch: 0, bearing: 0 }, ...(v === "hold" ? { moveFraction: 0.2 } : {}) });
      }),
    }));
    (["16:9", "9:16", "1:1"] as const).forEach((a) => list.push({ label: `Aspect: ${a}`, group: "Format", act: run(() => patchComposition({ aspect: a })) }));
    list.push({ label: `${bm.terrain ? "Disable" : "Enable"} 3D terrain`, group: "Map", act: run(() => patchComposition({ basemap: { ...bm, terrain: !bm.terrain } })) });
    list.push({ label: `${bm.buildings3d ? "Disable" : "Enable"} 3D buildings`, group: "Map", act: run(() => patchComposition({ basemap: { ...bm, buildings3d: !bm.buildings3d } })) });
    list.push({ label: "Undo", group: "Edit", act: run(undo) });
    list.push({ label: "Redo", group: "Edit", act: run(redo) });
    list.push({ label: "Deselect", group: "Edit", act: run(() => select(null)) });
    // Route through the one robust save path (checks res.ok, toasts on failure)
    // instead of a silent fire-and-forget fetch that could drop the save unseen.
    list.push({ label: "Save project", group: "Project", act: run(() => { window.dispatchEvent(new CustomEvent("mapanisy:save")); }) });
    list.push({ label: "New project", group: "Project", act: run(async () => { if (await confirmDialog({ title: "Start a fresh project?", message: "Unsaved changes will be lost.", confirmLabel: "New project", danger: true })) reset(); }) });
    return list;
  }, [cam, bm, comp, project, addLayer, patchComposition, patchLayer, undo, redo, reset, select]);

  const filtered = q.trim() ? cmds.filter((c) => (c.label + " " + c.group).toLowerCase().includes(q.toLowerCase())) : cmds;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-floaty" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={15} className="text-graphite/40" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) filtered[0].act(); }}
            placeholder="Type a command — add a layer, change the camera, set aspect…"
            className="flex-1 bg-transparent text-sm text-graphite placeholder:text-graphite/35 focus:outline-none"
          />
          <kbd className="rounded bg-paper-100 px-1.5 py-0.5 text-[10px] text-graphite/40">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-graphite/40">No commands match “{q}”.</div>
          ) : filtered.map((c, i) => (
            <button key={i} onClick={c.act} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-iris/[0.08]">
              <span className="text-[13px] text-graphite">{c.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-graphite/30">{c.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
