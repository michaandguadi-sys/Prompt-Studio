"use client";

import React, { useMemo, useState } from "react";
import { Clapperboard, Loader2, ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Trash2, GripVertical } from "lucide-react";
import { SIGNATURE_STYLES, signatureStyleById } from "@/lib/presets/signatureStyles";
import { fontStack } from "@/v2/doc/themes";
import { loadAISettings } from "@/v2/ui/SettingsModal";

/**
 * The Storyboard Review — the moment between "storyboard it" and the editor.
 * The AI's beat breakdown is shown as a designed filmstrip: rename beats,
 * rewrite narration, reorder, cut, set the runtime — then the film is rebuilt
 * with those decisions and opened in the editor. The screen itself is graded
 * in the chosen Signature Style so it FEELS like your film already.
 */

type Beat = { stop: string; title: string; narration: string };

export type ReviewData = {
  project: any;
  plan: any;
  narration: string[];
  styleId: string;
  idea: string;
  /** The fact-checked Director brief (thesis, facts+confidence, caveats, disputed). */
  verification?: any;
  /** The deterministic story framework's storyboard (pattern + ordered beats).
   *  Used to enrich the beat breakdown when the plan itself is thin (e.g. the
   *  no-AI heuristic path) so the review always shows a coherent storyline. */
  storyboard?: { pattern?: string; scenes?: { n: number; purpose: string; kind: string; locations: string[] }[] } | null;
  /** Single-scene "Director's cut": no story rebuild on open — the runtime
   *  slider just sets the scene duration, narration is carried through. */
  single?: boolean;
};

/** Confidence pill colour for a researched fact. */
function confColor(c: string): string {
  return c === "high" ? "#34d399" : c === "medium" ? "#fbbf24" : "#fb7185";
}

function beatsFromPlan(plan: any, narration: string[], storyboard?: ReviewData["storyboard"]): Beat[] {
  const stops: string[] = Array.isArray(plan?.cameraStops) ? plan.cameraStops : [];
  const titles: any[] = (plan?.layers ?? []).filter((l: any) => l?.kind === "title");
  const sbScenes = Array.isArray(storyboard?.scenes) ? storyboard!.scenes : [];
  // Prefer the richest source for the beat COUNT — the framework storyboard is
  // a complete, ordered structure even when the plan came back thin (no-AI path).
  const n = Math.max(stops.length, titles.length, narration.length, sbScenes.length, 1);
  return Array.from({ length: n }, (_, i) => {
    const sb = sbScenes[i];
    // The storyboard beat names the place + purpose; the plan's stops/titles win
    // when present (they reflect the AI's specific geography).
    const stop = stops[i] ?? sb?.locations?.[0] ?? titles[i]?.text ?? plan?.focus ?? "";
    const title = (titles[i]?.text ?? stops[i] ?? sb?.purpose ?? plan?.focus ?? "Beat").toString();
    return { stop, title, narration: narration[i] ?? "" };
  });
}

