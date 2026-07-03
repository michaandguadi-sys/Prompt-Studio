"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Undo2, Redo2, RotateCcw, Wand2, KeyRound, Boxes, Camera,
  Layers as LayersIcon, SlidersHorizontal, PanelBottomClose, PanelBottom,
  PanelLeftClose, PanelRightClose,
} from "lucide-react";
import { useEditor } from "../store/editor";
import { LayersPanel } from "./LayersPanel";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { AiBar } from "./AiBar";
import { ExportButton } from "./ExportButton";
import { RenderButton } from "./RenderButton";
import { RenderQueue } from "./RenderQueue";
import { ProjectMenu } from "./ProjectMenu";
import { Timeline } from "./Timeline";
import { SceneStrip } from "./SceneStrip";
import { RestyleModal } from "./RestyleModal";
import { Map3DStyleModal } from "./Map3DStyleModal";
import { SettingsModal } from "./SettingsModal";
import { StillStudio } from "./StillStudio";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "./ErrorBoundary";

/** Persisted panel size, read synchronously so there's no resize flash. */
const px = (k: string, d: number) => {
  if (typeof window === "undefined") return d;
  const v = parseInt(localStorage.getItem(k) || "", 10);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Mapanisy editor — NEUTRAL PRO GREY, resizable floating panels.
 *
 * A real power-editor that breathes: a unified top toolbar, then Layers (left),
 * the framed map canvas + AI bar (center) and the FULL Inspector (right) as
 * rounded cards floating on the workspace, with the Timeline + storyboard
 * docked below. Every gutter is a drag handle — pull the timeline shorter, the
 * rails wider/narrower; sizes persist. Motion is soft and springy (Apple /
 * Fluent), never stiff. Theme scoped via `.editor-pro` so marketing stays light.
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
  const [stillOpen, setStillOpen] = useState(false);

  // Blogger flow: generated from home in "Still image" mode → the Still Studio
  // opens itself so the first thing they do is pick + export their image.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("mapanisy-open-still") === "1") {
        sessionStorage.removeItem("mapanisy-open-still");
        setStillOpen(true);
      }
    } catch { /* SSR / private mode */ }
  }, []);
  const [layersOpen, setLayersOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);

  // Resizable, persisted panel sizes.
  const [leftW, setLeftW] = useState(() => px("mapanisy-ed-leftW", 248));
  const [rightW, setRightW] = useState(() => px("mapanisy-ed-rightW", 360));
  const [dockH, setDockH] = useState(() => px("mapanisy-ed-dockH", 196));
  useEffect(() => { localStorage.setItem("mapanisy-ed-leftW", String(leftW)); }, [leftW]);
  useEffect(() => { localStorage.setItem("mapanisy-ed-rightW", String(rightW)); }, [rightW]);
  useEffect(() => { localStorage.setItem("mapanisy-ed-dockH", String(dockH)); }, [dockH]);

  // Generic splitter drag — captures the pointer, updates a size as you move.
  const startResize = useCallback(
    (axis: "x" | "y", dir: 1 | -1, get: () => number, set: (n: number) => void, lo: number, hi: number) =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        const start = axis === "x" ? e.clientX : e.clientY;
        const base = get();
        const move = (ev: PointerEvent) => {
          const cur = axis === "x" ? ev.clientX : ev.clientY;
          set(clamp(base + (cur - start) * dir, lo, hi));
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      },
    [],
  );

  // Bring the Inspector back if you collapse it then select something.
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

  const iconBtn = "rounded-lg p-1.5 text-graphite-muted transition-all duration-200 hover:bg-graphite/[0.06] hover:text-graphite active:scale-90 disabled:opacity-25 disabled:hover:bg-transparent";
  const toggle = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-all duration-200 active:scale-95 ${on ? "bg-iris/15 text-iris" : "text-graphite-muted hover:bg-graphite/[0.06] hover:text-graphite"}`;
  const accentBtn = "inline-flex items-center gap-1.5 rounded-lg border border-iris/30 bg-iris/[0.08] px-2.5 py-1.5 text-[12px] font-semibold text-iris transition-all duration-200 hover:bg-iris/15 hover:-translate-y-px active:scale-95";
  const panel = "flex flex-col overflow-hidden rounded-2xl border border-line/60 bg-paper shadow-[0_12px_36px_-18px_rgba(0,0,0,0.6)]";

  return (
    <div className="editor-pro relative flex h-full flex-col overflow-hidden bg-paper-50 text-graphite">

      {/* ── Unified top toolbar ──────────────────────────────────────────── */}
      <header className="z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line/70 bg-paper/70 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white transition-transform duration-300 hover:rotate-6" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 4px 14px -4px rgba(110,123,255,0.7)" }}>
              <span className="text-[12px] font-black leading-none">M</span>
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-graphite">Mapanisy</span>
          </div>
          <span className="h-4 w-px bg-line" />
          <input
            value={name}
            onChange={(e) => rename(e.target.value)}
            placeholder="Untitled animation"
            className="w-44 truncate rounded-lg bg-transparent px-2 py-1 text-[13px] text-graphite/90 placeholder:text-graphite-muted/50 transition-colors hover:bg-graphite/[0.05] focus:bg-graphite/[0.06] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-0.5 md:flex">
            <button onClick={() => setLayersOpen((v) => !v)} title="Toggle Layers panel" className={toggle(layersOpen)}><LayersIcon size={14} /> Layers</button>
            <button onClick={() => setInspectorOpen((v) => !v)} title="Toggle Adjust panel" className={toggle(inspectorOpen)}><SlidersHorizontal size={14} /> Adjust</button>
            <button onClick={() => setDockOpen((v) => !v)} title="Toggle Timeline" className={toggle(dockOpen)}>{dockOpen ? <PanelBottomClose size={14} /> : <PanelBottom size={14} />} Timeline</button>
          </div>
          <span className="mx-1 h-5 w-px bg-line" />
          <button onClick={undo} disabled={!past} title="Undo (⌘Z)" className={iconBtn}><Undo2 size={15} /></button>
          <button onClick={redo} disabled={!future} title="Redo (⌘⇧Z)" className={iconBtn}><Redo2 size={15} /></button>
          <button onClick={() => { if (confirm("Start a fresh project? Unsaved changes will be lost.")) reset(); }} title="New project" className={iconBtn}><RotateCcw size={14} /></button>
          <span className="mx-1 h-5 w-px bg-line" />
          <ProjectMenu />
          <button onClick={() => setStyle3dOpen(true)} title="Creative 3D map styles" className={accentBtn}><Boxes size={13} /> 3D</button>
          <button onClick={() => setRestyleOpen(true)} title="Restyle your render with AI" className={accentBtn}><Wand2 size={13} /> Restyle</button>
          <button onClick={() => setStillOpen(true)} title="Extract this frame as an image — annotate & export PNG/JPG/WebP/SVG/PDF" className={accentBtn}><Camera size={13} /> Still</button>
          <span className="mx-1 h-5 w-px bg-line" />
          <RenderButton />
          <RenderQueue />
          <ExportButton />
          <button onClick={() => setSettingsOpen(true)} title="API keys & AI providers" className={iconBtn}><KeyRound size={15} /></button>
        </div>
      </header>

      {/* ── Workspace: floating, resizable cards on the grey canvas ───────── */}
      <div className="editor-in flex min-h-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1">

          {/* Left rail — Layers */}
          {layersOpen && (
            <>
              <aside className={panel} style={{ width: leftW }}>
                <RailHeader title="Layers" icon={<LayersIcon size={12} />} onCollapse={() => setLayersOpen(false)} collapseIcon={<PanelLeftClose size={13} />} />
                <div className="min-h-0 flex-1 overflow-y-auto"><LayersPanel /></div>
              </aside>
              <ResizeHandle axis="x" onDown={startResize("x", 1, () => leftW, setLeftW, 200, 440)} />
            </>
          )}

          {/* Center — AI bar + canvas */}
          <main className="flex min-w-0 flex-1 flex-col gap-2">
            <AiBar />
            <div className={`relative min-h-0 flex-1 ${panel}`}>
              <ErrorBoundary label="preview" resetKey={updatedAt}><Canvas /></ErrorBoundary>
            </div>
          </main>

          {/* Right rail — Inspector / Adjust */}
          {inspectorOpen && (
            <>
              <ResizeHandle axis="x" onDown={startResize("x", -1, () => rightW, setRightW, 290, 560)} />
              <aside className={panel} style={{ width: rightW }}>
                <RailHeader title="Adjust" icon={<SlidersHorizontal size={12} />} onCollapse={() => setInspectorOpen(false)} collapseIcon={<PanelRightClose size={13} />} />
                <div className="min-h-0 flex-1 overflow-y-auto"><Inspector /></div>
              </aside>
            </>
          )}
        </div>

        {/* Bottom dock — timeline + storyboard */}
        {dockOpen && (
          <>
            <ResizeHandle axis="y" onDown={startResize("y", -1, () => dockH, setDockH, 116, 460)} />
            <footer className={panel} style={{ height: dockH }}>
              <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite-muted/80"><PanelBottom size={11} /> Timeline</span>
                <button onClick={() => setDockOpen(false)} title="Hide timeline" className="rounded-md p-1 text-graphite-muted/60 transition-colors hover:bg-graphite/[0.06] hover:text-graphite"><PanelBottomClose size={13} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Timeline />
                <SceneStrip />
              </div>
            </footer>
          </>
        )}
      </div>

      <RestyleModal open={restyleOpen} onClose={() => setRestyleOpen(false)} onOpenSettings={() => { setRestyleOpen(false); setSettingsOpen(true); }} />
      <Map3DStyleModal open={style3dOpen} onClose={() => setStyle3dOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <StillStudio open={stillOpen} onClose={() => setStillOpen(false)} />
      <CommandPalette />
    </div>
  );
};

/** A gutter that doubles as a drag handle — invisible until hovered, then a soft iris pill. */
const ResizeHandle: React.FC<{ axis: "x" | "y"; onDown: (e: React.PointerEvent) => void }> = ({ axis, onDown }) => (
  <div
    onPointerDown={onDown}
    className={`group flex shrink-0 items-center justify-center ${axis === "x" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"}`}
  >
    <div className={`rounded-full bg-line/0 transition-all duration-200 group-hover:bg-iris/60 group-active:bg-iris ${axis === "x" ? "h-12 w-[3px] group-hover:h-16" : "h-[3px] w-12 group-hover:w-16"}`} />
  </div>
);

const RailHeader: React.FC<{ title: string; icon: React.ReactNode; onCollapse: () => void; collapseIcon: React.ReactNode }> = ({ title, icon, onCollapse, collapseIcon }) => (
  <div className="flex h-9 shrink-0 items-center justify-between border-b border-line/70 px-3">
    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite-muted/80">{icon} {title}</span>
    <button onClick={onCollapse} title={`Collapse ${title}`} className="rounded-md p-1 text-graphite-muted/60 transition-colors hover:bg-graphite/[0.06] hover:text-graphite">{collapseIcon}</button>
  </div>
);
