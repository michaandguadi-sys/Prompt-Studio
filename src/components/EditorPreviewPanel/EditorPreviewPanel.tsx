"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Player, PlayerRef } from "@remotion/player";
import { useStudio } from "@/store/studio";
import { SequencePreview, projectFrames } from "@/remotion/SceneRenderer";
import { Video, X, Square } from "lucide-react";
import { ASPECTS, dimsFor } from "@/lib/aspect";
import { useTier } from "@/hooks/useTier";
import { pickRecordingFormat } from "@/lib/recording";
import type { AspectRatio } from "@/lib/types";

/**
 * Center preview for the unified editor — plays the WHOLE project as a Remotion
 * <Series>, back-to-back. The per-kind studio pages keep using PreviewPanel
 * (single active scene); this one is sequence-aware.
 */
export const EditorPreviewPanel: React.FC = () => {
  const scenes = useStudio((s) => s.scenes);
  const setAspect = useStudio((s) => s.setAspect);
  const projectName = scenes[0]?.name ?? "sequence";
  const aspect = useStudio((s) => s.aspect);
  const { width, height } = dimsFor(aspect);
  const fps = scenes[0]?.fps ?? 24;
  const totalFrames = projectFrames(scenes);
  const totalSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);

  // Free tier gets a "Mapanisy" watermark on preview + Quick Export so the
  // in-browser recorder can't be used to dodge it. 4K agent renders are gated
  // server-side. Defaults to off while the tier resolves so paid users never flash one.
  const { watermark } = useTier();
  const inputProps = useMemo(() => ({ scenes, watermark }), [scenes, watermark]);

  const cinemaRef = useRef<PlayerRef>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [recording, setRecording] = useState(false);
  const [recPct, setRecPct] = useState(0);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [browserOk, setBrowserOk] = useState(true);

  const stopRec = useCallback(() => recorderRef.current?.stop(), []);

  const renderInBrowser = useCallback(async () => {
    if (recording) return;
    if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") {
      setBrowserOk(false);
      return;
    }
    setCinemaMode(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const cinemaEl = document.getElementById("ps-cinema-overlay");
    try {
      if (cinemaEl && !document.fullscreenElement) {
        await cinemaEl.requestFullscreen({ navigationUI: "hide" });
      }
    } catch { /* fullscreen may be blocked */ }

    cinemaRef.current?.seekTo(0);
    await new Promise<void>((r) => setTimeout(r, 400));

    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          displaySurface: "browser",
          frameRate: { ideal: fps, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });
    } catch {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setCinemaMode(false);
      return;
    }

    const { mimeType, ext } = pickRecordingFormat();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRecording(false);
      setRecPct(0);
      setCinemaMode(false);
    };

    setRecording(true);
    setRecPct(0);
    recorder.start(100);
    cinemaRef.current?.play();

    const totalMs = totalSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => {
      setRecPct(Math.min(99, ((Date.now() - t0) / totalMs) * 100));
    }, 100);
    setTimeout(() => {
      clearInterval(tick);
      setRecPct(100);
      recorder.stop();
    }, totalMs + 400);
  }, [recording, fps, totalSec, projectName]);

  const portrait = height > width;

  return (
    <>
      {cinemaMode && typeof document !== "undefined" &&
        createPortal(
          <div
            id="ps-cinema-overlay"
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            style={{ cursor: recording ? "none" : "default" }}
          >
            <div className="w-full h-full" style={{ aspectRatio: `${width}/${height}`, maxWidth: "100vw", maxHeight: "100vh" }}>
              <Player
                ref={cinemaRef}
                component={SequencePreview as any}
                inputProps={inputProps}
                durationInFrames={totalFrames}
                compositionWidth={width}
                compositionHeight={height}
                fps={fps}
                controls={false}
                loop={false}
                autoPlay={false}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>

            {!recording && (
              <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-white/95 backdrop-blur-md border border-line/60 px-5 py-3 shadow-elevated anim-fade-up">
                <div className="text-sm text-graphite/70 leading-relaxed">
                  In the screen share picker, select{" "}
                  <span className="font-semibold text-graphite">This Tab</span> — recording starts automatically.
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

            {recording && (
              <div className="fixed top-5 right-5 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-sm border border-red-500/30 px-3 py-1.5 pointer-events-none">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-xs text-graphite tabular-nums">{Math.round(recPct)}%</span>
              </div>
            )}
          </div>,
          document.body,
        )}

      <div className="flex h-full flex-col bg-paper-100">
        {/* Chrome bar */}
        <div className="flex items-center justify-between border-b border-line/60 bg-paper-100/85 backdrop-blur-sm px-5 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber animate-breathe" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.35em] text-amber/70">
                Sequence Preview
              </span>
            </div>
            <div className="h-3 w-px bg-line" />
            <span className="text-[10px] text-graphite/50 tracking-wide">
              {scenes.length} scene{scenes.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-line/60 bg-graphite/[0.05]/60 p-0.5" title="Output aspect ratio">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a as AspectRatio)}
                  className={[
                    "rounded px-1.5 py-0.5 font-mono text-[10px] transition-all",
                    aspect === a ? "bg-amber/15 text-amber" : "text-graphite/50 hover:text-graphite/70",
                  ].join(" ")}
                >
                  {a}
                </button>
              ))}
            </div>
            <span className="rounded bg-graphite/[0.05]/80 border border-line/60 px-2 py-0.5 font-mono text-[10px] text-graphite/55">
              {width}×{height}
            </span>
            <span className="rounded bg-graphite/[0.05]/80 border border-line/60 px-2 py-0.5 font-mono text-[10px] text-amber/60">
              {totalSec.toFixed(1)}s
            </span>

            <div className="h-4 w-px bg-line mx-0.5" />

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
                title="Render the whole sequence in your browser"
              >
                <Video size={10} />
                Quick Export
              </button>
            )}
          </div>
        </div>

        {/* Player */}
        <div className="relative flex-1 flex items-center justify-center p-8 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[40%] w-[60%] rounded-full bg-amber/[0.025] blur-[80px]" />
          </div>
          <div
            className="relative shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_rgba(0,0,0,0.8)]"
            style={{
              aspectRatio: `${width}/${height}`,
              width: portrait ? "auto" : "100%",
              height: portrait ? "100%" : "auto",
              maxWidth: "min(1400px, 100%)",
              maxHeight: "100%",
            }}
          >
            <div className="pointer-events-none absolute -inset-px z-10">
              <div className="absolute top-0 left-0 h-4 w-4 border-t border-l border-amber/20" />
              <div className="absolute top-0 right-0 h-4 w-4 border-t border-r border-amber/20" />
              <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-amber/20" />
              <div className="absolute bottom-0 right-0 h-4 w-4 border-b border-r border-amber/20" />
            </div>
            <Player
              key={`${aspect}-${scenes.length}`}
              component={SequencePreview as any}
              inputProps={inputProps}
              durationInFrames={totalFrames}
              compositionWidth={width}
              compositionHeight={height}
              fps={fps}
              controls
              loop
              autoPlay
              style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center border-t border-line/30 bg-paper-100/70 py-2">
          <p className="text-[9px] text-graphite/35 tracking-[0.2em] uppercase">
            {width}×{height} · {totalSec.toFixed(1)}s · broadcast quality
          </p>
        </div>
      </div>
    </>
  );
};
