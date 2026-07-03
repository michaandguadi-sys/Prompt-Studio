"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Clapperboard, Loader2, Check, Download, AlertTriangle, ChevronDown,
  Youtube, Smartphone, Square, Zap,
} from "lucide-react";
import { useEditor } from "../store/editor";
import type { Aspect } from "../doc/schema";

/**
 * Render — one click, zero setup, platform-perfect.
 *
 * The main button renders the current aspect in full 4K-class quality. The
 * chevron opens PLATFORM PRESETS — YouTube, Shorts/Reels/TikTok, Square feed,
 * and a fast Draft — each setting the right aspect + resolution + bitrate so
 * creators never have to remember export specs. Picking a preset with a
 * different aspect reformats the composition first (undoable with ⌘Z).
 *
 * POSTs to /api/v2/render (agent if connected, else cloud) and polls the
 * unified status endpoint with live progress; finished cloud renders download
 * automatically.
 */

type RenderSettings = { scale: number; videoBitrate: string; x264Preset: string };

type Preset = {
  id: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  /** null = keep the project's current aspect */
  aspect: Aspect | null;
  settings: RenderSettings;
};

const PRESETS: Preset[] = [
  {
    id: "youtube",
    label: "YouTube",
    detail: "16:9 · 4K · max quality",
    icon: <Youtube size={13} className="text-[#FF0033]" />,
    aspect: "16:9",
    settings: { scale: 1, videoBitrate: "40M", x264Preset: "slow" },
  },
  {
    id: "shorts",
    label: "Shorts · Reels · TikTok",
    detail: "9:16 · 1080×1920",
    icon: <Smartphone size={13} className="text-iris" />,
    aspect: "9:16",
    settings: { scale: 0.5, videoBitrate: "16M", x264Preset: "medium" },
  },
  {
    id: "square",
    label: "Square feed",
    detail: "1:1 · 1080×1080",
    icon: <Square size={13} className="text-graphite/60" />,
    aspect: "1:1",
    settings: { scale: 0.5, videoBitrate: "14M", x264Preset: "medium" },
  },
  {
    id: "draft",
    label: "Draft preview",
    detail: "current aspect · fast, half-res",
    icon: <Zap size={13} className="text-amber-500" />,
    aspect: null,
    settings: { scale: 0.5, videoBitrate: "8M", x264Preset: "veryfast" },
  },
];

