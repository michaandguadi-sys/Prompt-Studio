"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Player, PlayerRef } from "@remotion/player";
import { Download, Loader2, X, Square } from "lucide-react";
import { MapComposition } from "../render/MapComposition";
import { dimsFor } from "../doc/schema";
import { useEditor } from "../store/editor";
import { pickRecordingFormat } from "@/lib/recording";
import { useTier } from "@/hooks/useTier";

/**
 * Quick Export — records the composition in the browser to an editor-friendly
 * MP4 (falls back to webm). Mirrors the proven v1 capture flow but renders the
 * single v2 MapComposition. (4K agent render uses the registered MapanisyV2
 * Remotion composition once the agent bundle is rebuilt.)
 */
export const ExportButton: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const name = useEditor((s) => s.project.name);
  const { width, height } = dimsFor(comp.aspect);
  const fps = comp.fps;
  const totalFrames = Math.max(1, Math.round(comp.durationSec * fps));
  const { watermark } = useTier(); // free tier exports include the watermark
  const inputProps = useMemo(() => ({ comp, watermark }), [comp, watermark]);

  const cinemaRef = useRef<PlayerRef>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [cinema, setCinema] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pct, setPct] = useState(0);
  const [ok, setOk] = useState(true);

  const record = useCallback(async () => {
    if (recording) return;
    if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") { setOk(false); return; }
    setCinema(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const el = document.getElementById("v2-cinema");
    try { if (el && !document.fullscreenElement) await el.requestFullscreen({ navigationUI: "hide" }); } catch {}
    cinemaRef.current?.seekTo(0);
    await new Promise<void>((r) => setTimeout(r, 400));

    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "browser", frameRate: { ideal: fps, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false, preferCurrentTab: true, selfBrowserSurface: "include",
      });
    } catch { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setCinema(false); return; }

    const { mimeType, ext } = pickRecordingFormat();
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      const a = document.createElement("a");
      a.href = url; a.download = `${(name || "mapanisy").replace(/[^a-z0-9\-_]+/gi, "-")}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRecording(false); setPct(0); setCinema(false);
    };

    setRecording(true); setPct(0); rec.start(100); cinemaRef.current?.play();
    const totalMs = comp.durationSec * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => setPct(Math.min(99, ((Date.now() - t0) / totalMs) * 100)), 100);
    setTimeout(() => { clearInterval(tick); setPct(100); rec.stop(); }, totalMs + 400);
  }, [recording, fps, comp.durationSec, name]);

  return (
    <>
      {!ok ? (
        <span className="text-[10px] text-graphite/30 italic">Needs Chrome / Edge</span>
      ) : recording ? (
        <button onClick={() => recRef.current?.stop()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400">
          <Square size={10} className="fill-red-400" /> {Math.round(pct)}% · Stop
        </button>
      ) : (
        <button onClick={record} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-3 py-1.5 text-xs text-graphite/80 hover:text-graphite hover:border-black/20 transition-colors" title="Quick MP4 in your browser (1080p)">
          <Download size={13} /> Quick export
        </button>
      )}

      {cinema && typeof document !== "undefined" && createPortal(
        <div id="v2-cinema" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black" style={{ cursor: recording ? "none" : "default" }}>
          <div className="h-full w-full" style={{ aspectRatio: `${width}/${height}`, maxWidth: "100vw", maxHeight: "100vh" }}>
            <Player ref={cinemaRef} component={MapComposition as any} inputProps={inputProps} durationInFrames={totalFrames} compositionWidth={width} compositionHeight={height} fps={fps} controls={false} loop={false} autoPlay={false} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
          {!recording && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl glass-light px-5 py-3">
              <div className="text-sm text-graphite/70">In the share picker, choose <span className="font-semibold text-graphite">This Tab</span> — recording starts automatically.</div>
              <button onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setCinema(false); }} className="rounded-md p-1 text-graphite/40 hover:text-graphite"><X size={15} /></button>
            </div>
          )}
          {recording && (
            <div className="fixed top-5 right-5 flex items-center gap-2 rounded-full bg-black/70 border border-red-500/30 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /><span className="font-mono text-xs text-graphite">{Math.round(pct)}%</span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};
