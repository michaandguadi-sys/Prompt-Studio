"use client";

import React, { useMemo, useRef } from "react";
import { Player } from "@remotion/player";
import { MapComposition } from "../render/MapComposition";
import { StoryComposition, storyFrames } from "../render/StoryComposition";
import { dimsFor } from "../doc/schema";
import { useEditor } from "../store/editor";
import { useTier } from "@/hooks/useTier";
import { PreviewOverlay } from "./PreviewOverlay";
import { LayerHalo } from "./LayerHalo";

/** Center canvas — plays the active scene (editable) OR the whole story sequence. */
export const Canvas: React.FC = () => {
  const comp = useEditor((s) => s.project.composition);
  const scenes = useEditor((s) => s.project.scenes);
  const { watermark } = useTier(); // free tier shows the Mapanisy watermark
  const storyOn = useEditor((s) => s.playStory); // toggled from the storyboard strip
  const select = useEditor((s) => s.select);
  const multi = scenes.length > 1;
  const playStory = storyOn && multi;

  const { width, height } = dimsFor(comp.aspect);
  const fps = comp.fps;
  const stageRef = useRef<HTMLDivElement>(null);

  // Click-to-select on the preview: geometric hit-test against rendered overlay
  // elements (they're pointer-events:none, so we test bounding rects and pick the
  // smallest one under the cursor). Makes editing direct — click the thing, then
  // drag/scale/rotate it. Editing handles stopPropagation, so they're unaffected.
  const pickAt = (e: React.PointerEvent) => {
    if (playStory) return; // story playback isn't per-layer editable
    const stage = stageRef.current;
    if (!stage) return;
    const x = e.clientX, y = e.clientY;
    let hit: string | null = null, hitArea = Infinity;
    stage.querySelectorAll<HTMLElement>("[data-layer-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (area < hitArea) { hitArea = area; hit = el.getAttribute("data-layer-id"); }
      }
    });
    if (hit) select(hit);
  };

  const sceneFrames = Math.max(1, Math.round(comp.durationSec * fps));
  const totalFrames = useMemo(() => storyFrames(scenes), [scenes]);
  const sceneProps = useMemo(() => ({ comp, watermark }), [comp, watermark]);
  const storyProps = useMemo(() => ({ scenes, watermark }), [scenes, watermark]);

  return (
    <div className="relative flex h-full flex-col bg-paper-50">
      {/* Chrome is docked (rails + dock), so the canvas just needs breathing room.
          `container-type: size` makes 100cqw/100cqh = this inner box, so the
          stage fits the aspect within whatever space the rails leave. */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6" style={{ containerType: "size" }}>
        {/* Faint dot-grid texture around the stage — a subtle "drafting table". */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            maskImage: "radial-gradient(80% 80% at 50% 50%, transparent 38%, #000 90%)",
            WebkitMaskImage: "radial-gradient(80% 80% at 50% 50%, transparent 38%, #000 90%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="h-[55%] w-[66%] rounded-full opacity-60 blur-[120px]" style={{ background: "radial-gradient(circle, rgba(110,123,255,0.12), transparent 70%)" }} />
        </div>
        <div
          ref={stageRef}
          onPointerDown={pickAt}
          className="relative overflow-hidden rounded-2xl ring-1 ring-white/[0.08]"
          data-stage
          style={{
            aspectRatio: `${width}/${height}`,
            // Fit the box of ratio width/height inside the area, centered, never
            // overflowing either axis: width = min(full width, height·ratio).
            width: `min(100cqw, calc(100cqh * ${width} / ${height}))`,
            maxWidth: "min(1400px, 100cqw)",
            maxHeight: "100cqh",
            boxShadow: "0 32px 80px -28px rgba(0,0,0,0.6), 0 6px 20px -8px rgba(0,0,0,0.4)",
            animation: "stageReveal 0.7s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {playStory ? (
            <Player
              key={`story-${scenes.length}-${totalFrames}`}
              component={StoryComposition as any}
              inputProps={storyProps}
              durationInFrames={totalFrames}
              compositionWidth={width}
              compositionHeight={height}
              fps={fps}
              controls
              loop
              autoPlay
              style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
            />
          ) : (
            <>
              <Player
                key={`${comp.aspect}-${comp.layers.length}`}
                component={MapComposition as any}
                inputProps={sceneProps}
                durationInFrames={sceneFrames}
                compositionWidth={width}
                compositionHeight={height}
                fps={fps}
                controls
                loop
                autoPlay
                style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
              />
              {/* Direct-manipulation handles only make sense while editing one scene. */}
              <PreviewOverlay containerRef={stageRef} />
              {/* The Halo — contextual quick-actions blooming at the selected element. */}
              <LayerHalo containerRef={stageRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
