"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { MapScene } from "@/remotion/MapScene";
import { DataVizScene } from "@/remotion/DataVizScene";
import { TitleScene } from "@/remotion/TitleScene";
import { LowerThirdScene } from "@/remotion/LowerThirdScene";
import { QuoteScene } from "@/remotion/QuoteScene";
import type { SceneSpec } from "@/lib/types";

declare global {
  interface Window {
    RENDER_READY: boolean;
    seekToFrame: (n: number) => void;
    CURRENT_FRAME: number;
    TOTAL_FRAMES: number;
    RENDER_ERROR: string | null;
  }
}

export default function RenderPreviewInner() {
  const [spec, setSpec]       = useState<SceneSpec | null>(null);
  const [valid, setValid]     = useState<boolean | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const playerRef             = useRef<PlayerRef>(null);

  // Parse spec + validate key from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const specB64 = params.get("spec");
    const key     = params.get("key");

    if (!specB64 || !key) {
      setError("Missing ?spec= or ?key= params");
      window.RENDER_ERROR = "Missing params";
      return;
    }

    // Validate key
    fetch(`/api/agent/validate?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) { setValid(false); setError("Invalid agent key"); window.RENDER_ERROR = "Invalid agent key"; return; }
        setValid(true);
        try {
          const decoded = atob(specB64);
          const parsed = JSON.parse(decoded) as SceneSpec;
          setSpec(parsed);
        } catch (e: any) {
          setError("Bad spec encoding: " + e.message);
          window.RENDER_ERROR = e.message;
        }
      })
      .catch((e) => { setError(e.message); window.RENDER_ERROR = e.message; });
  }, []);

  // Expose control surface on window for Puppeteer
  useEffect(() => {
    window.RENDER_READY   = false;
    window.CURRENT_FRAME  = 0;
    window.RENDER_ERROR   = null;
    window.seekToFrame = (n: number) => {
      playerRef.current?.seekTo(n);
      window.CURRENT_FRAME = n;
    };
    if (spec) {
      window.TOTAL_FRAMES = Math.round(spec.durationSec * spec.fps);
    }
    const player = playerRef.current;
    if (player) {
      const mark = () => { if (!window.RENDER_READY) window.RENDER_READY = true; };
      player.addEventListener("timeupdate", mark);
      return () => player.removeEventListener("timeupdate", mark);
    }
  }, [spec]);

  const Comp = useMemo(() => {
    if (!spec) return null;
    switch (spec.kind) {
      case "map":        return MapScene;
      case "dataviz":    return DataVizScene;
      case "title":      return TitleScene;
      case "lowerthird": return LowerThirdScene;
      case "quote":      return QuoteScene;
      default:           return MapScene;
    }
  }, [spec?.kind]);

  const inputProps = useMemo(() => spec ? { spec } : {}, [spec]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-red-400 font-mono text-sm p-8 text-center">
        {error}
      </div>
    );
  }

  if (!spec || !Comp) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white/30 text-xs font-mono">Loading…</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black"
      style={{ width: "100vw", height: "100vh" }}
      // Signal ready once map tiles etc. load — MapScene calls continueRender
      // which doesn't propagate to the parent. Instead we listen for the
      // Remotion player's `timeupdate` event (fires when a frame actually renders).
      onLoad={() => { window.RENDER_READY = true; }}
    >
      <Player
        ref={playerRef}
        component={Comp as any}
        inputProps={inputProps as any}
        durationInFrames={Math.max(1, Math.round(spec.durationSec * spec.fps))}
        compositionWidth={spec.width}
        compositionHeight={spec.height}
        fps={spec.fps}
        controls={false}
        loop={false}
        autoPlay={false}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
