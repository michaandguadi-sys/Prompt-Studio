"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { EditorLoading } from "@/v2/ui/EditorLoading";
import { useEditor } from "@/v2/store/editor";
import { createDefaultProject } from "@/v2/doc/factory";

// The editor mounts the Remotion Player (client-only) + Mapbox.
const Editor = dynamic(() => import("@/v2/ui/Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <EditorLoading />,
});

function StudioInner() {
  const sp = useSearchParams();
  // "Start with a blank map" must mean BLANK: without this, the editor
  // rehydrates the last persisted project from localStorage instead.
  useEffect(() => {
    if (sp.get("blank") === "1") {
      useEditor.getState().load(createDefaultProject());
    }
  }, [sp]);
  return <Editor />;
}

export default function Studio2Page() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <StudioInner />
    </Suspense>
  );
}