export const RenderButton: React.FC = () => {
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const patchComposition = useEditor((s) => s.patchComposition);
  const [state, setState] = useState<"idle" | "starting" | "rendering" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const multi = sceneCount > 1;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Close the preset menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const pollJob = (jobId: string, mode: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/v2/render/${jobId}`);
        if (!r.ok) return; // transient — keep polling
        const d = await r.json();
        setProgress(d.progress ?? 0);
        setMsg(d.message ?? null);
        if (d.status === "done") {
          stopPolling();
          setState("done");
          if (d.downloadUrl) {
            setDownloadUrl(d.downloadUrl);
            setMsg("Your video is ready — downloading…");
            // Kick off the download without navigating away.
            const a = document.createElement("a");
            a.href = d.downloadUrl;
            a.download = "";
            document.body.appendChild(a);
            a.click();
            a.remove();
          } else {
            setMsg(mode === "agent" ? "Saved on your machine ✓" : "Render complete ✓");
          }
          setTimeout(() => { setState("idle"); setMsg(null); setProgress(0); }, 12000);
        } else if (d.status === "failed" || d.status === "cancelled") {
          stopPolling();
          setState("error");
          setMsg(d.error || d.message || "Render failed.");
        }
      } catch { /* network blip — keep polling */ }
    }, 1500);
  };

  const render = async (settings: RenderSettings, presetLabel?: string, aspect?: Aspect | null) => {
    if (state === "starting" || state === "rendering") return;
    setMenuOpen(false);
    setState("starting"); setMsg(null); setProgress(0); setDownloadUrl(null);

    // Platform preset with a different aspect → reformat the composition first
    // (goes through the store so it's undoable and the preview updates too).
    const cur = useEditor.getState().project;
    if (aspect && cur.composition.aspect !== aspect) {
      patchComposition({ aspect });
    }
    const project = useEditor.getState().project; // freshest doc after any reformat

    try {
      const r = await fetch("/api/v2/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Multi-scene → render the WHOLE story (every scene back-to-back).
        body: JSON.stringify({ project, story: multi, settings }),
      });
      const d = await r.json();
      if (r.status === 402) { setMsg(d.message ?? "Upgrade to render."); setState("error"); return; }
      if (!r.ok) { setMsg(d.error ?? "Render failed."); setState("error"); return; }
      setState("rendering");
      // Pre-render QA gate results: auto-fixes are silent wins; warnings deserve a note.
      const qa = Array.isArray(d.warnings) && d.warnings.length
        ? ` ⚠ ${d.warnings.length} warning${d.warnings.length > 1 ? "s" : ""}: ${d.warnings[0].message}`
        : Array.isArray(d.fixes) && d.fixes.length
          ? ` ✓ ${d.fixes.length} issue${d.fixes.length > 1 ? "s" : ""} auto-fixed.`
          : "";
      const what = presetLabel ? `${presetLabel} render` : multi ? `${sceneCount}-scene story` : "render";
      setMsg((d.mode === "agent" ? `Rendering ${what} on your machine…` : `Rendering ${what} in the cloud…`) + qa);
      pollJob(d.jobId, d.mode);
    } catch { setMsg("Network error."); setState("error"); }
  };

  const busy = state === "starting" || state === "rendering";
  const pct = Math.round(progress * 100);

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-stretch">
        <button
          onClick={() => render({ scale: 1, videoBitrate: "40M", x264Preset: "slow" })}
          disabled={busy}
          title={multi ? "Render the whole story (all scenes) in 4K" : "Render full 4K video"}
          className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-l-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform disabled:cursor-default disabled:hover:translate-y-0"
        >
          {/* live progress fill behind the label */}
          {busy && (
            <span
              className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-500"
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          )}
          <span className="relative inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={13} className="animate-spin" />
              : state === "done" ? <Check size={13} className="text-emerald-300" />
              : state === "error" ? <AlertTriangle size={13} className="text-amber-300" />
              : <Clapperboard size={13} />}
            {busy ? (state === "rendering" ? `Rendering ${pct}%` : "Starting…")
              : multi ? `Render story · ${sceneCount}` : "Render 4K"}
          </span>
        </button>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          title="Platform presets — YouTube, Shorts, Reels, TikTok…"
          className="inline-flex items-center rounded-r-lg border-l border-white/25 bg-brand px-1.5 text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform disabled:cursor-default disabled:hover:translate-y-0"
        >
          <ChevronDown size={13} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Platform preset menu */}
      {menuOpen && (
        <div className="absolute right-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_20px_50px_-16px_rgba(20,28,55,0.35)]">
          <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-graphite/40">Render for platform</div>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => render(p.settings, p.label, p.aspect)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-iris/[0.06]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-graphite/[0.05]">{p.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-graphite">{p.label}</span>
                <span className="block text-[10px] text-graphite/50">{p.detail}</span>
              </span>
            </button>
          ))}
          <div className="mx-3 mt-1 border-t border-line pt-1.5 pb-1 text-[9.5px] leading-snug text-graphite/40">
            Presets switch the canvas aspect too (undo with ⌘Z).
          </div>
        </div>
      )}

      {msg && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded-lg glass-light px-3 py-2 text-[11px] text-graphite/70 z-30">
          {msg}
          {state === "done" && downloadUrl && (
            <a href={downloadUrl} className="mt-1 flex items-center gap-1 font-semibold text-brand hover:underline">
              <Download size={11} /> Download again
            </a>
          )}
        </div>
      )}
    </div>
  );
};
