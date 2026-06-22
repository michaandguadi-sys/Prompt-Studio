"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useStudio } from "@/store/studio";
import { DEFAULT_MAP_SCENE } from "@/lib/defaults";
import { Button } from "@/components/ui/Button";
import {
  Download, RotateCcw, Maximize2, Minimize2, PanelLeftClose,
  PanelLeftOpen, PanelRightClose, PanelRightOpen, Keyboard, Map,
} from "lucide-react";
import { StyleEditor } from "@/components/StyleEditor/StyleEditor";
import { MapBuilder } from "@/components/MapBuilder/MapBuilder";
import { ExportDialog } from "@/components/ExportDialog/ExportDialog";
import { PresetBar } from "@/components/PresetBar/PresetBar";

const PreviewPanel = dynamic(
  () => import("@/components/PreviewPanel/PreviewPanel").then((m) => m.PreviewPanel),
  { ssr: false, loading: () => <PreviewLoading /> },
);
const CodePanel = dynamic(
  () => import("@/components/CodePanel/CodePanel").then((m) => m.CodePanel),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-graphite/45 text-sm">Loading…</div> },
);

export default function MapStudioPage() {
  const ensureSceneKind = useStudio((s) => s.ensureSceneKind);
  const resetActiveScene = useStudio((s) => s.resetActiveScene);
  const [exportOpen, setExportOpen] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    ensureSceneKind("map");
  }, [ensureSceneKind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "b" || e.key === "B")) { e.preventDefault(); setShowLeft((v) => !v); }
      else if (cmd && (e.key === "\\" || e.code === "Backslash")) { e.preventDefault(); setShowRight((v) => !v); }
      else if (!cmd && e.key === "[") { setShowLeft((v) => !v); }
      else if (!cmd && e.key === "]") { setShowRight((v) => !v); }
      else if (!cmd && (e.key === "f" || e.key === "F")) {
        setShowLeft((l) => { setShowRight((r) => (!l && !r ? true : false)); return !l && !showRight ? true : false; });
      } else if (e.key === "?") { setShortcutsOpen((v) => !v); }
      else if (cmd && (e.key === "e" || e.key === "E")) { e.preventDefault(); setExportOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showRight]);

  const fullscreen = !showLeft && !showRight;

  return (
    <div className="flex h-full relative">
      {/* ── Panel toggle strip (top-right) ────────────────────────────── */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1 rounded-lg bg-white/95 backdrop-blur-sm border border-line/60 px-1.5 py-1 shadow-elevated">
        <ToggleBtn active={showLeft} title="Toggle builder (⌘B)"
          icon={showLeft ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
          onClick={() => setShowLeft((v) => !v)} />
        <ToggleBtn active={fullscreen} title="Full-screen preview (F)"
          icon={fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          onClick={() => { if (fullscreen) { setShowLeft(true); setShowRight(true); } else { setShowLeft(false); setShowRight(false); } }} />
        <ToggleBtn active={showRight} title="Toggle code panel (⌘\\)"
          icon={showRight ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          onClick={() => setShowRight((v) => !v)} />
        <div className="w-px h-4 bg-line mx-0.5" />
        <ToggleBtn active={shortcutsOpen} title="Shortcuts (?)" icon={<Keyboard size={13} />}
          onClick={() => setShortcutsOpen((v) => !v)} />
      </div>

      {/* ── Left: Builder panel ───────────────────────────────────────── */}
      {showLeft && (
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-line/60 bg-white">
          {/* Panel header */}
          <header className="flex items-center justify-between border-b border-line/60 px-5 py-3.5 bg-white/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Map size={14} />
              </div>
              <div>
                <h1 className="text-xs font-semibold text-graphite leading-none">Map Animation</h1>
                <p className="text-[9px] text-graphite/45 mt-0.5 uppercase tracking-wider">Builder</p>
              </div>
            </div>
            <button
              onClick={() => resetActiveScene(DEFAULT_MAP_SCENE)}
              className="rounded-md p-1.5 text-graphite/45 hover:text-graphite/70 hover:bg-graphite/[0.06] transition-all"
              title="Reset to defaults"
            >
              <RotateCcw size={12} />
            </button>
          </header>

          <PresetBar kind="scene" />

          <div className="flex-1 overflow-y-auto">
            <MapBuilder />
            <StyleEditor />
          </div>

          {/* Export footer */}
          <footer className="border-t border-line/60 p-4 bg-white/80">
            <Button variant="primary" size="md" className="w-full" onClick={() => setExportOpen(true)}>
              <Download size={14} />
              Export &amp; Render
              <kbd className="ml-auto text-[9px] text-amber-dim/80 font-mono bg-graphite/[0.05] px-1.5 py-0.5 rounded border border-amber-dim/20">⌘E</kbd>
            </Button>
          </footer>
        </aside>
      )}

      {/* ── Center: Preview ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <PreviewPanel />
      </div>

      {/* ── Right: Code panel ────────────────────────────────────────── */}
      {showRight && (
        <aside className="w-[400px] shrink-0 border-l border-line/60 bg-white">
          <CodePanel />
        </aside>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      {/* ── Keyboard shortcuts overlay ─────────────────────────────── */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShortcutsOpen(false)}>
          <div className="rounded-xl border border-line bg-white p-6 max-w-xs w-full mx-4 shadow-elevated anim-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-5">
              <Keyboard size={14} className="text-amber" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-graphite">Shortcuts</h2>
            </div>
            <div className="space-y-2">
              {[
                ["⌘ B  /  [",     "Toggle builder panel"],
                ["⌘ \\  /  ]",    "Toggle code panel"],
                ["F",             "Full-screen preview"],
                ["⌘ E",          "Export dialog"],
                ["⌘ Z / ⌘ ⇧ Z", "Undo / redo"],
                ["?",             "This overlay"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <kbd className="rounded-md bg-graphite/[0.05] border border-line px-2.5 py-1 font-mono text-[10px] text-amber min-w-[100px] text-center">
                    {k}
                  </kbd>
                  <span className="text-xs text-graphite/55">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[9px] text-graphite/40 uppercase tracking-wider">Press ? to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper-100">
      <div className="h-8 w-8 rounded-full border-2 border-amber/20 border-t-amber animate-spin" />
      <p className="text-xs text-graphite/45">Loading preview…</p>
    </div>
  );
}

const ToggleBtn: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}> = ({ active, icon, title, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className={[
      "rounded-md p-1.5 transition-all duration-150",
      active
        ? "bg-amber/15 text-amber"
        : "text-graphite/50 hover:text-graphite hover:bg-graphite/[0.06]",
    ].join(" ")}
  >
    {icon}
  </button>
);
