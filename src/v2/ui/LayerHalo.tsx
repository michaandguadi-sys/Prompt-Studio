"use client";

import React, { useEffect, useState } from "react";
import { Copy, Trash2, Eye, EyeOff, Sparkles } from "lucide-react";
import { useEditor } from "../store/editor";
import { LAYER_REGISTRY } from "../layers/registry";

type Box = { x: number; y: number; w: number; h: number };

/**
 * THE HALO — the signature direct interaction. Select ANY element on the canvas
 * and its most-used actions bloom in a glass cluster right at the element (no
 * trip to a far-away panel). It tracks the live rendered rect every frame, so it
 * follows map-anchored elements as the camera moves, and sits BELOW the selection
 * so it never collides with the transform handles above it.
 */
export const LayerHalo: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
  const selectedId = useEditor((s) => s.selectedId);
  const layer = useEditor((s) => s.project.composition.layers.find((l) => l.id === selectedId));
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const patchLayer = useEditor((s) => s.patchLayer);
  const [box, setBox] = useState<Box | null>(null);

  const present = !!layer && selectedId;

  // Follow the selected element's on-screen rect every frame.
  useEffect(() => {
    if (!present) { setBox(null); return; }
    let raf = 0;
    const tick = () => {
      const cont = containerRef.current;
      const el = cont?.querySelector(`[data-layer-id="${selectedId}"]`) as HTMLElement | null;
      if (cont && el) {
        const cr = cont.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        if (er.width >= 1 && er.height >= 1) setBox({ x: er.left - cr.left, y: er.top - cr.top, w: er.width, h: er.height });
        else setBox(null);
      } else { setBox(null); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [present, selectedId, containerRef]);

  if (!layer || !box || !containerRef.current) return null;
  if (layer.type === "camera") return null; // the camera is steered from its own panel

  const cr = containerRef.current.getBoundingClientRect();
  const stageW = cr.width, stageH = cr.height;
  const meta = LAYER_REGISTRY[layer.type];
  const hidden = (layer as any).enabled === false;

  // Place below the selection (clearing PreviewOverlay's drag-hint caption); flip
  // above when there's no room. Clamp horizontally so it never leaves the stage.
  const below = box.y + box.h + 80 < stageH;
  const top = below ? box.y + box.h + 34 : Math.max(8, box.y - 52);
  const centerX = Math.min(Math.max(box.x + box.w / 2, 92), stageW - 92);

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className="pointer-events-auto absolute flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-line bg-white/92 p-1 backdrop-blur-xl"
        style={{ left: centerX, top, boxShadow: "0 16px 40px -14px rgba(20,28,55,0.4), 0 2px 10px -4px rgba(20,28,55,0.2)", animation: "haloIn 0.22s cubic-bezier(0.22,1,0.36,1) both" }}
        onPointerDown={stop}
      >
        <style>{`@keyframes haloIn{0%{opacity:0;transform:translate(-50%,4px) scale(.94)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>

        {/* Identity chip */}
        <span className="flex items-center gap-1.5 rounded-xl bg-iris/10 px-2.5 py-1.5 text-[11px] font-semibold text-iris">
          <Sparkles size={11} className="text-iris/70" />
          <span className="max-w-[120px] truncate">{(layer as any).name || meta?.label || layer.type}</span>
        </span>

        <span className="mx-0.5 h-5 w-px bg-graphite/15" />

        <HaloBtn label={hidden ? "Show" : "Hide"} onClick={(e) => { stop(e); patchLayer(selectedId!, { enabled: hidden } as any); }}>
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </HaloBtn>
        <HaloBtn label="Duplicate" onClick={(e) => { stop(e); duplicateLayer(selectedId!); }}>
          <Copy size={15} />
        </HaloBtn>
        <HaloBtn label="Delete" danger onClick={(e) => { stop(e); removeLayer(selectedId!); }}>
          <Trash2 size={15} />
        </HaloBtn>
      </div>
    </div>
  );
};

const HaloBtn: React.FC<{ label: string; danger?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }> = ({ label, danger, onClick, children }) => (
  <button
    title={label}
    aria-label={label}
    onClick={onClick}
    className={`group relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${danger ? "text-graphite/55 hover:bg-red-500/15 hover:text-red-300" : "text-graphite/65 hover:bg-graphite/[0.06] hover:text-graphite"}`}
  >
    {children}
    <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-graphite/20 bg-graphite px-1.5 py-0.5 text-[10px] text-white/85 opacity-0 transition-opacity group-hover:opacity-100">{label}</span>
  </button>
);
