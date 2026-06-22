/**
 * In-memory render queue. Lives in module scope so it persists across
 * Next.js API route invocations (same Node process). One queue, configurable
 * concurrency (default 1 — sequential). Survives until the dev server restarts.
 *
 * Why in-memory: simplest possible architecture, zero dependencies, works for
 * a single-user local studio. For multi-user / production this would move to
 * a real job queue (BullMQ / SQS) but that's overkill here.
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import { randomUUID } from "crypto";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type JobSettings = {
  alpha?: boolean;
  draft?: boolean;
  /** Concurrency string or number, defaults "50%". */
  concurrency?: string | number;
  /** Custom video bitrate (e.g. "20M"). When unset Remotion picks a default. */
  videoBitrate?: string;
  /** Override output directory (defaults to MOTION_GRAFIKS_PATH/EXPORT). */
  outputDir?: string;
  /** Render scale 0.25–1.0 — overrides draft default. */
  scale?: number;
  /** x264 encoder preset for the .mp4 path. */
  x264Preset?: "ultrafast" | "veryfast" | "fast" | "medium" | "slow" | "veryslow";
};

export type RenderJob = {
  id: string;
  compositionId: string;
  status: JobStatus;
  /** 0 → 1. Updated from Remotion stdout "Rendered N/M" lines. */
  progress: number;
  /** Last status message shown in the UI. */
  message: string;
  /** Rolling log of stdout/stderr (capped at 200 lines). */
  logs: string[];
  settings: JobSettings;
  outputPath?: string;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

const MOTION_GRAFIKS_PATH = process.env.MOTION_GRAFIKS_PATH;
const MAX_CONCURRENT = 1; // sequential for now; bump to 2 if you have RAM
const MAX_LOG_LINES = 200;

const jobs = new Map<string, RenderJob>();
const queueOrder: string[] = [];
const procs = new Map<string, ChildProcess>();
let runningCount = 0;

/** Pushed-and-resolved when state changes (for the SSE stream). */
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function enqueue(compositionId: string, settings: JobSettings = {}): RenderJob {
  const id = randomUUID();
  const job: RenderJob = {
    id,
    compositionId,
    status: "queued",
    progress: 0,
    message: "Queued",
    logs: [],
    settings,
    enqueuedAt: Date.now(),
  };
  jobs.set(id, job);
  queueOrder.push(id);
  notify();
  processNext();
  return job;
}

export function listJobs(): RenderJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.enqueuedAt - a.enqueuedAt);
}

export function getJob(id: string): RenderJob | undefined {
  return jobs.get(id);
}

export function cancel(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === "running") {
    procs.get(id)?.kill();
    job.status = "cancelled";
    job.finishedAt = Date.now();
    job.message = "Cancelled by user";
    notify();
    return true;
  }
  if (job.status === "queued") {
    const idx = queueOrder.indexOf(id);
    if (idx >= 0) queueOrder.splice(idx, 1);
    job.status = "cancelled";
    job.finishedAt = Date.now();
    job.message = "Cancelled before start";
    notify();
    return true;
  }
  return false;
}

export function clearFinished(): number {
  let n = 0;
  for (const [id, job] of jobs.entries()) {
    if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      jobs.delete(id);
      n++;
    }
  }
  notify();
  return n;
}

function appendLog(job: RenderJob, line: string) {
  job.logs.push(line);
  if (job.logs.length > MAX_LOG_LINES) job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
}

/** Parse a Remotion progress line: "Rendered 12/24, time remaining: 3s" */
function parseProgress(line: string): number | null {
  const m = /Rendered\s+(\d+)\s*\/\s*(\d+)/.exec(line);
  if (m) {
    const cur = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (total > 0) return Math.min(1, cur / total);
  }
  // Bundle/stitch phases — show as 0.05 and 0.9 stub progress
  if (/Bundling\s+(\d+)%/.test(line)) {
    const m2 = /Bundling\s+(\d+)%/.exec(line);
    return Math.min(0.05, ((parseInt(m2![1], 10) || 0) / 100) * 0.05);
  }
  if (/Stitched\s+(\d+)\s*\/\s*(\d+)/.test(line)) {
    const m3 = /Stitched\s+(\d+)\s*\/\s*(\d+)/.exec(line);
    const cur = parseInt(m3![1], 10);
    const total = parseInt(m3![2], 10);
    if (total > 0) return 0.95 + (cur / total) * 0.05;
  }
  return null;
}

