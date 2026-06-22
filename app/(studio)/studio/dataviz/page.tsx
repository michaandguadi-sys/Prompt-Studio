"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { DEFAULT_DATAVIZ_SCENE } from "@/lib/defaults";
import { BarChart3 } from "lucide-react";
import { StyleEditor } from "@/components/StyleEditor/StyleEditor";
import { DataVizBuilder } from "@/components/DataVizBuilder/DataVizBuilder";
import { StudioPageShell } from "@/components/StudioPageShell/StudioPageShell";

export default function DataVizStudioPage() {
  const ensureSceneKind = useStudio((s) => s.ensureSceneKind);
  const resetActiveScene = useStudio((s) => s.resetActiveScene);

  React.useEffect(() => {
    ensureSceneKind("dataviz");
  }, [ensureSceneKind]);

  return (
    <StudioPageShell
      title="Data Viz"
      icon={<BarChart3 size={14} />}
      iconColor="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      onReset={() => resetActiveScene(DEFAULT_DATAVIZ_SCENE)}
    >
      <DataVizBuilder />
      <StyleEditor />
    </StudioPageShell>
  );
}
