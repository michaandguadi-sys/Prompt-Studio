"use client";

import dynamic from "next/dynamic";
import { EditorLoading } from "@/v2/ui/EditorLoading";

// The editor mounts the Remotion Player (client-only) + Mapbox.
const Editor = dynamic(() => import("@/v2/ui/Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <EditorLoading />,
});

export default function Studio2Page() {
  return <Editor />;
}
