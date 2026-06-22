"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { DEFAULT_LOWERTHIRD_SCENE } from "@/lib/defaults";
import { Users } from "lucide-react";
import { StyleEditor } from "@/components/StyleEditor/StyleEditor";
import { LowerThirdBuilder } from "@/components/LowerThirdBuilder/LowerThirdBuilder";
import { StudioPageShell } from "@/components/StudioPageShell/StudioPageShell";

export default function LowerThirdStudioPage() {
  const ensureSceneKind = useStudio((s) => s.ensureSceneKind);
  const resetActiveScene = useStudio((s) => s.resetActiveScene);

  React.useEffect(() => {
    ensureSceneKind("lowerthird");
  }, [ensureSceneKind]);

  return (
    <StudioPageShell
      title="Lower Third"
      icon={<Users size={14} />}
      iconColor="bg-purple-500/10 border-purple-500/20 text-purple-400"
      onReset={() => resetActiveScene(DEFAULT_LOWERTHIRD_SCENE)}
    >
      <LowerThirdBuilder />
      <StyleEditor />
    </StudioPageShell>
  );
}
