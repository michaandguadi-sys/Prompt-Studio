"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Camera, Download, Copy, Loader2, Check, Undo2, Trash2,
  Brush, Highlighter, MoveUpRight, Square, Circle as CircleIcon, Type as TypeIcon, Eraser,
} from "lucide-react";
import { useEditor } from "../store/editor";
import { dimsFor } from "../doc/schema";

/**
 * STILL STUDIO — tell the story in ONE image.
 *
 * The blogger suite: pick the exact moment of the film (every layer, grade and
 * font rendered pixel-identically to video via the server pipeline), draw on
 * it — brush, highlighter, arrows, boxes, text — and export as PNG / JPG /
 * WebP / SVG / PDF at up to 4K. Also the editor's one-click frame extractor.
 *
 * Annotations live on a client canvas layered over the rendered still and are
 * composited at FULL resolution on export (stroke coordinates are stored in
 * preview space and scaled up), so lines stay crisp at 4K.
 */

type Tool = "brush" | "marker" | "arrow" | "rect" | "ellipse" | "text" | "eraser";
type Fmt = "png" | "jpeg" | "webp" | "svg" | "pdf";

type Stroke =
  | { kind: "path"; tool: "brush" | "marker" | "eraser"; color: string; size: number; pts: [number, number][] }
  | { kind: "arrow" | "rect" | "ellipse"; color: string; size: number; a: [number, number]; b: [number, number] }
  | { kind: "text"; color: string; size: number; at: [number, number]; text: string };

const SWATCHES = ["#FF5A44", "#FFB020", "#36D39A", "#2FE0FF", "#6E7BFF", "#B57BFF", "#FFFFFF", "#0A0A0A"];
const PREVIEW_SCALE = 0.35;

