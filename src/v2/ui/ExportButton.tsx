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

type ExportStatus = "idle" | "permission" | "loading" | "recording" | "done" | "error";

/**
 * In-browser video export.
 *
 * The animation is a WebGL map canvas WITH DOM overlays on top (routes' end
 * labels, markers, titles, timestamps, charts, highlight labels…). The old path
 * recorded `mapCanvas.captureStream()` directly — which grabs ONLY the WebGL
 * canvas, so every DOM element was dropped and exports came out as "just the map
 * and borders". To capture the COMPOSED result we screen-record the current tab
 * via getDisplayMedia and crop to the animation's on-screen rect: the browser
 * composites canvas + DOM for us (correct fonts, correct timing), and the crop
 * gives a clean file at the right aspect with the modal chrome excluded.
 *
 * captureStream on the bare map canvas remains a last-resort fallback (map-only)
 * for browsers without getDisplayMedia, with a clear warning.
 */
export const ExportButton: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const name = useEditor((s) => s.project.name);
  const { width, height } = dimsFor(comp.aspect);
  const fps = comp.fps;
  const totalFrames = Math.max(1, Math.round(comp.durationSec * fps));
  const { watermark } = useTier();

  // capturing=true → MapComposition sets preserveDrawingBuffer on its WebGL canvas.
  const inputProps = useMemo(() => ({ comp, watermark, capturing: true }), [comp, watermark]);

  const cinemaRef = useRef<PlayerRef>(null);
  const cinemaBoxRef = useRef<HTMLDivElement>(null); // the exact animation rect we crop to
  const cinemaContainerRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cleanupStreams = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
  }, []);

  const dismiss = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    recRef.current = null;
    cleanupStreams();
    setOpen(false);
    setStatus("idle");
    setProgress(0);
    setErrorMsg(null);
    setNote(null);
  }, [cleanupStreams]);

  const saveBlob = useCallback((chunks: Blob[], mimeType: string, ext: string) => {
    if (!chunks.length) { setStatus("error"); setErrorMsg("Nothing was captured — try again."); return; }
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "mapanisy").replace(/[^a-z0-9\-_]+/gi, "-")}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("done");
    setTimeout(() => dismiss(), 2400);
  }, [name, dismiss]);

  /** Drive the recorder: seek to 0, play, tick progress, stop at the end. */
  const runRecorder = useCallback((rec: MediaRecorder, chunks: Blob[], mimeType: string, ext: string) => {
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => saveBlob(chunks, mimeType, ext);
    setStatus("recording");
    setProgress(0);
    rec.start(100);
    cinemaRef.current?.seekTo(0);
    cinemaRef.current?.play();
    const totalMs = comp.durationSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => setProgress(Math.min(98, ((Date.now() - t0) / totalMs) * 100)), 120);
    setTimeout(() => { clearInterval(tick); setProgress(100); try { rec.stop(); } catch { /* ignore */ } }, totalMs + 400);
  }, [comp.durationSec, saveBlob]);

  /**
   * PRIMARY — screen-record the tab, crop to the animation rect. Captures the
   * fully composed frame (map canvas + every DOM overlay).
   */
  const recordViaDisplayCrop = useCallback(async (display: MediaStream) => {
    streamsRef.current.push(display);
    // Wait for the cinema Player to mount + MapLibre to paint tiles.
    setStatus("loading");
    let mapCanvas: HTMLCanvasElement | null = null;
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      mapCanvas = cinemaContainerRef.current?.querySelector("canvas") ?? null;
      if (mapCanvas && cinemaBoxRef.current) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 700)); // tiles settle

    const vid = document.createElement("video");
    vid.muted = true; (vid as any).playsInline = true;
    vid.srcObject = display;
    await vid.play().catch(() => {});
    // Wait for real frame dimensions.
    for (let i = 0; i < 40 && !vid.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
    if (!vid.videoWidth || !cinemaBoxRef.current) { setStatus("error"); setErrorMsg("Couldn't read the screen capture — try again."); return; }

    // Map the animation's CSS rect → captured-video pixel rect. getDisplayMedia
    // captures the whole tab (window.inner*) at videoWidth/Height, so the scale is
    // videoWidth/innerWidth. (Chrome captures the tab, not the OS screen.)
    const rect = cinemaBoxRef.current.getBoundingClientRect();
    const sxScale = vid.videoWidth / window.innerWidth;
    const syScale = vid.videoHeight / window.innerHeight;
    let sx = Math.max(0, Math.round(rect.left * sxScale));
    let sy = Math.max(0, Math.round(rect.top * syScale));
    let sw = Math.min(vid.videoWidth - sx, Math.round(rect.width * sxScale));
    let sh = Math.min(vid.videoHeight - sy, Math.round(rect.height * syScale));
    if (sw < 2 || sh < 2) { setStatus("error"); setErrorMsg("Couldn't locate the animation in the capture — try again."); return; }

    const out = document.createElement("canvas");
    out.width = sw; out.height = sh;
    const octx = out.getContext("2d");
    if (!octx) { setStatus("error"); setErrorMsg("Canvas 2D unavailable."); return; }
    const draw = () => { try { octx.drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh); } catch { /* ignore */ } rafRef.current = requestAnimationFrame(draw); };
    draw();

    const outStream = out.captureStream(fps);
    streamsRef.current.push(outStream);
    const { mimeType, ext } = pickRecordingFormat();
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(outStream, { mimeType, videoBitsPerSecond: 30_000_000 }); }
    catch { setStatus("error"); setErrorMsg("This browser can't encode video. Try Chrome, or use the 4K cloud render."); return; }
    // If the user stops sharing from the browser bar, end the recording cleanly.
    display.getVideoTracks()[0]?.addEventListener("ended", () => { try { rec.stop(); } catch { /* ignore */ } });
    runRecorder(rec, [], mimeType, ext);
  }, [fps, runRecorder]);

  /** LAST-RESORT — capture only the WebGL map canvas (no DOM overlays). */
  const recordMapCanvasOnly = useCallback(async () => {
    setStatus("loading");
    setNote("Your browser blocked screen capture — exporting the map layers only (labels & markers need the cloud render).");
    let canvas: HTMLCanvasElement | null = null;
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      canvas = cinemaContainerRef.current?.querySelector("canvas") ?? null;
      if (canvas) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!canvas || typeof (canvas as any).captureStream !== "function") {
      setStatus("error"); setErrorMsg("Video export isn't supported here. Use the 4K cloud render instead."); return;
    }
    await new Promise((r) => setTimeout(r, 700));
    const stream: MediaStream = (canvas as any).captureStream(fps);
    streamsRef.current.push(stream);
    const { mimeType, ext } = pickRecordingFormat();
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 30_000_000 }); }
    catch { setStatus("error"); setErrorMsg("This browser can't encode video. Use the 4K cloud render."); return; }
    runRecorder(rec, [], mimeType, ext);
  }, [fps, runRecorder]);

  const startExport = useCallback(async () => {
    if (status !== "idle") return;
    setOpen(true);
    setErrorMsg(null);
    setNote(null);
    setProgress(0);

    const getDisplay = (navigator.mediaDevices as any)?.getDisplayMedia;
    if (typeof getDisplay !== "function") { await recordMapCanvasOnly(); return; }

    // Request tab capture INSIDE the click gesture (before any long await).
    setStatus("permission");
    let display: MediaStream;
    try {
      display = await getDisplay.call(navigator.mediaDevices, {
        video: { frameRate: { ideal: fps, max: 60 }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
        // Pre-select THIS tab so the picker is a single "Share" click in Chrome.
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
      } as any);
    } catch {
      // User dismissed the picker → offer the map-only fallback rather than fail.
      await recordMapCanvasOnly();
      return;
    }
    await recordViaDisplayCrop(display);
  }, [status, fps, recordViaDisplayCrop, recordMapCanvasOnly]);

  // While recording, the cinema must be VISIBLE (getDisplayMedia captures pixels).
  const cinemaVisible = status === "loading" || status === "recording";

  return (
    <>
      <button
        onClick={startExport}
        disabled={status !== "idle"}
        title="Export animation as MP4/WebM — records the full composed frame in your browser"
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-3 py-1.5 text-xs text-graphite/80 hover:text-graphite hover:border-black/20 transition-colors disabled:opacity-40"
      >
        {status !== "idle" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Export video
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
          {/* Cinema area (its own flex row) — the full-res animation, VISIBLE while
              recording so the tab capture sees it. cinemaBoxRef is EXACTLY what we
              crop to; the status bar below lives in a separate row, so it can never
              bleed into the captured region. */}
          <div ref={cinemaContainerRef} className="relative flex min-h-0 flex-1 items-center justify-center" style={{ opacity: cinemaVisible ? 1 : 0, pointerEvents: "none" }}>
            <div
              ref={cinemaBoxRef}
              style={{ width: `min(94vw, ${(height ? (width / height) : 1.777) * 78}vh)`, aspectRatio: `${width} / ${height}`, flexShrink: 0, background: "#000" }}
            >
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

          {/* Status bar — a SEPARATE bottom row (never overlaps the cropped cinema). */}
          <div className="pointer-events-auto z-10 flex shrink-0 flex-col items-center justify-center gap-3 px-6 py-5 text-center" style={{ minHeight: "18vh" }}>
            {status === "permission" && (
              <>
                <Video size={30} className="text-iris" />
                <div>
                  <p className="text-white font-medium">Allow tab capture to record</p>
                  <p className="text-white/45 text-sm mt-1 max-w-xs">Pick <b>this tab</b> and press Share — that lets the browser record the map <i>and</i> every label, marker &amp; title.</p>
                </div>
              </>
            )}
            {status === "loading" && (
              <>
                <Loader2 size={30} className="animate-spin text-white/60" />
                <p className="text-white/80 text-sm">Loading map tiles…</p>
              </>
            )}
            {status === "recording" && (
              <>
                <div className="relative flex items-center justify-center">
                  <Video size={30} className="text-iris" />
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">{Math.round(progress)}%</p>
                  <p className="text-white/50 text-sm">Recording {comp.durationSec}s…</p>
                </div>
                <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-iris rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
                <button onClick={() => { try { recRef.current?.stop(); } catch { /* ignore */ } }} className="text-white/30 text-xs hover:text-white/60 transition-colors mt-1">Cancel</button>
              </>
            )}
            {status === "done" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
                  <Check size={28} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Download started!</p>
                  {note && <p className="text-amber-300/80 text-xs mt-1.5 max-w-xs">{note}</p>}
                </div>
              </>
            )}
            {status === "error" && (
              <>
                <p className="text-red-400 font-medium">Export failed</p>
                <p className="text-white/40 text-sm max-w-xs">{errorMsg}</p>
                <button onClick={dismiss} className="mt-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Close</button>
              </>
            )}
            {note && (status === "recording" || status === "loading") && <p className="text-amber-300/80 text-xs max-w-xs">{note}</p>}
          </div>

          {status !== "recording" && status !== "loading" && status !== "permission" && (
            <button onClick={dismiss} className="absolute right-5 top-5 z-10 text-white/30 hover:text-white/70 transition-colors">
              <X size={20} />
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};
