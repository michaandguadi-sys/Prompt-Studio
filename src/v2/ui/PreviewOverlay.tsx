"use client";

import React, { useEffect, useRef, useState } from "react";
import { RotateCw, RotateCcw } from "lucide-react";
import { useEditor } from "../store/editor";

const TRANSFORMABLE = new Set(["label", "title", "flag", "image", "chart", "marker", "annotation"]);
const IDENTITY = { offsetXPct: 0, offsetYPct: 0, scale: 1, rotation: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Box = { x: number; y: number; w: number; h: number };

/**
 * Direct-manipulation overlay for the preview. Reads the selected layer's LIVE
 * rendered rect from the DOM (so map-tracked elements are followed as the camera
 * moves) and lets you DRAG to reposition, SCALE from a corner, and ROTATE — all
 * written to the layer's `transform` (offset % of frame · scale · rotation), so
 * the element stays anchored/tracked while you fine-tune it on screen.
 */
export const PreviewOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
  const selectedId = useEditor((s) => s.selectedId);
  const layer = useEditor((s) => s.project.composition.layers.find((l) => l.id === selectedId));
  const patchLayer = useEditor((s) => s.patchLayer);
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<any>(null);

  const editable = !!layer && TRANSFORMABLE.has(layer.type) && layer.enabled !== false;
  const t = ((layer as any)?.transform ?? IDENTITY) as typeof IDENTITY;

  // Follow the element's on-screen rect every frame.
  useEffect(() => {
    if (!editable) { setBox(null); return; }
    let raf = 0;
    const tick = () => {
      const cont = containerRef.current;
      const el = cont?.querySelector(`[data-layer-id="${selectedId}"]`) as HTMLElement | null;
      if (cont && el) {
        const cr = cont.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        setBox({ x: er.left - cr.left, y: er.top - cr.top, w: er.width, h: er.height });
      } else { setBox(null); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editable, selectedId, containerRef]);

  // Keyboard precision: arrows nudge (Shift = bigger), [ ] rotate, +/- scale.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.isContentEditable)) return;
      const cur = ((layer as any)?.transform ?? IDENTITY) as typeof IDENTITY;
      const big = e.shiftKey, step = big ? 2.5 : 0.5;
      let p: Partial<typeof IDENTITY> | null = null;
      switch (e.key) {
        case "ArrowLeft": p = { offsetXPct: r1(cur.offsetXPct - step) }; break;
        case "ArrowRight": p = { offsetXPct: r1(cur.offsetXPct + step) }; break;
        case "ArrowUp": p = { offsetYPct: r1(cur.offsetYPct - step) }; break;
        case "ArrowDown": p = { offsetYPct: r1(cur.offsetYPct + step) }; break;
        case "[": p = { rotation: Math.round(cur.rotation - (big ? 15 : 2)) }; break;
        case "]": p = { rotation: Math.round(cur.rotation + (big ? 15 : 2)) }; break;
        case "+": case "=": p = { scale: r2(clamp(cur.scale + 0.04, 0.1, 8)) }; break;
        case "-": case "_": p = { scale: r2(clamp(cur.scale - 0.04, 0.1, 8)) }; break;
      }
      if (p) { e.preventDefault(); patchLayer(selectedId!, { transform: { ...cur, ...p } }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, selectedId, layer, patchLayer]);

  if (!editable || !box || !containerRef.current) return null;

  const cr = containerRef.current.getBoundingClientRect();
  const centerScreen = { x: cr.left + box.x + box.w / 2, y: cr.top + box.y + box.h / 2 };

  const onMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.mode === "move") {
      const dxPct = ((e.clientX - d.startX) / d.contW) * 100;
      const dyPct = ((e.clientY - d.startY) / d.contH) * 100;
      patchLayer(selectedId!, { transform: { ...d.t0, offsetXPct: r1(d.t0.offsetXPct + dxPct), offsetYPct: r1(d.t0.offsetYPct + dyPct) } });
    } else if (d.mode === "scale") {
      const dist = Math.hypot(e.clientX - d.center.x, e.clientY - d.center.y);
      patchLayer(selectedId!, { transform: { ...d.t0, scale: r2(clamp(d.t0.scale * (dist / d.startDist), 0.1, 8)) } });
    } else if (d.mode === "rotate") {
      const ang = Math.atan2(e.clientY - d.center.y, e.clientX - d.center.x) * 180 / Math.PI;
      patchLayer(selectedId!, { transform: { ...d.t0, rotation: Math.round(d.t0.rotation + (ang - d.startAng)) } });
    }
  };
  const onUp = () => { drag.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };

  const start = (e: React.PointerEvent, mode: "move" | "scale" | "rotate") => {
    e.preventDefault(); e.stopPropagation();
    const d: any = { mode, startX: e.clientX, startY: e.clientY, t0: { ...t }, contW: cr.width, contH: cr.height, center: centerScreen };
    if (mode === "scale") d.startDist = Math.hypot(e.clientX - centerScreen.x, e.clientY - centerScreen.y) || 1;
    if (mode === "rotate") d.startAng = Math.atan2(e.clientY - centerScreen.y, e.clientX - centerScreen.x) * 180 / Math.PI;
    drag.current = d;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const touched = t.offsetXPct !== 0 || t.offsetYPct !== 0 || t.scale !== 1 || t.rotation !== 0;
  const pad = 6;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Selection + move body */}
      <div
        onPointerDown={(e) => start(e, "move")}
        className="pointer-events-auto absolute cursor-move rounded-[3px] border-2 border-dashed border-iris/90"
        style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.001)" }}
      />
      {/* Scale handle — bottom-right */}
      <div
        onPointerDown={(e) => start(e, "scale")}
        title="Drag to scale"
        className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border-2 border-iris bg-white shadow"
        style={{ left: box.x + box.w + pad, top: box.y + box.h + pad }}
      />
      {/* Rotate handle — above top-center */}
      <div
        onPointerDown={(e) => start(e, "rotate")}
        title="Drag to rotate"
        className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-iris bg-white text-iris shadow"
        style={{ left: box.x + box.w / 2, top: box.y - pad - 18 }}
      >
        <RotateCw size={11} />
      </div>
      {/* Hint caption — makes the direct-manipulation affordances discoverable. */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-graphite/85 px-2 py-0.5 text-[9px] font-medium text-white/85 shadow"
        style={{ left: box.x + box.w / 2, top: box.y + box.h + pad + 6 }}
      >
        drag · corner to scale · top to rotate · arrows nudge
      </div>
      {/* Reset (only when transformed) */}
      {touched && (
        <button
          onClick={() => patchLayer(selectedId!, { transform: { ...IDENTITY } })}
          title="Reset position / scale / rotation"
          className="pointer-events-auto absolute flex h-5 items-center gap-1 rounded-full border border-line bg-white px-1.5 text-[9px] font-medium text-graphite/70 shadow hover:text-iris"
          style={{ left: box.x + box.w / 2 + 16, top: box.y - pad - 18 - 2 }}
        >
          <RotateCcw size={9} /> reset
        </button>
      )}
    </div>
  );
};
