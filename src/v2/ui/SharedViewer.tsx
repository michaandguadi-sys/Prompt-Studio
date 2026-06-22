"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Player } from "@remotion/player";
import { Loader2, MapPin, ArrowUpRight } from "lucide-react";
import { MapComposition } from "../render/MapComposition";
import { StoryComposition, storyFrames } from "../render/StoryComposition";
import { dimsFor, type Project } from "../doc/schema";

/**
 * Public, read-only viewer for a shared project. Reuses the exact Remotion
 * compositions the editor previews, so a share link looks identical to what the
 * author saw — just without any editing chrome, on a cinematic dark stage with a
 * subtle "Made with Mapanisy" attribution that doubles as a growth loop.
 */
export const SharedViewer: React.FC<{ token: string }> = ({ token }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This share link is no longer available." : "Couldn’t load this animation.");
        return r.json();
      })
      .then((d) => { if (alive) setProject(d.project as Project); })
      .catch((e) => { if (alive) setError(e.message || "Something went wrong."); });
    return () => { alive = false; };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-paper-50 text-graphite">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#6E7BFF] to-[#9b5cff] shadow-[0_0_24px_rgba(110,123,255,0.45)]">
            <span className="text-[13px] font-black tracking-tight">M</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-graphite/85 group-hover:text-graphite">Mapanisy</span>
        </Link>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-graphite/[0.04] px-3.5 py-1.5 text-xs font-semibold text-graphite/80 backdrop-blur transition-colors hover:border-graphite/25 hover:text-graphite"
        >
          Create your own <ArrowUpRight size={13} />
        </Link>
      </header>

      {/* Stage */}
      <main className="relative flex flex-1 items-center justify-center px-4 pb-2 sm:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[55%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6E7BFF]/[0.10] blur-[120px]" />
        </div>
        {error ? (
          <div className="z-10 max-w-sm text-center">
            <MapPin size={28} className="mx-auto mb-3 text-graphite/40" />
            <p className="text-sm text-graphite/65">{error}</p>
            <Link href="/home" className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#6E7BFF] to-[#9b5cff] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_24px_rgba(110,123,255,0.4)]">
              Make a map animation <ArrowUpRight size={13} />
            </Link>
          </div>
        ) : !project ? (
          <div className="z-10 flex items-center gap-2 text-graphite/50">
            <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Loading animation…</span>
          </div>
        ) : (
          <ViewerStage project={project} />
        )}
      </main>

      {/* Footer attribution / growth loop */}
      <footer className="flex flex-col items-center gap-1 px-5 py-5 text-center sm:py-6">
        {project && <div className="text-sm font-medium text-graphite/80">{project.name}</div>}
        <Link href="/" className="text-[11px] uppercase tracking-[0.22em] text-graphite/45 transition-colors hover:text-graphite/60">
          Made with Mapanisy · The AI Story Map Editor
        </Link>
      </footer>
    </div>
  );
};

/** Mounts the Player at the project's native aspect, fit to the viewport. */
const ViewerStage: React.FC<{ project: Project }> = ({ project }) => {
  const comp = project.composition;
  const scenes = project.scenes ?? [];
  const multi = scenes.length > 1;
  const { width, height } = dimsFor(comp.aspect);
  const portrait = height > width;

  const sceneFrames = Math.max(1, Math.round(comp.durationSec * comp.fps));
  const totalFrames = useMemo(() => storyFrames(scenes), [scenes]);

  const sceneProps = useMemo(() => ({ comp, watermark: false }), [comp]);
  const storyProps = useMemo(() => ({ scenes, watermark: false }), [scenes]);

  return (
    <div
      className="z-10 overflow-hidden rounded-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
      style={{
        aspectRatio: `${width}/${height}`,
        width: portrait ? "auto" : "100%",
        height: portrait ? "min(78vh, 100%)" : "auto",
        maxWidth: "min(1200px, 100%)",
        maxHeight: "78vh",
      }}
    >
      {multi ? (
        <Player
          component={StoryComposition as any}
          inputProps={storyProps}
          durationInFrames={totalFrames}
          compositionWidth={width}
          compositionHeight={height}
          fps={comp.fps}
          controls
          loop
          autoPlay
          clickToPlay
          style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
        />
      ) : (
        <Player
          component={MapComposition as any}
          inputProps={sceneProps}
          durationInFrames={sceneFrames}
          compositionWidth={width}
          compositionHeight={height}
          fps={comp.fps}
          controls
          loop
          autoPlay
          clickToPlay
          style={{ width: "100%", height: "100%", background: "#000", display: "block" }}
        />
      )}
    </div>
  );
};
