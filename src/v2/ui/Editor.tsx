"use client";

import React, { useEffect, useState } from "react";
import { Undo2, Redo2, RotateCcw, Wand2, KeyRound, Boxes, Layers as LayersIcon, SlidersHorizontal, PanelBottom, X } from "lucide-react";
import { useEditor } from "../store/editor";
import { LayersPanel } from "./LayersPanel";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { AiBar } from "./AiBar";
import { ExportButton } from "./ExportButton";
import { RenderButton } from "./RenderButton";
import { ProjectMenu } from "./ProjectMenu";
import { Timeline } from "./Timeline";
import { SceneStrip } from "./SceneStrip";
import { RestyleModal } from "./RestyleModal";
import { Map3DStyleModal } from "./Map3DStyleModal";
import { SettingsModal } from "./SettingsModal";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "./ErrorBoundary";

const SERIF = "Newsreader, 'Iowan Old Style', Georgia, serif";

/**
 * Mapanisy editor — BRIGHT EDITORIAL, immersive single canvas. The map fills the
 * whole surface; chrome floats as paper-glass cards. Controls are hybrid: an
 * in-canvas halo for the selected element (quick), summonable Layers / Adjust
 * panels for depth, and a floating bottom dock for the timeline + storyboard.
 */
export const Editor: React.FC = () => {
  const name = useEditor((s) => s.project.name);
  const rename = useEditor((s) => s.rename);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const reset = useEditor((s) => s.reset);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const updatedAt = useEditor((s) => s.project.updatedAt);
  const selectedId = useEditor((s) => s.selectedId);
  const layers = useEditor((s) => s.project.composition.layers);
  const removeLayer = useEditor((s) => s.removeLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const select = useEditor((s) => s.select);
  const [restyleOpen, setRestyleOpen] = useState(false);
  const [style3dOpen, setStyle3dOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);

  // Hybrid controls: selecting an element opens the Adjust panel (deep edits)
  // while the in-canvas halo handles the quick ones. Deselect leaves it as-is.
  useEffect(() => { if (selectedId) setInspectorOpen(true); }, [selectedId]);

  // Editor hotkeys: undo/redo · ⌘D duplicate · Delete remove · Esc deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = layers.find((l) => l.id === selectedId);
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "d" && sel && sel.type !== "camera") { e.preventDefault(); duplicateLayer(sel.id); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel && sel.type !== "camera") { e.preventDefault(); removeLayer(sel.id); }
      else if (e.key === "Escape") { select(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, layers, selectedId, removeLayer, duplicateLayer, select]);

  const card = "rounded-2xl border border-line/70 bg-white/85 shadow-floaty backdrop-blur-xl";
  const iconBtn = "rounded-lg p-1.5 text-graphite/55 transition-colors hover:bg-graphite/[0.05] hover:text-graphite disabled:opacity-25";
  const toggleBtn = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${on ? "bg-iris/10 text-iris" : "text-graphite/55 hover:bg-graphite/[0.05] hover:text-graphite"}`;

  return (
    <div className="relative h-full overflow-hidden bg-paper-100 text-graphite">
      {/* ── Full-bleed canvas ───────────────────────────────────────────── */}
      <div className="absolute inset-0">
        <ErrorBoundary label="preview" resetKey={updatedAt}><Canvas /></ErrorBoundary>
      </div>

      {/* ── Floating top bar — bright editorial ─────────────────────────── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
        {/* Brand + project name */}
        <div className={`pointer-events-auto flex items-center gap-2.5 px-3 py-2 ${card}`}>
          <span className="text-[15px] font-semibold leading-none text-graphite" style={{ fontFamily: SERIF, letterSpacing: "-0.01em" }}>Mapanisy</span>
          <span className="h-4 w-px bg-line" />
          <input
            value={name}
            onChange={(e) => rename(e.target.value)}
            className="w-48 bg-transparent text-sm text-graphite/90 placeholder:text-graphite/30 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className={`pointer-events-auto flex items-center gap-1 px-1.5 py-1.5 ${card}`}>
          <button onClick={() => setLayersOpen((v) => !v)} title="Layers" className={toggleBtn(layersOpen)}><LayersIcon size={14} /> Layers</button>
          <button onClick={() => setInspectorOpen((v) => !v)} title="Adjust the selection" className={toggleBtn(inspectorOpen)}><SlidersHorizontal size={14} /> Adjust</button>
          <button onClick={() => setDockOpen((v) => !v)} title="Timeline & storyboard" className={toggleBtn(dockOpen)}><PanelBottom size={14} /> Timeline</button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button onClick={undo} disabled={!past} title="Undo (⌘Z)" className={iconBtn}><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!future} title="Redo (⌘⇧Z)" className={iconBtn}><Redo2 size={14} /></button>
          <button onClick={() => { if (confirm("Start a fresh project? Unsaved changes will be lost.")) reset(); }} title="New project" className={iconBtn}><RotateCcw size={13} /></button>
          <span className="mx-1 h-5 w-px bg-line" />
          <ProjectMenu />
          <RenderButton />
          <ExportButton />
          <button onClick={() => setStyle3dOpen(true)} title="Creative 3D map styles" className="inline-flex items-center gap-1.5 rounded-lg border border-iris/25 bg-iris/[0.06] px-2.5 py-1.5 text-xs font-semibold text-iris transition-all hover:bg-iris/10"><Boxes size={13} /> 3D</button>
          <button onClick={() => setRestyleOpen(true)} title="Restyle your render with AI" className="inline-flex items-center gap-1.5 rounded-lg border border-iris/25 bg-iris/[0.06] px-2.5 py-1.5 text-xs font-semibold text-iris transition-all hover:bg-iris/10"><Wand2 size={13} /> Restyle</button>
          <button onClick={() => setSettingsOpen(true)} title="API keys & AI providers" className={iconBtn}><KeyRound size={15} /></button>
        </div>
      </header>

      {/* ── AI command bar — floating, top-center ───────────────────────── */}
      <div className="pointer-events-none absolute left-1/2 top-[60px] z-20 w-[min(620px,calc(100%-560px))] -translate-x-1/2">
        <div className="pointer-events-auto"><AiBar /></div>
      </div>

      {/* ── Summonable Layers (left) ────────────────────────────────────── */}
      {layersOpen && (
        <aside className={`absolute left-3 top-[68px] z-20 flex w-60 flex-col overflow-hidden ${card}`} style={{ bottom: dockOpen ? 168 : 16 }}>
          <PanelHeader title="Layers" onClose={() => setLayersOpen(false)} />
          <div className="min-h-0 flex-1 overflow-y-auto"><LayersPanel /></div>
        </aside>
      )}

      {/* ── Summonable Adjust / Inspector (right) ───────────────────────── */}
      {inspectorOpen && (
        <aside className={`absolute right-3 top-[68px] z-20 flex w-80 flex-col overflow-hidden ${card}`} style={{ bottom: dockOpen ? 168 : 16 }}>
          <PanelHeader title="Adjust" onClose={() => setInspectorOpen(false)} />
          <div className="min-h-0 flex-1 overflow-y-auto"><Inspector /></div>
        </aside>
      )}

      {/* ── Floating bottom dock — timeline + storyboard ────────────────── */}
      {dockOpen && (
        <footer className={`absolute inset-x-3 bottom-3 z-20 overflow-hidden ${card}`}>
          <Timeline />
          <SceneStrip />
        </footer>
      )}

      <RestyleModal open={restyleOpen} onClose={() => setRestyleOpen(false)} onOpenSettings={() => { setRestyleOpen(false); setSettingsOpen(true); }} />
      <Map3DStyleModal open={style3dOpen} onClose={() => setStyle3dOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette />
    </div>
  );
};

const PanelHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div className="flex items-center justify-between border-b border-line/70 px-3 py-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/45">{title}</span>
    <button onClick={onClose} className="rounded-md p-1 text-graphite/35 transition-colors hover:bg-graphite/[0.05] hover:text-graphite"><X size={13} /></button>
  </div>
);
