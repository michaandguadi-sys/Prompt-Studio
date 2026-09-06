"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Frame, Video } from "lucide-react";
import { MapComposition } from "../render/MapComposition";
import { StoryComposition, storyFrames } from "../render/StoryComposition";
import { dimsFor } from "../doc/schema";
import { useEditor } from "../store/editor";
import { useTier } from "@/hooks/useTier";
import { PreviewOverlay } from "./PreviewOverlay";
import { LayerHalo } from "./LayerHalo";
import { CameraGizmo } from "./CameraGizmo";
import { CameraSearchStrip } from "./CameraSearchStrip";

type SafeZoneMode = "off" | "title" | "social";
const SAFEZONE_KEY = "mapanisy-safezones";
const nextZoneMode: Record<SafeZoneMode, SafeZoneMode> = { off: "title", title: "social", social: "off" };
const zoneLabel: Record<SafeZoneMode, string> = {
  off: "Guides off",
  title: "Title-safe guides",
  social: "Social UI zones",
};

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

  // Safe-zone guides — show where platform UI covers the frame before posting.
  const [safeZones, setSafeZones] = useState<SafeZoneMode>(() => {
    if (typeof window === "undefined") return "off";
    const v = localStorage.getItem(SAFEZONE_KEY);
    return v === "title" || v === "social" ? v : "off";
  });
  useEffect(() => { localStorage.setItem(SAFEZONE_KEY, safeZones); }, [safeZones]);

  // "Adjust camera" — overlays the LIVE preview with the camera gizmo (compass
  // ring, tilt/zoom bars, drag-to-pan). Framing the shot and pressing Add
  // keyframe pins a full camera pose at the playhead; scrub + adjust + add
  // another and the camera animates between them. See CameraGizmo.
  const [cameraEdit, setCameraEdit] = useState(false);
  // Whole-story playback swaps out the scene Player the gizmo drives — leave
  // camera mode so it never lingers over a preview it can't control.
  useEffect(() => { if (playStory) setCameraEdit(false); }, [playStory]);

  // Click-to-select on the preview: geometric hit-test against rendered overlay
  // elements (they're pointer-events:none, so we test bounding rects and pick the
  // smallest one under the cursor). Makes editing direct — click the thing, then
  // drag/scale/rotate it. Editing handles stopPropagation, so they're unaffected.
  //
  // Tapping the canvas NEVER toggles playback (the Player has clickToPlay off).
  // Instead we prioritise editing: hit an element → select it AND pause, so the
  // frame holds still and the tapped element is ready to adjust.
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
    if (hit) { select(hit); playerRef.current?.pause(); } // freeze the frame to edit
  };

  const sceneFrames = Math.max(1, Math.round(comp.durationSec * fps));
  const totalFrames = useMemo(() => storyFrames(scenes), [scenes]);
  const sceneProps = useMemo(() => ({ comp, watermark }), [comp, watermark]);
  const storyProps = useMemo(() => ({ scenes, watermark }), [scenes, watermark]);

  // Sync the scene Player's playback frame → store (drives the timeline playhead)
  // and register a seek fn so the timeline ruler can scrub the preview.
  const playerRef = useRef<PlayerRef>(null);
  const storyPlayerRef = useRef<PlayerRef>(null);
  const setPlayheadFrame = useEditor((s) => s.setPlayheadFrame);
  const registerSeek = useEditor((s) => s.registerSeek);

  // We own the spacebar (both Players have spaceKeyToPlayOrPause off) so plain
  // Space = play/pause on the active player, leaving ⇧Space free for the
  // quick-add element picker. Works even when the Player isn't focused, and
  // never fires while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const p = (playStory ? storyPlayerRef : playerRef).current;
      if (!p) return;
      e.preventDefault();
      p.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playStory]);
  useEffect(() => {
    const p = playerRef.current;
    if (playStory || !p) return;
    const onFrame = (e: { detail: { frame: number } }) => setPlayheadFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    registerSeek((f) => playerRef.current?.seekTo(f));
    return () => { p.removeEventListener("frameupdate", onFrame); registerSeek(null); };
  }, [playStory, setPlayheadFrame, registerSeek]);

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

        {/* Camera-mode search — ABOVE the preview window, never floating on the map. */}
        {cameraEdit && !playStory && (
          <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2">
            <CameraSearchStrip />
          </div>
        )}

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
              ref={storyPlayerRef}
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
              spaceKeyToPlayOrPause={false}
              style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
            />
          ) : (
            <>
              <Player
                ref={playerRef}
                key={comp.aspect}
                component={MapComposition as any}
                inputProps={sceneProps}
                durationInFrames={sceneFrames}
                compositionWidth={width}
                compositionHeight={height}
                fps={fps}
                controls
                loop
                autoPlay
                clickToPlay={false}
                spaceKeyToPlayOrPause={false}
                style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
              />
              {/* Camera mode overlays the LIVE player with the gizmo; element
                  handles + guides step aside so only the camera controls show. */}
              {cameraEdit ? (
                <CameraGizmo onExit={() => setCameraEdit(false)} />
              ) : (
                <>
                  {/* Direct-manipulation handles only make sense while editing one scene. */}
                  <PreviewOverlay containerRef={stageRef} />
                  {/* The Halo — contextual quick-actions blooming at the selected element. */}
                  <LayerHalo containerRef={stageRef} />
                  {safeZones !== "off" && <SafeZoneGuides mode={safeZones} vertical={comp.aspect === "9:16"} />}
                </>
              )}
            </>
          )}
        </div>

        {/* Adjust-camera toggle — enter the live viewfinder to frame the shot. */}
        {!playStory && !cameraEdit && (
          <button
            onClick={() => { playerRef.current?.pause(); setCameraEdit(true); }}
            title="Frame the shot on a live map — scroll to zoom, drag to orbit & tilt"
            className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-lg border border-line/60 bg-paper/70 px-2.5 py-1.5 text-[10.5px] font-medium text-graphite-muted backdrop-blur transition-colors hover:text-graphite"
          >
            <Video size={12} /> Adjust camera
          </button>
        )}

        {/* Safe-zone toggle — floats over the drafting table, never the frame. */}
        {!cameraEdit && (
          <button
            onClick={() => setSafeZones((m) => nextZoneMode[m])}
            title={`${zoneLabel[safeZones]} — click to cycle (off → title-safe → social UI)`}
            className={`absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-medium backdrop-blur transition-colors ${
              safeZones === "off"
                ? "border-line/60 bg-paper/70 text-graphite-muted hover:text-graphite"
                : "border-iris/40 bg-iris/10 text-iris"
            }`}
          >
            <Frame size={12} /> {zoneLabel[safeZones]}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Safe-zone guides drawn over the preview (never rendered into the video).
 *
 * "title"  — broadcast convention: action-safe (5% inset, dashed) and
 *            title-safe (10% inset, solid) rectangles. Keep text inside.
 * "social" — where platform UI actually covers the frame. On 9:16 that's the
 *            TikTok / Reels / Shorts union: top status area, right-side action
 *            rail (like/comment/share), bottom caption + progress band. On
 *            16:9 / 1:1 it's the subtitle band platforms draw at the bottom.
 */
const SafeZoneGuides: React.FC<{ mode: "title" | "social"; vertical: boolean }> = ({ mode, vertical }) => (
  <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
    {mode === "title" ? (
      <>
        <div className="absolute rounded-lg border border-dashed border-white/40" style={{ inset: "5%" }} />
        <div className="absolute rounded-lg border border-white/60" style={{ inset: "10%" }} />
        <span className="absolute left-[10.5%] top-[10.5%] rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white/80">
          TITLE SAFE
        </span>
      </>
    ) : vertical ? (
      <>
        {/* Top: status bar + camera controls */}
        <div className="absolute inset-x-0 top-0 bg-red-500/[0.14]" style={{ height: "8%" }} />
        {/* Right rail: like / comment / share / profile buttons (lower half) */}
        <div className="absolute right-0 bg-red-500/[0.14]" style={{ width: "15%", top: "42%", bottom: "10%" }} />
        {/* Bottom: caption, sound, progress bar */}
        <div className="absolute inset-x-0 bottom-0 bg-red-500/[0.14]" style={{ height: "17%" }} />
        <span className="absolute bottom-[18%] left-1/2 -translate-x-1/2 rounded bg-black/55 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white/85">
          RED = COVERED BY TIKTOK / REELS / SHORTS UI
        </span>
      </>
    ) : (
      <>
        {/* Landscape/square: platform subtitle + control band at the bottom */}
        <div className="absolute inset-x-0 bottom-0 bg-red-500/[0.14]" style={{ height: "12%" }} />
        <span className="absolute bottom-[13%] left-1/2 -translate-x-1/2 rounded bg-black/55 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white/85">
          RED = SUBTITLES / PLAYER CONTROLS
        </span>
      </>
    )}
  </div>
);
