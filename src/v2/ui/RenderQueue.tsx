"use client";

import React, { useEffect, useRef, useState } from "react";
import { ListVideo, X, Download, RotateCcw, Copy, Pause, Play, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";

/**
 * Render queue manager — the production panel next to the Render button.
 * Shows every render (queued / running / done / failed) with live progress,
 * ETA, and per-job actions: cancel, pause/resume, retry, duplicate, download.
 * Polls GET /api/v2/render while open.
 */
type QueueJob = {
  id: string;
  mode: "cloud" | "agent";
  name: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  paused?: boolean;
  progress: number;
  message: string;
  error: string | null;
  enqueuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  etaSec: number | null;
  downloadUrl: string | null;
};

const fmtETA = (s: number | null) => {
  if (s == null || s <= 0) return "";
  if (s < 60) return `~${s}s left`;
  return `~${Math.round(s / 60)}m left`;
};
const fmtDur = (a: number | null, b: number | null) => {
  if (!a || !b) return "";
  const s = Math.round((b - a) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

const StatusChip: React.FC<{ j: QueueJob }> = ({ j }) => {
  if (j.status === "running" && j.paused) return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"><Pause size={10} /> Paused</span>;
  if (j.status === "running") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-iris"><Loader2 size={10} className="animate-spin" /> Rendering</span>;
  if (j.status === "queued") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-graphite/50"><Clock size={10} /> Queued</span>;
  if (j.status === "done") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><CheckCircle2 size={10} /> Done</span>;
  if (j.status === "failed") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600"><AlertCircle size={10} /> Failed</span>;
  return <span className="text-[10px] font-semibold text-graphite/45">Cancelled</span>;
};

export const RenderQueue: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch("/api/v2/render");
      if (!r.ok) return;
      const d = await r.json();
      setJobs(d.jobs ?? []);
      setAgentOnline(!!d.agentOnline);
    } catch { /* transient */ }
  };

  useEffect(() => {
    if (!open) { if (timer.current) clearInterval(timer.current); timer.current = null; return; }
    refresh();
    timer.current = setInterval(refresh, 2000);
    return () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  }, [open]);

  const act = async (id: string, action: "pause" | "resume" | "retry" | "duplicate") => {
    try { await fetch(`/api/v2/render/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); } catch {}
    refresh();
  };
  const cancel = async (id: string) => {
    try { await fetch(`/api/v2/render/${id}`, { method: "DELETE" }); } catch {}
    refresh();
  };

  const active = jobs.filter((j) => j.status === "running" || j.status === "queued").length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Render queue"
        className="relative inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-graphite/70 hover:border-iris/50 hover:text-graphite transition-colors"
      >
        <ListVideo size={13} />
        {active > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-iris px-1 text-[9px] font-bold text-white">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-[340px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div className="text-[11px] font-semibold text-graphite">Render queue</div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[9.5px] font-medium ${agentOnline ? "text-emerald-600" : "text-graphite/45"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${agentOnline ? "bg-emerald-500" : "bg-graphite/25"}`} />
                {agentOnline ? "Agent connected" : "Cloud rendering"}
              </span>
              <button onClick={() => setOpen(false)} className="text-graphite/40 hover:text-graphite"><X size={13} /></button>
            </div>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {jobs.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] text-graphite/45">
                No renders yet — hit <span className="font-semibold text-graphite/70">Render 4K</span> and track it here.
              </div>
            )}
            {jobs.map((j) => (
              <div key={j.id} className="border-b border-line/60 px-3.5 py-2.5 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium text-graphite">{j.name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusChip j={j} />
                      <span className="text-[9.5px] text-graphite/45">
                        {j.status === "running" && !j.paused && fmtETA(j.etaSec)}
                        {(j.status === "done" || j.status === "failed") && fmtDur(j.startedAt, j.finishedAt)}
                        {j.mode === "agent" && " · on your machine"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {j.status === "running" && j.mode === "cloud" && !j.paused && (
                      <button onClick={() => act(j.id, "pause")} title="Pause" className="rounded p-1 text-graphite/40 hover:bg-paper-100 hover:text-graphite"><Pause size={12} /></button>
                    )}
                    {j.status === "running" && j.paused && (
                      <button onClick={() => act(j.id, "resume")} title="Resume" className="rounded p-1 text-iris hover:bg-paper-100"><Play size={12} /></button>
                    )}
                    {(j.status === "running" || j.status === "queued") && j.mode === "cloud" && (
                      <button onClick={() => cancel(j.id)} title="Cancel" className="rounded p-1 text-graphite/40 hover:bg-paper-100 hover:text-rose-500"><X size={12} /></button>
                    )}
                    {(j.status === "failed" || j.status === "cancelled") && j.mode === "cloud" && (
                      <button onClick={() => act(j.id, "retry")} title="Retry" className="rounded p-1 text-graphite/40 hover:bg-paper-100 hover:text-iris"><RotateCcw size={12} /></button>
                    )}
                    {j.status === "done" && j.mode === "cloud" && (
                      <button onClick={() => act(j.id, "duplicate")} title="Render again" className="rounded p-1 text-graphite/40 hover:bg-paper-100 hover:text-iris"><Copy size={12} /></button>
                    )}
                    {j.downloadUrl && (
                      <a href={j.downloadUrl} title="Download" className="rounded p-1 text-iris hover:bg-paper-100"><Download size={12} /></a>
                    )}
                  </div>
                </div>

                {(j.status === "running" || j.status === "queued") && (
                  <div className="mt-1.5">
                    <div className="h-1 overflow-hidden rounded-full bg-paper-100">
                      <div className={`h-full rounded-full transition-[width] duration-700 ${j.paused ? "bg-amber-400" : "bg-iris"}`} style={{ width: `${Math.max(2, Math.round(j.progress * 100))}%` }} />
                    </div>
                    <div className="mt-1 truncate text-[9.5px] text-graphite/50">{j.message}</div>
                  </div>
                )}
                {j.status === "failed" && j.error && (
                  <div className="mt-1 truncate text-[9.5px] text-rose-600" title={j.error}>{j.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