export const StoryboardReview: React.FC<{
  data: ReviewData;
  onClose: () => void;
  onOpen: (project: any, narration: string[]) => void;
}> = ({ data, onClose, onOpen }) => {
  const sig = signatureStyleById(data.styleId) ?? null;
  const sw = sig?.swatches ?? ["#05060e", "#1a1d2e", "#6E7BFF"];
  const font = fontStack(sig?.fontDisplay ?? "Inter");
  const [beats, setBeats] = useState<Beat[]>(() => beatsFromPlan(data.plan, data.narration, data.storyboard));
  const [runtime, setRuntime] = useState<number>(Math.max(8, Math.min(60, Math.round(data.plan?.durationSec ?? 16))));
  const [dirty, setDirty] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (fn: (b: Beat[]) => Beat[]) => { setBeats(fn); setDirty(true); };
  const move = (i: number, d: -1 | 1) => edit((b) => {
    const j = i + d; if (j < 0 || j >= b.length) return b;
    const next = [...b]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const perBeat = useMemo(() => (beats.length ? runtime / beats.length : runtime), [beats.length, runtime]);

  const open = async () => {
    if (building) return;
    // Single-scene cut: never re-author into a story — just bake the runtime
    // into the scene duration(s) and open. Narration carries through.
    if (data.single) {
      const proj = data.project;
      try {
        if (proj?.composition) proj.composition.durationSec = runtime;
        if (Array.isArray(proj?.scenes)) for (const s of proj.scenes) if (s?.composition) s.composition.durationSec = runtime;
      } catch { /* keep original duration */ }
      onOpen(proj, beats.map((b) => b.narration));
      return;
    }
    // Untouched → open what was already generated.
    if (!dirty && runtime === Math.round(data.plan?.durationSec ?? 16)) { onOpen(data.project, beats.map((b) => b.narration)); return; }
    setBuilding(true); setError(null);
    try {
      // Re-author the PLAN with the user's review decisions, bake the chosen
      // Signature Style in (directPlan skips server-side style application),
      // and rebuild deterministically via the existing plan passthrough.
      const stops = beats.map((b) => b.stop || b.title).filter(Boolean);
      const others = (data.plan?.layers ?? [])
        .filter((l: any) => l?.kind !== "title")
        .map((l: any) => (l?.kind === "connections" && Array.isArray(l.places) ? { ...l, places: stops } : l));
      const titles = beats.map((b) => ({ kind: "title", text: (b.title || b.stop).toUpperCase().slice(0, 24), template: "kicker", position: "bottom" }));
      const plan: any = {
        ...data.plan,
        durationSec: runtime,
        cameraStops: stops,
        focus: stops[stops.length - 1] ?? data.plan?.focus,
        narration: beats.map((b) => b.narration),
        layers: [...others, ...titles],
      };
      if (sig) {
        plan.palette = sig.palette; plan.fontDisplay = sig.fontDisplay; plan.fontBody = sig.fontBody;
        plan.look = { ...(plan.look ?? {}), ...sig.look };
        if (sig.basemapStyle && plan.basemapStyle !== "historical") plan.basemapStyle = sig.basemapStyle;
      }
      const r = await fetch("/api/v2/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, mode: "story", ai: loadAISettings() ?? undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d?.project) { setError(d?.error ?? "Couldn't rebuild — opening the original instead."); setBuilding(false); return; }
      onOpen(d.project, beats.map((b) => b.narration));
    } catch { setError("Network error."); setBuilding(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      {/* Cinematic backdrop graded in the chosen style */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 0%, ${sw[1]}55 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, ${sw[2]}22 0%, transparent 55%), ${sw[0]}f2` }} onClick={onClose} />
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 130%)" }} />

      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
              <Clapperboard size={12} style={{ color: sw[2] }} /> {data.single ? "Director's cut" : "Storyboard"}
            </div>
            <div className="truncate text-2xl font-bold text-white" style={{ fontFamily: font, textShadow: "0 2px 18px rgba(0,0,0,0.6)" }}>
              {(data.plan?.title ?? (data.single ? "Your animation" : "Your story")).toString().toUpperCase()}
            </div>
            <div className="mt-1 text-[11px] text-white/45">
              {data.storyboard?.pattern && !data.single && <><span style={{ color: sw[2] }}>{data.storyboard.pattern}</span> · </>}
              {data.single ? <>1 scene · {runtime}s</> : <>{beats.length} beats · ~{Math.round(perBeat)}s each</>} {sig ? <>· <span style={{ color: sw[2] }}>{sig.name}</span></> : "· Director's choice"}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-white/30 hover:text-white">
            <ArrowLeft size={11} className="mr-1 inline" /> Adjust prompt
          </button>
        </div>

        {/* ── Director's brief: the fact-checked journalism, shown BEFORE building ── */}
        {data.verification && (data.verification.thesis || data.verification.facts?.length) && (
          <div className="mx-6 mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Director&apos;s brief</span>
              {data.verification.provider === "ai"
                ? <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold" style={{ borderColor: `${sw[2]}66`, color: sw[2] }}>✦ AI-researched</span>
                : <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">⚡ Built-in logic</span>}
            </div>
            {data.verification.thesis && <div className="text-[13px] leading-snug text-white/85">“{data.verification.thesis}”</div>}
            {(data.verification.angle || data.verification.archetype) && (
              <div className="mt-1 text-[11px] text-white/45">{[data.verification.archetype, data.verification.angle].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")}</div>
            )}
            {Array.isArray(data.verification.facts) && data.verification.facts.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {data.verification.facts.slice(0, 6).map((f: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: confColor(f.confidence ?? "low") }} title={`${f.confidence ?? "unrated"} confidence`} />
                    <span className="text-white/70">{f.claim}{f.source && <span className="text-white/40"> — {f.source}</span>}</span>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(data.verification.disputed) && data.verification.disputed.filter(Boolean).length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-[10.5px] text-amber-200/80">⚖ {data.verification.disputed.filter(Boolean).join(" · ")}</div>
            )}
            {Array.isArray(data.verification.caveats) && data.verification.caveats.filter(Boolean).length > 0 && (
              <div className="mt-1.5 text-[10.5px] text-white/40">⚠ {data.verification.caveats.filter(Boolean).join(" · ")}</div>
            )}
            {Array.isArray(data.verification.facts) && data.verification.facts.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[9px] text-white/25">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#34d399" }} />verified</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#fbbf24" }} />attributed estimate</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#fb7185" }} />low — hedge</span>
              </div>
            )}
          </div>
        )}

        {/* Beat filmstrip */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {/* journey thread spine */}
          <div className="absolute bottom-4 left-[2.05rem] top-2 w-px border-l border-dashed" style={{ borderColor: `${sw[2]}55` }} />
          <div className="space-y-2.5">
            {beats.map((b, i) => (
              <div key={i} className="group relative flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 pl-2.5 transition-colors hover:border-white/10">
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-black" style={{ background: sw[2], boxShadow: `0 0 14px ${sw[2]}66` }}>{String(i + 1).padStart(2, "0")}</span>
                  <GripVertical size={11} className="text-white/15" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    value={b.title}
                    onChange={(e) => edit((bs) => bs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                    className="w-full bg-transparent text-[15px] font-bold uppercase tracking-wide text-white focus:outline-none"
                    style={{ fontFamily: font }}
                  />
                  <textarea
                    value={b.narration}
                    onChange={(e) => edit((bs) => bs.map((x, k) => (k === i ? { ...x, narration: e.target.value } : x)))}
                    rows={2}
                    placeholder="Narration for this beat…"
                    className="w-full resize-none rounded-md border border-white/[0.06] bg-black/30 px-2.5 py-1.5 text-[12px] leading-relaxed text-white/75 placeholder:text-white/25 focus:border-white/10 focus:outline-none"
                  />
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-white/45 hover:text-white disabled:opacity-20"><ChevronLeft size={12} className="rotate-90" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === beats.length - 1} className="rounded p-1 text-white/45 hover:text-white disabled:opacity-20"><ChevronRight size={12} className="rotate-90" /></button>
                  {beats.length > 1 && (
                    <button onClick={() => edit((bs) => bs.filter((_, k) => k !== i))} className="rounded p-1 text-white/40 hover:text-red-400"><Trash2 size={11} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: runtime + build */}
        <div className="flex items-center gap-4 border-t border-white/10 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/40">Runtime</span>
            <input type="range" min={8} max={60} step={1} value={runtime} onChange={(e) => setRuntime(parseInt(e.target.value, 10))} className="min-w-0 flex-1" style={{ accentColor: sw[2] }} />
            <span className="w-9 shrink-0 text-right font-mono text-[12px] text-white/70">{runtime}s</span>
          </div>
          {error && <span className="max-w-[180px] truncate text-[11px] text-red-400/90">{error}</span>}
          <button
            onClick={open}
            disabled={building || beats.length === 0}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: sw[2], boxShadow: `0 8px 30px ${sw[2]}55` }}
          >
            {building ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {building ? "Building your film…" : data.single ? "Open in editor" : dirty ? "Build my film" : "Open in editor"}
          </button>
        </div>
      </div>
    </div>
  );
};
