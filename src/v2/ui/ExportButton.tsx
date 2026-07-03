"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Player, PlayerRef } from "@remotion/player";
import { Download, Loader2, X, Check, Video } from "lucide-react";
import { MapComposition } from "../render/MapComposition";
import { dimsFor } from "../doc/schema";
import { useEditor } from "../store/editor";
import { pickRecordingFormat } from "@/lib/recording";
import { useTier } from "@/hooks/useTier";

type ExportStatus = "idle" | "loading" | "recording" | "done" | "error";

/**
 * Direct canvas export — no screen-share dialog, no terminal required.
 *
 * Approach: mount a full-res hidden Player with capturing=true (which sets
 * MapLibre's preserveDrawingBuffer so the WebGL back-buffer stays readable),
 * then call canvas.captureStream(fps) to record directly from the GPU canvas.
 * Falls back to the display-media API on Safari (no captureStream support).
 *
 * This means terrain, 3D buildings, and all effects export correctly because
 * we're capturing from the real browser WebGL renderer, not a headless one.
 */
export const ExportButton: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const name = useEditor((s) => s.project.name);
  const { width, height } = dimsFor(comp.aspect);
  const fps = comp.fps;
  const totalFrames = Math.max(1, Math.round(comp.durationSec * fps));
  const { watermark } = useTier();

  // capturing=true → MapComposition sets preserveDrawingBuffer on its WebGL canvas
  const inputProps = useMemo(() => ({ comp, watermark, capturing: true }), [comp, watermark]);

  const cinemaRef = useRef<PlayerRef>(null);
  const cinemaContainerRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setOpen(false);
    setStatus("idle");
    setProgress(0);
    setErrorMsg(null);
  }, []);

  /** Try the preferred path: captureStream() on the MapLibre canvas. */
  const recordViaCanvas = useCallback(async () => {
    // Wait for the cinema Player to mount and MapLibre to load tiles.
    // We poll until the canvas appears (up to 8s) then add a 500ms paint buffer.
    let canvas: HTMLCanvasElement | null = null;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      canvas = cinemaContainerRef.current?.querySelector("canvas") ?? null;
      if (canvas) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!canvas) {
      setStatus("error");
      setErrorMsg("Map canvas not found — try the Quick export button.");
      return;
    }

    // Extra paint buffer for tiles to finish rendering.
    await new Promise((r) => setTimeout(r, 800));

    // captureStream is not available in Safari.
    if (typeof (canvas as any).captureStream !== "function") {
      fallbackDisplayMedia();
      return;
    }

    const stream: MediaStream = (canvas as any).captureStream(fps);
    const { mimeType, ext } = pickRecordingFormat();
    const chunks: Blob[] = [];

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 30_000_000 });
    } catch {
      fallbackDisplayMedia();
      return;
    }
    recRef.current = rec;

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (chunks.length === 0) { setStatus("error"); setErrorMsg("Nothing was captured — map may not have rendered."); return; }
      const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "mapanisy").replace(/[^a-z0-9\-_]+/gi, "-")}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("done");
      setTimeout(() => dismiss(), 2200);
    };

    setStatus("recording");
    setProgress(0);
    rec.start(100);

    // Seek to the first frame and play.
    cinemaRef.current?.seekTo(0);
    cinemaRef.current?.play();

    const totalMs = comp.durationSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => setProgress(Math.min(98, ((Date.now() - t0) / totalMs) * 100)), 120);
    setTimeout(() => { clearInterval(tick); setProgress(100); rec.stop(); }, totalMs + 500);
  }, [fps, comp.durationSec, name, dismiss]);

  /** Safari fallback — captures the cinema fullscreen via getDisplayMedia. */
  const fallbackDisplayMedia = useCallback(async () => {
    if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") {
      setStatus("error");
      setErrorMsg("Your browser doesn't support video export. Please use Chrome or Firefox.");
      return;
    }
    // For fallback, show the cinema div so the user can share it.
    setStatus("recording");
    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "browser", frameRate: { ideal: fps, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false, preferCurrentTab: true, selfBrowserSurface: "include",
      });
    } catch {
      setStatus("idle");
      return;
    }
    const { mimeType, ext } = pickRecordingFormat();
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      const a = document.createElement("a");
      a.href = url; a.download = `${(name || "mapanisy").replace(/[^a-z0-9\-_]+/gi, "-")}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("done");
      setTimeout(() => dismiss(), 2200);
    };
    rec.start(100);
    cinemaRef.current?.seekTo(0);
    cinemaRef.current?.play();
    const totalMs = comp.durationSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => setProgress(Math.min(98, ((Date.now() - t0) / totalMs) * 100)), 120);
    setTimeout(() => { clearInterval(tick); setProgress(100); rec.stop(); }, totalMs + 500);
  }, [fps, comp.durationSec, name, dismiss]);

  const startExport = useCallback(async () => {
    if (status !== "idle") return;
    setOpen(true);
    setStatus("loading");
    setProgress(0);
    setErrorMsg(null);
    // Give the portal a tick to mount before we start looking for canvases.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await recordViaCanvas();
  }, [status, recordViaCanvas]);

  return (
    <>
      <button
        onClick={startExport}
        disabled={status !== "idle"}
        title="Export animation as MP4/WebM — renders directly from your browser"
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-3 py-1.5 text-xs text-graphite/80 hover:text-graphite hover:border-black/20 transition-colors disabled:opacity-40"
      >
        {status !== "idle" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Export video
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
          {/* Hidden full-res player — opacity:0 keeps it invisible but WebGL still renders */}
          <div
            ref={cinemaContainerRef}
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0, pointerEvents: "none",
            }}
          >
            <div style={{ width, height, flexShrink: 0 }}>
              <Player
                ref={cinemaRef}
                component={MapComposition as any}
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
          </div>

          {/* Progress UI */}
          <div className="relative z-10 flex flex-col items-center gap-5 text-center">
            {status === "loading" && (
              <>
                <Loader2 size={36} className="animate-spin text-white/60" />
                <div>
                  <p className="text-white font-medium">Preparing export…</p>
                  <p className="text-white/40 text-sm mt-1">Loading map tiles</p>
                </div>
              </>
            )}

            {status === "recording" && (
              <>
                <div className="relative flex items-center justify-center">
                  <Video size={36} className="text-iris" />
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">{Math.round(progress)}%</p>
                  <p className="text-white/50 text-sm">Recording {comp.durationSec}s animation…</p>
                </div>
                <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-iris rounded-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <button
                  onClick={() => { recRef.current?.stop(); }}
                  className="text-white/30 text-xs hover:text-white/60 transition-colors mt-1"
                >
                  Cancel
                </button>
              </>
            )}

            {status === "done" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
                  <Check size={28} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Download started!</p>
                  <p className="text-white/40 text-sm mt-1">Check your downloads folder</p>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <p className="text-red-400 font-medium">Export failed</p>
                <p className="text-white/40 text-sm max-w-xs">{errorMsg}</p>
                <button onClick={dismiss} className="mt-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
                  Close
                </button>
              </>
            )}
          </div>

          {/* Dismiss button (only when not mid-recording) */}
          {status !== "recording" && status !== "loading" && (
            <button
              onClick={dismiss}
              className="absolute right-5 top-5 text-white/30 hover:text-white/70 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};
