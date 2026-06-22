"use client";

import React from "react";
import { Series } from "remotion";
import { MapScene } from "./MapScene";
import { DataVizScene } from "./DataVizScene";
import { TitleScene } from "./TitleScene";
import { LowerThirdScene } from "./LowerThirdScene";
import { QuoteScene } from "./QuoteScene";
import { Watermark } from "./Watermark";
import type { SceneSpec } from "@/lib/types";

/** Dispatch a single SceneSpec to its renderer by kind. */
export const SceneRenderer: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  switch (spec.kind) {
    case "map":
      return <MapScene spec={spec} />;
    case "dataviz":
      return <DataVizScene spec={spec} />;
    case "title":
      return <TitleScene spec={spec} />;
    case "lowerthird":
      return <LowerThirdScene spec={spec} />;
    case "quote":
      return <QuoteScene spec={spec} />;
    default:
      return <MapScene spec={spec} />;
  }
};

/** Frame count for one scene. */
export const sceneFrames = (s: SceneSpec): number =>
  Math.max(1, Math.round(s.durationSec * s.fps));

/** Total frame count for a whole project (sum of scenes). */
export const projectFrames = (scenes: SceneSpec[]): number =>
  Math.max(1, scenes.reduce((sum, s) => sum + sceneFrames(s), 0));

/**
 * Plays an ordered list of scenes back-to-back. Each scene's reveal timing
 * is relative to its own frame 0 — `<Series>` resets `useCurrentFrame()` per
 * sequence, so individual scene animations are untouched. All scenes share
 * the project aspect, so one composition width/height covers the sequence.
 */
export const SequencePreview: React.FC<{ scenes: SceneSpec[]; watermark?: boolean }> = ({
  scenes,
  watermark,
}) => (
  <>
    <Series>
      {scenes.map((s, i) => (
        <Series.Sequence key={s.id ?? i} durationInFrames={sceneFrames(s)}>
          <SceneRenderer spec={s} />
        </Series.Sequence>
      ))}
    </Series>
    {watermark && <Watermark />}
  </>
);
