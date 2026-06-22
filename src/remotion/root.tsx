/**
 * Remotion root — registers all compositions for the Render Agent.
 *
 * Built into public/remotion-bundle/ via:
 *   npx remotion bundle src/remotion/root.tsx --out public/remotion-bundle
 *
 * The agent downloads this bundle URL and calls renderMedia() against it.
 * calculateMetadata derives dimensions/duration from the spec so one
 * composition handles all scene types and all resolutions.
 */

import { Composition, registerRoot } from "remotion";
import React from "react";
import { MapScene } from "./MapScene";
import { DataVizScene } from "./DataVizScene";
import { TitleScene } from "./TitleScene";
import { LowerThirdScene } from "./LowerThirdScene";
import { QuoteScene } from "./QuoteScene";
import { SequencePreview, projectFrames, sceneFrames } from "./SceneRenderer";
import { Watermark } from "./Watermark";
import type { SceneSpec } from "@/lib/types";
import { DEFAULT_MAP_SCENE } from "@/lib/defaults";
import { dimsFor, aspectOf } from "@/lib/aspect";
import { MapComposition } from "@/v2/render/MapComposition";
import { StoryComposition, storyFrames } from "@/v2/render/StoryComposition";
import { createDefaultProject } from "@/v2/doc/factory";
import { dimsFor as v2DimsFor } from "@/v2/doc/schema";

const V2_DEFAULT_COMPOSITION = createDefaultProject().composition;
const V2_DEFAULT_SCENES = [{ id: "scn_default", name: "Scene 1", narration: "", composition: V2_DEFAULT_COMPOSITION }];

/** Single dynamic composition — kind is dispatched from spec.kind. */
const DynamicScene: React.FC<{ spec: SceneSpec; watermark?: boolean }> = ({ spec, watermark }) => {
  const inner = (() => {
    switch (spec.kind) {
      case "map":        return <MapScene spec={spec} />;
      case "dataviz":    return <DataVizScene spec={spec} />;
      case "title":      return <TitleScene spec={spec} />;
      case "lowerthird": return <LowerThirdScene spec={spec} />;
      case "quote":      return <QuoteScene spec={spec} />;
      default:           return <MapScene spec={spec} />;
    }
  })();
  return (
    <>
      {inner}
      {watermark && <Watermark />}
    </>
  );
};

export const RemotionRoot: React.FC = () => (
  <>
    {/* ── Mapanisy v2 — the layer-stack composition (the future default) ── */}
    <Composition
      id="MapanisyV2"
      component={MapComposition as any}
      durationInFrames={144}
      fps={24}
      width={3840}
      height={2160}
      defaultProps={{ comp: V2_DEFAULT_COMPOSITION, watermark: false } as any}
      calculateMetadata={({ props }: any) => {
        const c = props.comp;
        if (!c?.durationSec || !c?.fps) return {};
        return { durationInFrames: Math.max(1, Math.round(c.durationSec * c.fps)), fps: c.fps, ...v2DimsFor(c.aspect) };
      }}
    />

    {/* ── Mapanisy STORY — every scene rendered back-to-back as one film ── */}
    <Composition
      id="MapanisyStory"
      component={StoryComposition as any}
      durationInFrames={144}
      fps={24}
      width={3840}
      height={2160}
      defaultProps={{ scenes: V2_DEFAULT_SCENES, watermark: false } as any}
      calculateMetadata={({ props }: any) => {
        const scenes = props.scenes;
        if (!Array.isArray(scenes) || !scenes.length) return {};
        const c0 = scenes[0].composition;
        return { durationInFrames: storyFrames(scenes), fps: c0?.fps ?? 24, ...v2DimsFor(c0?.aspect ?? "16:9") };
      }}
    />

    {/* Single scene — used by the per-kind export path. */}
    <Composition
      id="PromptStudioScene"
      component={DynamicScene}
      // Defaults — overridden by calculateMetadata when the agent supplies inputProps
      durationInFrames={240}
      fps={24}
      width={3840}
      height={2160}
      defaultProps={{ spec: DEFAULT_MAP_SCENE, watermark: false }}
      calculateMetadata={({ props }) => {
        const s = props.spec;
        if (!s?.fps || !s?.durationSec) return {};
        const dims = s.width && s.height ? { width: s.width, height: s.height } : dimsFor(aspectOf(s));
        return {
          durationInFrames: Math.max(1, Math.round(s.durationSec * s.fps)),
          fps:    s.fps,
          ...dims,
        };
      }}
    />

    {/* Multi-scene sequence — the whole timeline rendered back-to-back. */}
    <Composition
      id="PromptStudioSequence"
      component={SequencePreview}
      durationInFrames={240}
      fps={24}
      width={3840}
      height={2160}
      defaultProps={{ scenes: [DEFAULT_MAP_SCENE] as SceneSpec[], watermark: false }}
      calculateMetadata={({ props }) => {
        const scenes = props.scenes;
        if (!scenes?.length) return {};
        const first = scenes[0];
        const dims = first.width && first.height
          ? { width: first.width, height: first.height }
          : dimsFor(aspectOf(first));
        return {
          durationInFrames: projectFrames(scenes),
          fps: first.fps,
          ...dims,
        };
      }}
    />
  </>
);

// sceneFrames re-exported for render-side callers that compute per-scene offsets.
export { sceneFrames };

registerRoot(RemotionRoot);
