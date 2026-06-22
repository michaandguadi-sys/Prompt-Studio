"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { MapBuilder } from "@/components/MapBuilder/MapBuilder";
import { DataVizBuilder } from "@/components/DataVizBuilder/DataVizBuilder";
import { TitleBuilder } from "@/components/TitleBuilder/TitleBuilder";
import { LowerThirdBuilder } from "@/components/LowerThirdBuilder/LowerThirdBuilder";
import { QuoteBuilder } from "@/components/QuoteBuilder/QuoteBuilder";

/**
 * Renders the builder matching the active scene's kind. Keyed by scene id so
 * switching scenes remounts the builder cleanly (no stale local input state).
 */
export const SceneBuilderSwitch: React.FC = () => {
  const kind = useStudio((s) => s.spec.kind);
  const activeId = useStudio((s) => s.activeId);

  const Builder =
    kind === "map"          ? MapBuilder
    : kind === "dataviz"    ? DataVizBuilder
    : kind === "title"      ? TitleBuilder
    : kind === "lowerthird" ? LowerThirdBuilder
    : QuoteBuilder;

  return <Builder key={activeId} />;
};
