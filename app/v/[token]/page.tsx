"use client";

import { use } from "react";
import dynamic from "next/dynamic";

// Client-only: the viewer mounts the Remotion Player + MapLibre.
const SharedViewer = dynamic(() => import("@/v2/ui/SharedViewer").then((m) => m.SharedViewer), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-paper-50 text-sm text-graphite/40">Loading…</div>
  ),
});

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <SharedViewer token={token} />;
}
