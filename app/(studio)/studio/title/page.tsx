"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { DEFAULT_TITLE_SCENE } from "@/lib/defaults";
import { Type } from "lucide-react";
import { StyleEditor } from "@/components/StyleEditor/StyleEditor";
import { TitleBuilder } from "@/components/TitleBuilder/TitleBuilder";
import { StudioPageShell } from "@/components/StudioPageShell/StudioPageShell";

export default function TitleStudioPage() {
  const ensureSceneKind = useStudio((s) => s.ensureSceneKind);
  const resetActiveScene = useStudio((s) => s.resetActiveScene);

  React.useEffect(() => {
    ensureSceneKind("title");
  }, [ensureSceneKind]);

  return (
    <StudioPageShell
      title="Title Card"
      icon={<Type size={14} />}
      iconColor="bg-amber/10 border-amber/20 text-amber/80"
      onReset={() => resetActiveScene(DEFAULT_TITLE_SCENE)}
    >
      <TitleBuilder />
      <StyleEditor />
    </StudioPageShell>
  );
}