/** Draw one stroke onto a 2D context, scaling preview-space coords by k. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.kind === "path") {
    ctx.globalAlpha = s.tool === "marker" ? 0.45 : 1;
    ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size * k * (s.tool === "marker" ? 2.2 : 1) * (s.tool === "eraser" ? 2.5 : 1);
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.stroke();
  } else if (s.kind === "arrow") {
    const [ax, ay] = [s.a[0] * k, s.a[1] * k], [bx, by] = [s.b[0] * k, s.b[1] * k];
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.size * k;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const ang = Math.atan2(by - ay, bx - ax), head = Math.max(10, s.size * 3.2) * k;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - head * Math.cos(ang - 0.42), by - head * Math.sin(ang - 0.42));
    ctx.lineTo(bx - head * Math.cos(ang + 0.42), by - head * Math.sin(ang + 0.42));
    ctx.closePath(); ctx.fill();
  } else if (s.kind === "rect" || s.kind === "ellipse") {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.size * k;
    const x = Math.min(s.a[0], s.b[0]) * k, y = Math.min(s.a[1], s.b[1]) * k;
    const w = Math.abs(s.b[0] - s.a[0]) * k, h = Math.abs(s.b[1] - s.a[1]) * k;
    if (s.kind === "rect") ctx.strokeRect(x, y, w, h);
    else { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  } else if (s.kind === "text") {
    ctx.fillStyle = s.color;
    ctx.font = `700 ${s.size * 5 * k}px Inter, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 4 * k;
    ctx.fillText(s.text, s.at[0] * k, s.at[1] * k);
  }
  ctx.restore();
}

export const StillStudio: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const comp = useEditor((s) => s.project.composition);
  const name = useEditor((s) => s.project.name);
  const playhead = useEditor((s) => s.playheadFrame);
  const totalFrames = Math.max(1, Math.round(comp.durationSec * comp.fps));
  const { width: fullW, height: fullH } = dimsFor(comp.aspect);

  const [frame, setFrame] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#FF5A44");
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [fmt, setFmt] = useState<Fmt>("png");
  const [quality, setQuality] = useState(90);
  const [outScale, setOutScale] = useState(1);
  const [busy, setBusy] = useState<"export" | "copy" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<{ at: [number, number]; value: string } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const liveStroke = useRef<Stroke | null>(null);
  const cache = useRef(new Map<number, string>());
  const fullPngCache = useRef(new Map<number, Blob>());

  /* Open: start at the editor's playhead — the one-click "extract this frame". */
  useEffect(() => {
    if (open) { setFrame(Math.min(totalFrames - 1, Math.max(0, playhead || 0))); setStrokes([]); setErr(null); setDone(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Fetch the rendered preview for the current frame (debounced, cached). */
  useEffect(() => {
    if (!open) return;
    if (cache.current.has(frame)) { setPreviewUrl(cache.current.get(frame)!); return; }
    setLoading(true); setErr(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/v2/snapshot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ composition: comp, frame, format: "jpeg", scale: PREVIEW_SCALE, jpegQuality: 72 }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Render failed (${r.status})`);
        const url = URL.createObjectURL(await r.blob());
        cache.current.set(frame, url);
        if (cache.current.size > 14) {
          const first = cache.current.keys().next().value as number;
          URL.revokeObjectURL(cache.current.get(first)!); cache.current.delete(first);
        }
        setPreviewUrl(url);
      } catch (e: any) { setErr(e?.message ?? "Couldn't render this moment."); }
      finally { setLoading(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [open, frame, comp]);

  /* Invalidate caches when the composition itself changes. */
  useEffect(() => {
    cache.current.forEach((u) => URL.revokeObjectURL(u));
    cache.current.clear(); fullPngCache.current.clear();
  }, [comp]);

  /* Repaint the annotation canvas whenever strokes change. */
  const repaint = useCallback(() => {
    const cv = drawRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) drawStroke(ctx, s, 1);
    if (liveStroke.current) drawStroke(ctx, liveStroke.current, 1);
  }, [strokes]);
  useEffect(() => { repaint(); }, [repaint]);

  /* Pointer drawing — coords stored in the annotation canvas's pixel space. */
  const toLocal = (e: React.PointerEvent): [number, number] => {
    const cv = drawRef.current!;
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height];
  };
  const onDown = (e: React.PointerEvent) => {
    if (!drawRef.current || textDraft) return;
    const p = toLocal(e);
    if (tool === "text") { setTextDraft({ at: p, value: "" }); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    liveStroke.current =
      tool === "brush" || tool === "marker" || tool === "eraser"
        ? { kind: "path", tool, color, size, pts: [p] }
        : { kind: tool, color, size, a: p, b: p };
    repaint();
  };
  const onMove = (e: React.PointerEvent) => {
    const s = liveStroke.current; if (!s) return;
    const p = toLocal(e);
    if (s.kind === "path") s.pts.push(p); else (s as any).b = p;
    repaint();
  };
  const onUp = () => {
    const s = liveStroke.current; if (!s) return;
    liveStroke.current = null;
    setStrokes((prev) => [...prev, s]);
  };
  const commitText = () => {
    if (textDraft && textDraft.value.trim()) {
      setStrokes((prev) => [...prev, { kind: "text", color, size, at: textDraft.at, text: textDraft.value.trim() }]);
    }
    setTextDraft(null);
  };

  /* ── Export: full-res server frame + client-side annotation composite ────── */
  const fetchFullPng = async (): Promise<Blob> => {
    if (fullPngCache.current.has(frame)) return fullPngCache.current.get(frame)!;
    const r = await fetch("/api/v2/snapshot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ composition: comp, frame, format: "png", scale: outScale }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Full-res render failed");
    const b = await r.blob();
    fullPngCache.current.set(frame, b);
    if (fullPngCache.current.size > 4) fullPngCache.current.delete(fullPngCache.current.keys().next().value as number);
    return b;
  };

  /** Composite base + annotations at output resolution; returns a canvas. */
  const composite = async (): Promise<HTMLCanvasElement> => {
    const base = await fetchFullPng();
    const img = await createImageBitmap(base);
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const k = img.width / (drawRef.current?.width || img.width); // preview → full
    for (const s of strokes) drawStroke(ctx, s, k);
    return cv;
  };

  const fileBase = () => `${(name || "mapanisy-still").replace(/[^a-z0-9\-_]+/gi, "-")}-f${frame}`;
  const saveBlob = (blob: Blob, ext: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const doExport = async () => {
    if (busy) return;
    setBusy("export"); setErr(null); setDone(null);
    try {
      if (fmt === "pdf") {
        // PDF comes straight from the renderer (annotations can't composite here).
        const r = await fetch("/api/v2/snapshot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ composition: comp, frame, format: "pdf", scale: outScale }),
        });
        if (!r.ok) throw new Error("PDF render failed");
        saveBlob(await r.blob(), "pdf");
      } else if (fmt === "svg") {
        // Scalable wrapper embedding the full-res raster — drops into any blog.
        const cv = await composite();
        const dataUrl = cv.toDataURL("image/png");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cv.width}" height="${cv.height}" viewBox="0 0 ${cv.width} ${cv.height}"><image width="${cv.width}" height="${cv.height}" xlink:href="${dataUrl}"/></svg>`;
        saveBlob(new Blob([svg], { type: "image/svg+xml" }), "svg");
      } else {
        const cv = await composite();
        const mime = fmt === "png" ? "image/png" : fmt === "jpeg" ? "image/jpeg" : "image/webp";
        const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, mime, quality / 100));
        if (!blob) {
          // Safari can't encode webp — fall back to PNG rather than fail.
          const png = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
          if (!png) throw new Error("Encoding failed");
          saveBlob(png, "png");
          setDone("Saved as PNG (this browser can't encode WebP)");
          return;
        }
        saveBlob(blob, fmt === "jpeg" ? "jpg" : fmt);
      }
      setDone("Saved to your downloads ✓");
    } catch (e: any) { setErr(e?.message ?? "Export failed."); }
    finally { setBusy(null); setTimeout(() => setDone(null), 4000); }
  };

  const doCopy = async () => {
    if (busy) return;
    setBusy("copy"); setErr(null);
    try {
      const cv = await composite();
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
      if (!blob || typeof ClipboardItem === "undefined") throw new Error("Clipboard not available here");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setDone("Copied — paste straight into your post ✓");
    } catch (e: any) { setErr(e?.message ?? "Copy failed — use Download instead."); }
    finally { setBusy(null); setTimeout(() => setDone(null), 4000); }
  };

  const previewW = Math.round(fullW * PREVIEW_SCALE);
  const previewH = Math.round(fullH * PREVIEW_SCALE);
  const secOf = (f: number) => (f / comp.fps).toFixed(1);

  const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: "brush", icon: <Brush size={14} />, label: "Brush" },
    { id: "marker", icon: <Highlighter size={14} />, label: "Highlighter" },
    { id: "arrow", icon: <MoveUpRight size={14} />, label: "Arrow" },
    { id: "rect", icon: <Square size={14} />, label: "Box" },
    { id: "ellipse", icon: <CircleIcon size={14} />, label: "Circle" },
    { id: "text", icon: <TypeIcon size={14} />, label: "Text" },
    { id: "eraser", icon: <Eraser size={14} />, label: "Eraser" },
  ];

  const exportDims = `${Math.round(fullW * outScale)} × ${Math.round(fullH * outScale)}`;

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-white"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 40px 110px -34px rgba(20,28,55,0.5)" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#B57BFF)" }}>
              <Camera size={13} />
            </span>
            <h2 className="text-sm font-semibold text-graphite">Still Studio</h2>
            <span className="text-[11px] text-graphite/45">— one frame, ready for your blog</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-graphite/45 transition-colors hover:bg-graphite/[0.05] hover:text-graphite"><X size={16} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── Stage ── */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#0d1020] p-4">
            <div ref={stageRef} className="relative mx-auto my-auto max-h-full max-w-full overflow-hidden rounded-xl ring-1 ring-white/10" style={{ aspectRatio: `${fullW}/${fullH}` }}>
              {previewUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewUrl} alt={`Frame ${frame}`} className="block h-full w-full select-none object-contain" draggable={false} />
                : <div className="flex h-full w-full items-center justify-center" style={{ width: previewW, height: previewH, maxWidth: "100%" }} />}
              <canvas
                ref={drawRef}
                width={previewW}
                height={previewH}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: tool === "text" ? "text" : "crosshair" }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
              />
              {/* Inline text input for the text tool */}
              {textDraft && drawRef.current && (
                <input
                  autoFocus
                  value={textDraft.value}
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextDraft(null); }}
                  onBlur={commitText}
                  placeholder="Type, then Enter"
                  className="absolute z-10 rounded-md border border-iris bg-black/70 px-2 py-1 font-bold text-white outline-none placeholder:text-white/40"
                  style={{
                    left: `${(textDraft.at[0] / previewW) * 100}%`,
                    top: `${(textDraft.at[1] / previewH) * 100}%`,
                    fontSize: Math.max(12, size * 5 * (stageRef.current ? stageRef.current.clientWidth / previewW : 1) * 0.9),
                    color,
                  }}
                />
              )}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-[12px] text-white/85">
                    <Loader2 size={13} className="animate-spin" /> Rendering this moment…
                  </div>
                </div>
              )}
            </div>

            {/* Moment picker */}
            <div className="mt-4 shrink-0">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/55">
                <span>Pick the moment — every layer renders exactly like the film</span>
                <span className="tabular-nums text-white/75">{secOf(frame)}s · frame {frame} / {totalFrames - 1}</span>
              </div>
              <input
                type="range" min={0} max={totalFrames - 1} step={1} value={frame}
                onChange={(e) => setFrame(parseInt(e.target.value, 10))}
                className="w-full accent-[#6E7BFF]"
              />
            </div>
          </div>

          {/* ── Rail ── */}
          <aside className="flex w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-paper p-4">
            {/* Tools */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/45">Draw on it</div>
              <div className="grid grid-cols-4 gap-1.5">
                {TOOLS.map((t) => (
                  <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
                    className={`flex h-9 items-center justify-center rounded-lg border transition-colors ${tool === t.id ? "border-iris bg-iris/12 text-iris" : "border-line text-graphite/55 hover:border-graphite/25"}`}>
                    {t.icon}
                  </button>
                ))}
                <button onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length} title="Undo (last mark)"
                  className="flex h-9 items-center justify-center rounded-lg border border-line text-graphite/55 transition-colors hover:border-graphite/25 disabled:opacity-30">
                  <Undo2 size={14} />
                </button>
                <button onClick={() => setStrokes([])} disabled={!strokes.length} title="Clear all marks"
                  className="flex h-9 items-center justify-center rounded-lg border border-line text-graphite/55 transition-colors hover:border-red-300 hover:text-red-500 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button key={c} onClick={() => setColor(c)} title={c}
                    className={`h-5.5 w-5.5 rounded-full ring-2 transition-transform hover:scale-110 ${color === c ? "ring-iris" : "ring-black/10"}`}
                    style={{ background: c, width: 22, height: 22 }} />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[22px] w-7 cursor-pointer rounded border border-line bg-transparent p-0" title="Custom colour" />
              </div>
              <label className="mt-2.5 flex items-center gap-2 text-[11px] text-graphite/55">
                Size
                <input type="range" min={1} max={16} step={0.5} value={size} onChange={(e) => setSize(parseFloat(e.target.value))} className="flex-1 accent-[#6E7BFF]" />
                <span className="w-6 text-right tabular-nums">{size}</span>
              </label>
            </div>

            {/* Export */}
            <div className="border-t border-line pt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/45">Export</div>
              <div className="grid grid-cols-5 gap-1">
                {(["png", "jpeg", "webp", "svg", "pdf"] as Fmt[]).map((f) => {
                  const disabled = f === "pdf" && strokes.length > 0;
                  return (
                    <button key={f} onClick={() => !disabled && setFmt(f)} disabled={disabled}
                      title={disabled ? "PDF export can't include drawings — clear marks or pick PNG" : f.toUpperCase()}
                      className={`rounded-md border px-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${fmt === f ? "border-iris bg-iris/12 text-iris" : "border-line text-graphite/55 hover:border-graphite/25"} disabled:opacity-30`}>
                      {f === "jpeg" ? "JPG" : f}
                    </button>
                  );
                })}
              </div>
              {(fmt === "jpeg" || fmt === "webp") && (
                <label className="mt-2.5 flex items-center gap-2 text-[11px] text-graphite/55">
                  Quality
                  <input type="range" min={40} max={100} step={1} value={quality} onChange={(e) => setQuality(parseInt(e.target.value, 10))} className="flex-1 accent-[#6E7BFF]" />
                  <span className="w-7 text-right tabular-nums">{quality}</span>
                </label>
              )}
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-graphite/55">
                <span>Resolution</span>
                <div className="flex gap-1">
                  {[[1, "4K"], [0.5, "HD"], [0.25, "Web"]].map(([v, l]) => (
                    <button key={String(l)} onClick={() => setOutScale(v as number)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${outScale === v ? "border-iris bg-iris/12 text-iris" : "border-line text-graphite/55 hover:border-graphite/25"}`}>
                      {l as string}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1 text-right text-[10px] tabular-nums text-graphite/40">{exportDims}px</div>

              <button onClick={doExport} disabled={!!busy || loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-iris to-[#9b5cff] px-4 py-2.5 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5 disabled:opacity-50">
                {busy === "export" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download {fmt === "jpeg" ? "JPG" : fmt.toUpperCase()}
              </button>
              <button onClick={doCopy} disabled={!!busy || loading || fmt === "pdf"}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-[12px] font-medium text-graphite/70 transition-colors hover:border-iris/40 hover:text-graphite disabled:opacity-40">
                {busy === "copy" ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
                Copy to clipboard
              </button>

              {done && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600"><Check size={12} /> {done}</div>}
              {err && <div className="mt-2 rounded-lg border border-red-300/50 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">{err}</div>}
            </div>

            <div className="mt-auto border-t border-line pt-3 text-[10px] leading-relaxed text-graphite/40">
              Tip: scrub to the exact beat of your story, circle what matters, add an arrow — the hero image for your post in one click.
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
};
