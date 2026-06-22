"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Player, PlayerRef } from "@remotion/player";
import { useStudio } from "@/store/studio";
import { SceneRenderer } from "@/remotion/SceneRenderer";
import { Watermark } from "@/remotion/Watermark";
import { useTier } from "@/hooks/useTier";
import { pickRecordingFormat } from "@/lib/recording";
import { Video, X, Square } from "lucide-react";
import { ASPECTS, aspectOf } from "@/lib/aspect";
import type { AspectRatio, SceneSpec } from "@/lib/types";

/** Active scene + optional Free-tier watermark, dispatched by kind. */
const PreviewComp: React.FC<{ spec: SceneSpec; watermark?: boolean }> = ({ spec, watermark }) => (
  <>
    <SceneRenderer spec={spec} />
    {watermark && <Watermark />}
  </>
);

const KIND_LABELS: Record<string, string> = {
  map:        "Map Animation",
  dataviz:    "Data Viz",
  title:      "Title Card",
  lowerthird: "Lower Third",
  quote:      "Quote Card",
};

export const PreviewPanel: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setAspect = useStudio((s) => s.setAspect);
  const aspect = aspectOf(spec);
  // Free tier shows a "Mapanisy" watermark on preview + Quick Export.
  const { watermark } = useTier();
  const inputProps = useMemo(() => ({ spec, watermark }), [spec, watermark]);

  // One PlayerRef serves both the inline preview and the cinema overlay.
  // During cinema mode we render a SEPARATE Player instance so the main
  // preview keeps working; each instance mounts fresh from its own ref.
  const previewRef  = useRef<PlayerRef>(null);
  const cinemaRef   = useRef<PlayerRef>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [recording,  setRecording]  = useState(false);
  const [recPct,     setRecPct]     = useState(0);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [browserOk,  setBrowserOk]  = useState(true); // false if getDisplayMedia unavailable

  const stopRec = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const renderInBrowser = useCallback(async () => {
    if (recording) return;

    // Check API availability first
    if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") {
      setBrowserOk(false);
      return;
    }

    // Open the fullscreen cinema overlay — a black canvas covering the entire
    // viewport so the screen capture sees ONLY the composition.
    setCinemaMode(true);

    // Wait two frames for React to paint the cinema overlay
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Request fullscreen on the cinema element — hides browser chrome so the
    // captured area is purely the composition.
    const cinemaEl = document.getElementById("ps-cinema-overlay");
    try {
      if (cinemaEl && !document.fullscreenElement) {
        await cinemaEl.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      // Fullscreen may be blocked (embedded page) — continue without it.
    }

    // Seek cinema Player to frame 0 and wait for the map to settle
    cinemaRef.current?.seekTo(0);
    await new Promise<void>((r) => setTimeout(r, 400));

    // Request screen capture. `preferCurrentTab: true` is a Chrome 107+ hint
    // that auto-selects this tab with no picker — pure one-click UX.
    // Older browsers fall back to the system picker where the user picks "Tab".
    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          displaySurface: "browser",
          frameRate: { ideal: spec.fps, max: 60 },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
        // Chrome 107+ — silently captures this tab, no picker appears
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });
    } catch {
      // User cancelled or browser rejected
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setCinemaMode(false);
      return;
    }

    const { mimeType, ext } = pickRecordingFormat();

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 25_000_000, // 25 Mbps — visually lossless at 1080p
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

      const blob = new Blob(chunks, { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${spec.name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setRecording(false);
      setRecPct(0);
      setCinemaMode(false);
    };

    // Start
    setRecording(true);
    setRecPct(0);
    recorder.start(100);
    cinemaRef.current?.play();

    // Progress
    const totalMs = spec.durationSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => {
      setRecPct(Math.min(99, ((Date.now() - t0) / totalMs) * 100));
    }, 100);

    // Auto-stop when animation completes (+ 400 ms buffer for last frame)
    setTimeout(() => {
      clearInterval(tick);
      setRecPct(100);
      recorder.stop();
    }, totalMs + 400);
  }, [spec, recording]);

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* ── Cinema render overlay — portal to body so it covers everything ── */}
      {cinemaMode && typeof document !== "undefined" &&
        createPortal(
          <div
            id="ps-cinema-overlay"
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            style={{ cursor: recording ? "none" : "default" }}
          >
            {/* Composition at max size while keeping aspect ratio */}
            <div
              className="w-full h-full"
              style={{ aspectRatio: `${spec.width}/${spec.height}`, maxWidth: "100vw", maxHeight: "100vh" }}
            >
              <Player
                ref={cinemaRef}
                component={PreviewComp as any}
                inputProps={inputProps}
                durationInFrames={Math.max(1, Math.round(spec.durationSec * spec.fps))}
                compositionWidth={spec.width}
                compositionHeight={spec.height}
                fps={spec.fps}
                controls={false}
                loop={false}
                autoPlay={false}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>

            {/* "Select This Tab" hint — shown BEFORE recording starts */}
            {!recording && (
              <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-white/95 backdrop-blur-md border border-line/60 px-5 py-3 shadow-elevated anim-fade-up">
                <div className="text-sm text-graphite/70 leading-relaxed">
                  In the screen share picker, select{" "}
                  <span className="font-semibold text-graphite">This Tab</span> — recording
                  starts automatically.
                </div>
                <button
                  onClick={() => {
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                    setCinemaMode(false);
                  }}
                  className="shrink-0 rounded-md p-1 text-graphite/45 hover:text-graphite/70 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {/* REC pill — visible during recording */}
            {recording && (
              <div className="fixed top-5 right-5 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-sm border border-red-500/30 px-3 py-1.5 pointer-events-none">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-xs text-graphite tabular-nums">
                  {Math.round(recPct)}%
                </span>
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* ── Normal preview panel ─────────────────────────────────────────── */}
      <div className="flex h-full flex-col bg-paper-100">
        {/* Cinema chrome bar */}
        <div className="flex items-center justify-between border-b border-line/60 bg-paper-100/85 backdrop-blur-sm px-5 py-2.5">
          {/* Left: live indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber animate-breathe" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.35em] text-amber/70">
                Live Preview
              </span>
            </div>
            <div className="h-3 w-px bg-line" />
            <span className="text-[10px] text-graphite/50 tracking-wide">
              {KIND_LABELS[spec.kind] ?? spec.kind}
            </span>
          </div>

          {/* Right: format chips + Render button */}
          <div className="flex items-center gap-2">
            {/* Aspect-ratio selector */}
            <div className="flex items-center rounded-md border border-line/60 bg-graphite/[0.05]/60 p-0.5" title="Output aspect ratio">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a as AspectRatio)}
                  className={[
                    "rounded px-1.5 py-0.5 font-mono text-[10px] transition-all",
                    aspect === a
                      ? "bg-amber/15 text-amber"
                      : "text-graphite/50 hover:text-graphite/70",
                  ].join(" ")}
                >
                  {a}
                </button>
              ))}
            </div>
            <span className="rounded bg-graphite/[0.05]/80 border border-line/60 px-2 py-0.5 font-mono text-[10px] text-graphite/55">
              {spec.width}×{spec.height}
            </span>
            <span className="rounded bg-graphite/[0.05]/80 border border-line/60 px-2 py-0.5 font-mono text-[10px] text-graphite/55">
              {spec.fps} fps
            </span>
            <span className="rounded bg-graphite/[0.05]/80 border border-line/60 px-2 py-0.5 font-mono text-[10px] text-amber/60">
              {spec.durationSec}s
            </span>

            <div className="h-4 w-px bg-line mx-0.5" />

            {/* ── Render in Browser ── */}
            {!browserOk ? (
              <span className="text-[10px] text-graphite/40 italic">Needs Chrome / Edge</span>
            ) : recording ? (
              <button
                onClick={stopRec}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                title="Stop recording"
              >
                <Square size={9} className="fill-red-400" />
                {Math.round(recPct)}% · Stop
              </button>
            ) : (
              <button
                onClick={renderInBrowser}
                className="flex items-center gap-1.5 rounded-lg border border-line/60 bg-graphite/[0.05]/60 px-2.5 py-1 text-[10px] font-medium text-graphite/55 hover:text-amber hover:border-amber/40 hover:bg-amber/5 transition-all"
                title="Render in your browser — uses your GPU, no server needed"
              >
                <Video size={10} />
                Render in Browser
              </button>
            )}
          </div>
        </div>

        {/* Player area */}
        <div className="relative flex-1 flex items-center justify-center p-8 overflow-hidden">
          {/* Subtle radial amber glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[40%] w-[60%] rounded-full bg-amber/[0.025] blur-[80px]" />
          </div>

          {/* Player wrapper — adapts to the selected aspect ratio */}
          <div
            className="relative shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_rgba(0,0,0,0.8)]"
            style={{
              aspectRatio: `${spec.width}/${spec.height}`,
              width:  spec.height > spec.width ? "auto" : "100%",
              height: spec.height > spec.width ? "100%" : "auto",
              maxWidth: "min(1400px, 100%)",
              maxHeight: "100%",
            }}
          >
            {/* Corner brackets — cinematic feel */}
            <div className="pointer-events-none absolute -inset-px z-10">
              <div className="absolute top-0 left-0 h-4 w-4 border-t border-l border-amber/20" />
              <div className="absolute top-0 right-0 h-4 w-4 border-t border-r border-amber/20" />
              <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-amber/20" />
              <div className="absolute bottom-0 right-0 h-4 w-4 border-b border-r border-amber/20" />
            </div>

            <Player
              key={spec.kind}
              ref={previewRef}
              component={PreviewComp as any}
              inputProps={inputProps}
              durationInFrames={Math.max(1, Math.round(spec.durationSec * spec.fps))}
              compositionWidth={spec.width}
              compositionHeight={spec.height}
              fps={spec.fps}
              controls
              loop
              autoPlay
              style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
            />
          </div>
        </div>

        {/* Bottom hint */}
        <div className="flex items-center justify-center border-t border-line/30 bg-paper-100/70 py-2">
          <p className="text-[9px] text-graphite/35 tracking-[0.2em] uppercase">
            {spec.width}×{spec.height} · broadcast quality · alpha channel supported
          </p>
        </div>
      </div>
    </>
  );
};
