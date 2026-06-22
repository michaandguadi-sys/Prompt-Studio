"use client";

import React, { useState } from "react";
import { MonitorSmartphone, Loader2, Check } from "lucide-react";
import { useEditor } from "../store/editor";

/**
 * Render 4K — enqueues the project to the user's local Render Agent
 * (the MapanisyV2 Remotion composition). Falls back with a clear message when
 * no agent is connected or the free animation is used up.
 */
export const RenderButton: React.FC = () => {
  const project = useEditor((s) => s.project);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const multi = sceneCount > 1;

  const render = async () => {
    if (state === "busy") return;
    setState("busy"); setMsg(null);
    try {
      const r = await fetch("/api/v2/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Multi-scene → render the WHOLE story (every scene back-to-back).
        body: JSON.stringify({ project, story: multi, settings: { scale: 1, videoBitrate: "40M", x264Preset: "slow" } }),
      });
      const d = await r.json();
      if (r.status === 409) { setMsg("Connect your Render Agent (Dashboard) for 4K."); setState("idle"); return; }
      if (r.status === 402) { setMsg(d.message ?? "Upgrade to render."); setState("idle"); return; }
      if (!r.ok) { setMsg(d.error ?? "Render failed."); setState("idle"); return; }
      setState("sent"); setMsg(multi ? `Sent your ${sceneCount}-scene story to the Render Agent.` : "Sent to your Render Agent — track it in the queue.");
      setTimeout(() => { setState("idle"); setMsg(null); }, 4000);
    } catch { setMsg("Network error."); setState("idle"); }
  };

  return (
    <div className="relative">
      <button
        onClick={render}
        title={multi ? "Render the whole story (all scenes) in 4K via your Render Agent" : "Render full 4K on your machine via the Render Agent"}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform"
      >
        {state === "busy" ? <Loader2 size={13} className="animate-spin" /> : state === "sent" ? <Check size={13} className="text-emerald-400" /> : <MonitorSmartphone size={13} />}
        {multi ? `Render story · ${sceneCount}` : "Render 4K"}
      </button>
      {msg && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg glass-light px-3 py-2 text-[11px] text-graphite/70 z-30">{msg}</div>
      )}
    </div>
  );
};
