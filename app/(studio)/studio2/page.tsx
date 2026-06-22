"use client";

import dynamic from "next/dynamic";

// The editor mounts the Remotion Player (client-only) + Mapbox.
const Editor = dynamic(() => import("@/v2/ui/Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-graphite/40 text-sm">Loading Mapanisy editor…</div>
  ),
});

export default function Studio2Page() {
  return <Editor />;
}
