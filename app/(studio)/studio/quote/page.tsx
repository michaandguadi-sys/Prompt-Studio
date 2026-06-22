"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { DEFAULT_QUOTE_SCENE } from "@/lib/defaults";
import { Quote } from "lucide-react";
import { StyleEditor } from "@/components/StyleEditor/StyleEditor";
import { QuoteBuilder } from "@/components/QuoteBuilder/QuoteBuilder";
import { StudioPageShell } from "@/components/StudioPageShell/StudioPageShell";

export default function QuoteStudioPage() {
  const ensureSceneKind = useStudio((s) => s.ensureSceneKind);
  const resetActiveScene = useStudio((s) => s.resetActiveScene);

  React.useEffect(() => {
    ensureSceneKind("quote");
  }, [ensureSceneKind]);

  return (
    <StudioPageShell
      title="Quote Card"
      icon={<Quote size={14} />}
      iconColor="bg-rose-500/10 border-rose-500/20 text-rose-400"
      onReset={() => resetActiveScene(DEFAULT_QUOTE_SCENE)}
    >
      <QuoteBuilder />
      <StyleEditor />
    </StudioPageShell>
  );
}