function processNext() {
  if (runningCount >= MAX_CONCURRENT) return;
  const nextId = queueOrder.shift();
  if (!nextId) return;
  const job = jobs.get(nextId);
  if (!job || job.status !== "queued") {
    processNext();
    return;
  }
  if (!MOTION_GRAFIKS_PATH) {
    job.status = "failed";
    job.error = "MOTION_GRAFIKS_PATH not set";
    job.finishedAt = Date.now();
    notify();
    return;
  }

  // Build CLI args
  const s = job.settings;
  const ext = s.alpha ? "mov" : "mp4";
  const outDir = s.outputDir
    ? path.resolve(s.outputDir)
    : path.resolve(MOTION_GRAFIKS_PATH, "EXPORT");
  const suffix = s.draft ? "-draft" : "";
  const outFile = path.resolve(outDir, `${job.compositionId}${suffix}.${ext}`);
  // Path-traversal guard
  if (!outFile.startsWith(outDir + path.sep) && outFile !== path.join(outDir, path.basename(outFile))) {
    job.status = "failed";
    job.error = "Path traversal blocked";
    job.finishedAt = Date.now();
    notify();
    return;
  }
  job.outputPath = outFile;

  const conc = String(s.concurrency ?? "50%");
  const args = [
    "remotion",
    "render",
    job.compositionId,
    outFile,
    "--gl=angle",
    `--concurrency=${conc}`,
    "--timeout=120000",
  ];
  if (s.scale !== undefined) {
    args.push(`--scale=${s.scale}`);
  } else if (s.draft) {
    args.push("--scale=0.5");
  }
  if (s.videoBitrate) args.push(`--video-bitrate=${s.videoBitrate}`);
  if (s.alpha) {
    args.push("--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le", "--image-format=png");
  } else if (s.x264Preset) {
    args.push(`--x264-preset=${s.x264Preset}`);
  } else if (s.draft) {
    args.push("--x264-preset=ultrafast");
  }

  job.status = "running";
  job.startedAt = Date.now();
  job.message = "Starting renderer…";
  appendLog(job, `→ npx ${args.join(" ")}`);
  runningCount++;
  notify();

  const proc = spawn("npx", args, { cwd: MOTION_GRAFIKS_PATH, env: process.env });
  procs.set(job.id, proc);

  const handleData = (b: Buffer) => {
    const text = b.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendLog(job, line);
      const p = parseProgress(line);
      if (p !== null) {
        job.progress = p;
        // Keep the last "Rendered X/Y" line as message
        if (/Rendered/.test(line)) job.message = line.trim();
      } else if (/Bundling/.test(line)) job.message = "Bundling…";
      else if (/Stitched/.test(line)) job.message = "Stitching…";
    }
    notify();
  };
  proc.stdout.on("data", handleData);
  proc.stderr.on("data", handleData);

  proc.on("close", (code) => {
    runningCount--;
    procs.delete(job.id);
    job.finishedAt = Date.now();
    if (job.status === "cancelled") {
      // already set
    } else if (code === 0) {
      job.status = "done";
      job.progress = 1;
      job.message = `Done in ${Math.round(((job.finishedAt - (job.startedAt ?? 0)) / 1000))}s`;
    } else {
      job.status = "failed";
      job.error = `Exited with code ${code}`;
      job.message = job.error;
    }
    notify();
    processNext();
  });
  proc.on("error", (e) => {
    runningCount--;
    procs.delete(job.id);
    job.status = "failed";
    job.error = e.message;
    job.message = `Spawn error: ${e.message}`;
    job.finishedAt = Date.now();
    notify();
    processNext();
  });
}
