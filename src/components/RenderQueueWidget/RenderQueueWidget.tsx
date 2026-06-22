"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2, Clock, X, ChevronUp, ChevronDown, Trash2, Film, Gauge, MonitorSmartphone, GripVertical } from "lucide-react";
import { nextFunFact } from "@/lib/funFacts";
import {
  recordRender,
  estimateRenderSec,
  formatDuration,
  getHistory,
} from "@/lib/renderHistory";
import type { RenderJob } from "@/lib/renderQueue";
import type { AgentJob } from "@/lib/agentBridge";

/**
 * Always-mounted render queue widget. Lives in the bottom-right of the
 * layout. Polls /api/render-queue every 2s while there's an active render;
 * 5s while idle. Shows running progress + queue + recent done jobs. Pops
 * a chime + browser notification when something completes.
 */
export const RenderQueueWidget: React.FC = () => {
  const [jobs,      setJobs]      = useState<RenderJob[]>([]);
  const [agentJobs, setAgentJobs] = useState<AgentJob[]>([]);
  const [open, setOpen] = useState(false);
  const [fact, setFact] = useState(() => nextFunFact());
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);

  // ── Draggable position (so it never blocks the inspector / aspect control) ──
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem("mapanisy-rq-pos") || "null"); if (v && typeof v.x === "number") setPos(v); } catch {}
  }, []);
  useEffect(() => { if (pos) try { localStorage.setItem("mapanisy-rq-pos", JSON.stringify(pos)); } catch {} }, [pos]);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest("[data-rq]") as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top, w = rect.width, h = rect.height;
    const move = (ev: PointerEvent) => {
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - w - 8, ev.clientX - offX)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, ev.clientY - offY)),
      });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── Poll agent status ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const pollAgent = async () => {
      try {
        const r = await fetch("/api/agent/status", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (mounted) setAgentJobs(d.jobs ?? []);
        }
      } catch {}
    };
    pollAgent();
    const t = setInterval(pollAgent, 3_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  // ── Poll the server render queue ─────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch("/api/render-queue", { cache: "no-store" });
        const data = await res.json();
        if (!mounted) return;
        const incoming: RenderJob[] = data.jobs ?? [];

        for (const j of incoming) {
          const prev = prevStatuses.current.get(j.id);
          const isFreshComplete = prev && prev !== j.status &&
            (j.status === "done" || j.status === "failed");
          if (isFreshComplete) {
            notifyComplete(j);
            if (j.status === "done" && j.startedAt && j.finishedAt) {
              const totalFrames = guessFrameCount(j);
              const scale = (j.settings.scale as number) ?? (j.settings.draft ? 0.5 : 1);
              recordRender({
                frames: totalFrames || 100,
                durationMs: j.finishedAt - j.startedAt,
                scale,
                complexity: 1.0,
              });
              setHistoryCount(getHistory().length);

              // Log the render to the DB for quota tracking
              const durationSeconds = (j.finishedAt - j.startedAt) / 1000;
              fetch("/api/render-log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneName: j.compositionId, durationSeconds }),
              }).catch(() => {/* best-effort */});
            }
          }
          prevStatuses.current.set(j.id, j.status);
        }

        setJobs(incoming);
      } catch {/* ignore poll fail */}
      const anyActive = (jobs.some(j => j.status === "running" || j.status === "queued"));
      timer = setTimeout(tick, anyActive ? 1500 : 5000);
    };
    tick();
    return () => { mounted = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute ETA from history (cached for stable display)
  const runningEtaSec = (() => {
    const running = jobs.find((j) => j.status === "running");
    if (!running || !running.startedAt) return null;
    const totalFrames = guessFrameCount(running) || 100;
    const scale = (running.settings.scale as number) ?? (running.settings.draft ? 0.5 : 1);
    const est = estimateRenderSec(totalFrames, scale, 1.0);
    const elapsedSec = Math.round((Date.now() - running.startedAt) / 1000);
    // Blend our estimate with actual progress for a more accurate ETA
    if (running.progress > 0.05) {
      const projectedTotal = elapsedSec / running.progress;
      // Weighted blend: 70% projected, 30% history estimate
      const blended = projectedTotal * 0.7 + est * 0.3;
      return Math.max(0, Math.round(blended - elapsedSec));
    }
    return Math.max(0, est - elapsedSec);
  })();

  // ── Rotate fun fact every 8s while a render is running ──────────────
  useEffect(() => {
    const anyRunning = jobs.some((j) => j.status === "running");
    if (!anyRunning) return;
    const t = setInterval(() => setFact(nextFunFact()), 8000);
    return () => clearInterval(t);
  }, [jobs]);

  // Auto-open when there's activity
  useEffect(() => {
    if (jobs.some((j) => j.status === "running")) setOpen(true);
  }, [jobs.length]);

  const running = jobs.filter((j) => j.status === "running");
  const queued = jobs.filter((j) => j.status === "queued");
  const recent = jobs.filter((j) => j.status === "done" || j.status === "failed" || j.status === "cancelled").slice(0, 5);
  const hasActivity = running.length + queued.length > 0;

  // Agent jobs (from user's Render Agent)
  const agentRunning = agentJobs.filter((j) => j.status === "running" || j.status === "pending");
  const agentRecent  = agentJobs.filter((j) => j.status === "done" || j.status === "failed").slice(0, 5);
  const hasAgentActivity = agentRunning.length > 0;

  const clearDone = async () => {
    await fetch("/api/render-queue", { method: "DELETE" });
    setJobs((cur) => cur.filter((j) => j.status === "running" || j.status === "queued"));
  };

  return (
    <div data-rq className={pos ? "fixed z-50 w-96 max-w-[calc(100vw-2rem)]" : "fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]"} style={pos ? { left: pos.x, top: pos.y } : undefined}>
      <div className="rounded-xl border border-line bg-white shadow-elevated overflow-hidden">
        {/* ── Header — always visible. Grip drags, the rest toggles. ──── */}
        <div className="flex w-full items-center gap-1.5 px-2.5 py-2.5">
          <span onPointerDown={startDrag} title="Drag to move" className="cursor-grab active:cursor-grabbing text-graphite/40 hover:text-graphite/60 shrink-0">
            <GripVertical size={14} />
          </span>
          <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity">
            <Film size={13} className="text-amber shrink-0" />
            <div className="flex-1 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-graphite/70">
              Render Queue
            </div>
            {(hasActivity || hasAgentActivity) ? (
              <div className="flex items-center gap-1.5 text-[11px] text-amber font-mono">
                <Loader2 size={11} className="animate-spin" />
                {running.length + queued.length + agentRunning.length} active
              </div>
            ) : (recent.length + agentRecent.length) > 0 ? (
              <div className="text-[11px] text-graphite/45">{recent.length + agentRecent.length} done</div>
            ) : (
              <div className="text-[11px] text-graphite/40">Idle</div>
            )}
            <div className="text-graphite/45">
              {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </div>
          </button>
        </div>

        {open && (
          <div className="border-t border-line max-h-[60vh] overflow-y-auto">
            {/* ── Currently running ───────────────────────────────── */}
            {running.map((j) => (
              <div key={j.id} className="border-b border-line/70 px-4 py-3 bg-amber/[0.03]">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 size={11} className="animate-spin text-amber shrink-0" />
                  <div className="flex-1 text-xs font-mono text-graphite/80 truncate" title={j.compositionId}>
                    {j.compositionId}
                    {j.settings.draft && <span className="ml-1.5 text-amber/60 text-[10px]">draft</span>}
                    {j.settings.alpha && <span className="ml-1.5 text-amber/60 text-[10px]">alpha</span>}
                  </div>
                  <button
                    onClick={async () => { await fetch(`/api/render-queue/${j.id}`, { method: "DELETE" }); }}
                    className="text-graphite/45 hover:text-red-400 transition-colors" title="Cancel"
                  >
                    <X size={11} />
                  </button>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full bg-graphite/10 overflow-hidden">
                  <div
                    className="h-full bg-amber rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(2, Math.round(j.progress * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-graphite/50">
                  <div className="truncate" title={j.message}>{j.message}</div>
                  <div className="font-mono shrink-0 ml-2 tabular-nums">{Math.round(j.progress * 100)}%</div>
                </div>
                {runningEtaSec !== null && runningEtaSec > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-amber/70 font-mono">
                    <Gauge size={9} />
                    ~{formatDuration(runningEtaSec)} remaining
                    <span className="text-graphite/40 ml-1">· {historyCount} render{historyCount === 1 ? "" : "s"} avg</span>
                  </div>
                )}
                <div className="mt-2 rounded-lg bg-graphite/[0.05] border border-line/70 px-3 py-2 text-[10px] leading-snug text-graphite/55 italic">
                  {fact}
                </div>
              </div>
            ))}

            {/* ── Queued ────────────────────────────────────────────── */}
            {queued.map((j, idx) => {
              const myFrames = guessFrameCount(j) || 100;
              const myScale = (j.settings.scale as number) ?? (j.settings.draft ? 0.5 : 1);
              const myEst = estimateRenderSec(myFrames, myScale, 1.0);
              let waitSec = runningEtaSec ?? 0;
              for (let q = 0; q < idx; q++) {
                const ahead = queued[q];
                const f = guessFrameCount(ahead) || 100;
                const s = (ahead.settings.scale as number) ?? (ahead.settings.draft ? 0.5 : 1);
                waitSec += estimateRenderSec(f, s, 1.0);
              }
              return (
                <div key={j.id} className="border-b border-line/70 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Clock size={11} className="text-graphite/45 shrink-0" />
                    <span className="text-[9px] font-mono text-graphite/45">#{idx + 1}</span>
                    <div className="flex-1 text-xs font-mono text-graphite/65 truncate">{j.compositionId}</div>
                    <button
                      onClick={async () => { await fetch(`/api/render-queue/${j.id}`, { method: "DELETE" }); }}
                      className="text-graphite/45 hover:text-red-400 transition-colors" title="Remove"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[10px] text-graphite/45 font-mono pl-5">
                    <span>starts ~{formatDuration(waitSec)}</span>
                    <span>~{formatDuration(myEst)} est.</span>
                  </div>
                </div>
              );
            })}

            {/* ── Recently completed ────────────────────────────────── */}
            {recent.length > 0 && (
              <>
                <div className="flex items-center justify-between px-4 py-2 bg-graphite/[0.04] border-b border-line/70">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-graphite/45">Recent</span>
                  <button onClick={clearDone} className="text-graphite/45 hover:text-amber transition-colors" title="Clear">
                    <Trash2 size={10} />
                  </button>
                </div>
                {recent.map((j) => (
                  <div key={j.id} className="border-b border-line/70 px-4 py-2 flex items-center gap-2">
                    {j.status === "done"      && <CheckCircle size={11} className="text-emerald-400 shrink-0" />}
                    {j.status === "failed"    && <XCircle size={11} className="text-red-400 shrink-0" />}
                    {j.status === "cancelled" && <X size={11} className="text-graphite/45 shrink-0" />}
                    <div className="flex-1 truncate font-mono text-xs text-graphite/60" title={j.compositionId}>
                      {j.compositionId}
                    </div>
                    <div className="text-[10px] text-graphite/45 shrink-0">{j.message}</div>
                  </div>
                ))}
              </>
            )}

            {/* ── Agent renders ────────────────────────────────────── */}
            {agentRunning.map((j) => (
              <div key={j.id} className="border-b border-line/70 px-4 py-3 bg-emerald-500/[0.03]">
                <div className="flex items-center gap-2 mb-1.5">
                  <MonitorSmartphone size={11} className="text-emerald-400 shrink-0" />
                  <div className="flex-1 text-xs font-mono text-graphite/80 truncate">{j.compositionId}</div>
                  <span className="text-[9px] uppercase tracking-wider text-emerald-400/60">Agent</span>
                </div>
                <div className="h-1 rounded-full bg-graphite/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(2, Math.round(j.progress * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] text-graphite/50">
                  <div className="truncate">{j.message}</div>
                  <div className="font-mono shrink-0 ml-2">{Math.round(j.progress * 100)}%</div>
                </div>
              </div>
            ))}
            {agentRecent.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-graphite/[0.04] border-b border-line/70">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-graphite/45">Agent renders</span>
                </div>
                {agentRecent.map((j) => (
                  <div key={j.id} className="border-b border-line/70 px-4 py-2 flex items-center gap-2">
                    {j.status === "done"   && <CheckCircle size={11} className="text-emerald-400 shrink-0" />}
                    {j.status === "failed" && <XCircle size={11} className="text-red-400 shrink-0" />}
                    <MonitorSmartphone size={10} className="text-graphite/35 shrink-0" />
                    <div className="flex-1 truncate font-mono text-xs text-graphite/60">{j.compositionId}</div>
                    <div className="text-[10px] text-graphite/45 shrink-0 truncate max-w-[120px]">{j.message}</div>
                  </div>
                ))}
              </>
            )}

            {!hasActivity && recent.length === 0 && !hasAgentActivity && agentRecent.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-graphite/40">
                No renders yet.<br />
                <span className="text-graphite/35">Export → Add to queue to start.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Best-effort frame count from a job. The backend doesn't include it in the
 * job payload yet (it's inferred from Remotion's "Rendered X/Y" stdout), so
 * we parse the last "Rendered N/M" log line to extract M.
 */
function guessFrameCount(j: RenderJob): number {
  const lastRendered = [...j.logs].reverse().find((l) => /Rendered\s+\d+\s*\/\s*(\d+)/.test(l));
  if (lastRendered) {
    const m = /Rendered\s+\d+\s*\/\s*(\d+)/.exec(lastRendered);
    if (m) return parseInt(m[1], 10);
  }
  return 0;
}

/** Browser notification + soft chime when a job completes. */
function notifyComplete(j: RenderJob) {
  // Audio chime (soft, brief — won't be obnoxious)
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(j.status === "done" ? 880 : 440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(j.status === "done" ? 1320 : 220, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch {/* AudioContext blocked */}

  // Browser notification (requires permission grant once)
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(
          j.status === "done" ? `✓ Render done — ${j.compositionId}` : `✗ Render failed — ${j.compositionId}`,
          { body: j.message, silent: false }
        );
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  } catch {/* permission denied */}
}
