"use client";

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { MapComposition } from "./MapComposition";
import type { Scene } from "../doc/schema";

/**
 * The whole storyboard as ONE film with per-scene TRANSITIONS — hand-rolled
 * (no extra deps) on plain Remotion Sequences:
 *   cut       — hard cut (no overlap).
 *   fade      — dip to black between scenes (no overlap, one map at a time).
 *   crossfade — scenes overlap and cross-dissolve (two maps during the blend).
 *   slide     — the incoming scene slides in over the outgoing one.
 * crossfade/slide OVERLAP by the transition duration (so total runtime shrinks);
 * cut/fade do not.
 */

const sceneFrames = (sc: Scene): number => {
  const fps = sc.composition?.fps ?? 24;
  return Math.max(1, Math.round((sc.composition?.durationSec ?? 6) * fps));
};

type Placed = { sc: Scene; from: number; frames: number; trans: string; tf: number };

/** Lay every scene on the timeline, overlapping crossfade/slide transitions. */
function placeScenes(scenes: Scene[]): { placed: Placed[]; total: number } {
  const list = (scenes ?? []).filter((s) => s?.composition);
  const fps = list[0]?.composition?.fps ?? 24;
  let cursor = 0;
  const placed: Placed[] = list.map((sc, i) => {
    const frames = sceneFrames(sc);
    const trans = i > 0 ? (sc.transition ?? "cut") : "cut";
    const tf = trans !== "cut" ? Math.max(1, Math.round((sc.transitionDuration ?? 0.6) * fps)) : 0;
    const overlap = trans === "crossfade" || trans === "slide" ? Math.min(tf, frames - 1) : 0;
    const from = i === 0 ? 0 : Math.max(0, cursor - overlap);
    cursor = from + frames;
    return { sc, from, frames, trans, tf };
  });
  return { placed, total: Math.max(1, cursor) };
}

/** Total frames of a story (accounts for overlapping transitions). */
export function storyFrames(scenes: Scene[]): number {
  return placeScenes(scenes).total;
}

const SceneClip: React.FC<{ p: Placed; nextFade: number; watermark?: boolean }> = ({ p, nextFade, watermark }) => {
  const frame = useCurrentFrame(); // 0-based within this scene's Sequence
  const { frames, trans, tf } = p;
  let opacity = 1;
  let tx = 0;
  // ── Entering this scene (its own `trans`, at the START) ──
  if (frame < tf) {
    if (trans === "crossfade" || trans === "fade") opacity *= interpolate(frame, [0, tf], [0, 1], { extrapolateRight: "clamp" });
    if (trans === "slide") tx = interpolate(frame, [0, tf], [100, 0], { extrapolateRight: "clamp" });
  }
  // ── Leaving toward the NEXT scene if that one dips to black (fade) ──
  if (nextFade > 0 && frame > frames - nextFade) {
    opacity *= interpolate(frame, [frames - nextFade, frames], [1, 0], { extrapolateLeft: "clamp" });
  }
  return (
    <AbsoluteFill style={{ background: "#000", opacity, transform: tx ? `translateX(${tx}%)` : undefined }}>
      <MapComposition comp={p.sc.composition} watermark={watermark} />
    </AbsoluteFill>
  );
};

export const StoryComposition: React.FC<{ scenes: Scene[]; watermark?: boolean }> = ({ scenes, watermark }) => {
  const { placed } = placeScenes(scenes);
  if (!placed.length) return null;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {placed.map((p, i) => {
        // If the NEXT scene dips to black, this scene fades out at its tail.
        const next = placed[i + 1];
        const nextFade = next && next.trans === "fade" ? next.tf : 0;
        return (
          <Sequence key={p.sc.id} from={p.from} durationInFrames={p.frames} layout="none">
            <SceneClip p={p} nextFade={nextFade} watermark={watermark} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
