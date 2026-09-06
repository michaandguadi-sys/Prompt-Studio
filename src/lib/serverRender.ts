/**
 * Server-side render queue — the zero-setup fallback when no Render Agent is
 * connected. Renders happen on the SERVER (spawned worker process running
 * @remotion/renderer against the prebuilt public/remotion-bundle), and the
 * finished file is streamed back to the browser as a download.
 *
 * Same module-scope in-memory pattern as agentBridge.ts / renderQueue.ts:
 * fine for a single-process deployment; swap for a real job queue when
 * scaling out.
 */

import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { logRenderCompleted } from "./quota";

export type ServerJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type ServerRenderJob = {
  id: string;
  userId: string;
  /** Display name (project name). */
  name: string;
  compId: "MapanisyV2" | "MapanisyStory";
  status: ServerJobStatus;
  /** True while a running job is suspended (SIGSTOP) — resume with SIGCONT. */
  paused?: boolean;
  /** When it was paused, so a forgotten pause can be reasoned about. */
  pausedAt?: number;
  progress: number; // 0–1
  message: string;
  outFile: string;
  /** File extension of the output ("mp4" | "mov"). */
  ext: "mp4" | "mov";
  error?: string;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
};

export type ServerRenderSettings = {
  scale?: number;
  videoBitrate?: string;
  x264Preset?: string;
  alpha?: boolean;
};

const MAX_CONCURRENT = 1;
const RENDER_DIR = path.join(process.cwd(), ".renders");
/** Keep finished outputs around for 24 h, then sweep. */
const OUTPUT_TTL_MS = 24 * 60 * 60 * 1000;

const jobs = new Map<string, ServerRenderJob>();
const queueOrder: string[] = [];
const procs = new Map<string, ChildProcess>();
let runningCount = 0;

export function enqueueServerRender(
  userId: string,
  name: string,
  compId: "MapanisyV2" | "MapanisyStory",
  inputProps: unknown,
  settings: ServerRenderSettings = {},
  /** App origin (e.g. https://app.example.com) — the worker loads the bundle
   *  over HTTP from here so relative /api/sat + /api/dem tile proxies resolve. */
  origin?: string,
): ServerRenderJob {
  const id = randomUUID();
  const ext = settings.alpha ? "mov" : "mp4";
  const job: ServerRenderJob = {
    id,
    userId,
    name,
    compId,
    status: "queued",
    progress: 0,
    message: "Queued for cloud render",
    outFile: path.join(RENDER_DIR, `${id}.${ext}`),
    ext: ext as "mp4" | "mov",
    enqueuedAt: Date.now(),
  };
  fs.mkdirSync(RENDER_DIR, { recursive: true });
  // The worker reads its whole job from a file — no giant argv / env payloads.
  // RENDER_ORIGIN wins so Docker/proxy deployments can pin the worker to
  // http://localhost:PORT (the public domain often isn't resolvable from
  // inside the container); then the request origin; then sane fallbacks.
  const resolvedOrigin = process.env.RENDER_ORIGIN || origin || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT ?? 3030}`;
  fs.writeFileSync(
    path.join(RENDER_DIR, `${id}.job.json`),
    JSON.stringify({ compId, inputProps, settings, outFile: job.outFile, origin: resolvedOrigin }),
  );
  jobs.set(id, job);
  queueOrder.push(id);
  sweepOldOutputs();
  processNext();
  return job;
}

export function getServerJob(id: string): ServerRenderJob | undefined {
  return jobs.get(id);
}

export function listServerJobsForUser(userId: string): ServerRenderJob[] {
  return [...jobs.values()]
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.enqueuedAt - a.enqueuedAt);
}

export function cancelServerJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === "running") {
    const proc = procs.get(id);
    // A SIGSTOP'd process can't handle SIGTERM — wake it first.
    if (job.paused) { try { proc?.kill("SIGCONT"); } catch {} }
    proc?.kill();
    job.status = "cancelled";
    job.paused = false;
    job.message = "Cancelled";
    job.finishedAt = Date.now();
    return true;
  }
  if (job.status === "queued") {
    const idx = queueOrder.indexOf(id);
    if (idx >= 0) queueOrder.splice(idx, 1);
    job.status = "cancelled";
    job.message = "Cancelled before start";
    job.finishedAt = Date.now();
    return true;
  }
  return false;
}

/** Re-run a finished/failed/cancelled job with its exact original payload
 *  (the job file is kept until the sweep for this). Also serves "duplicate". */
export function retryServerJob(id: string): ServerRenderJob | null {
  const job = jobs.get(id);
  if (!job || job.status === "running" || job.status === "queued") return null;
  const jobFile = path.join(RENDER_DIR, `${id}.job.json`);
  if (!fs.existsSync(jobFile)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(jobFile, "utf8"));
    return enqueueServerRender(job.userId, job.name, job.compId, payload.inputProps, payload.settings ?? {}, payload.origin);
  } catch { return null; }
}

/** Suspend a running render (SIGSTOP) — frees CPU without losing progress.
 *
 *  A paused job also RELEASES its concurrency slot. It used to keep it: finish()
 *  is the only thing that decrements runningCount and it only runs when the
 *  process exits, so with MAX_CONCURRENT = 1 a single paused render blocked the
 *  queue for every user, indefinitely. */
export function pauseServerJob(id: string): boolean {
  const job = jobs.get(id);
  const proc = procs.get(id);
  if (!job || !proc || job.status !== "running" || job.paused) return false;
  try { proc.kill("SIGSTOP"); } catch { return false; }
  job.paused = true;
  job.pausedAt = Date.now();
  job.message = "Paused";
  runningCount = Math.max(0, runningCount - 1);
  processNext();
  return true;
}

export function resumeServerJob(id: string): boolean {
  const job = jobs.get(id);
  const proc = procs.get(id);
  if (!job || !proc || !job.paused) return false;
  // Pausing released the slot, so resuming has to take one back. If the queue
  // handed it to someone else, stay paused rather than running two renders at
  // once — 2 x Remotion (2 tabs each) would saturate all 4 vCPU.
  if (runningCount >= MAX_CONCURRENT) {
    job.message = "Waiting for a free slot…";
    return false;
  }
  try { proc.kill("SIGCONT"); } catch { return false; }
  job.paused = false;
  job.pausedAt = undefined;
  runningCount++;
  job.message = "Resumed…";
  return true;
}

function sweepOldOutputs() {
  const cutoff = Date.now() - OUTPUT_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (job.finishedAt && job.finishedAt < cutoff) {
      try { fs.rmSync(job.outFile, { force: true }); } catch {}
      try { fs.rmSync(path.join(RENDER_DIR, `${id}.job.json`), { force: true }); } catch {}
      jobs.delete(id);
    }
  }

  // `jobs` is in-memory, so it is EMPTY after a restart — every file written
  // before the restart became invisible to the loop above and survived forever.
  // .renders/ is a docker volume on the VPS; a 4K mp4 per render fills the disk,
  // and a full disk takes down renders, the file store and Postgres together.
  // Sweep by mtime so orphans are collected regardless of what is in memory.
  const live = new Set<string>();
  for (const [id, job] of jobs.entries()) { live.add(path.basename(job.outFile)); live.add(`${id}.job.json`); }
  try {
    for (const name of fs.readdirSync(RENDER_DIR)) {
      if (live.has(name)) continue;                       // tracked by a live job
      const full = path.join(RENDER_DIR, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs < cutoff) fs.rmSync(full, { force: true });
      } catch { /* raced with another sweep or a write — skip */ }
    }
  } catch { /* RENDER_DIR missing — nothing to sweep */ }
}

function processNext() {
  if (runningCount >= MAX_CONCURRENT) return;
  const nextId = queueOrder.shift();
  if (!nextId) return;
  const job = jobs.get(nextId);
  if (!job || job.status !== "queued") { processNext(); return; }

  const jobFile = path.join(RENDER_DIR, `${job.id}.job.json`);
  job.status = "running";
  job.startedAt = Date.now();
  job.message = "Starting cloud render…";
  runningCount++;

  const proc = spawn(process.execPath, [path.join(process.cwd(), "scripts/render-worker.mjs"), jobFile], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.set(job.id, proc);

  let stderrTail = "";
  let buf = "";
  proc.stdout!.on("data", (b: Buffer) => {
    buf += b.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (typeof msg.progress === "number") {
          job.progress = Math.max(job.progress, Math.min(1, msg.progress));
          if (msg.message) job.message = msg.message;
        }
        if (msg.error) job.error = msg.error;
      } catch { /* non-JSON noise from the renderer — ignore */ }
    }
  });
  proc.stderr!.on("data", (b: Buffer) => {
    stderrTail = (stderrTail + b.toString()).slice(-2000);
  });

  // 'close' and 'error' can BOTH fire for the same process (a failed spawn is
  // the common case), which ran finish() twice: runningCount went NEGATIVE, so
  // `runningCount >= MAX_CONCURRENT` was never true again and the queue started
  // every job at once — unbounded parallel Chromium on a 4 vCPU box.
  let finished = false;
  const finish = (ok: boolean, errMsg?: string) => {
    if (finished) return;
    finished = true;
    runningCount = Math.max(0, runningCount - 1);
    procs.delete(job.id);
    job.finishedAt = Date.now();
    job.paused = false;
    // Job file is kept until the TTL sweep so retry/duplicate can re-enqueue it.
    if (job.status === "cancelled") { /* keep cancelled state */ }
    else if (ok && fs.existsSync(job.outFile)) {
      job.status = "done";
      job.progress = 1;
      job.message = `Ready in ${Math.round((job.finishedAt - (job.startedAt ?? job.finishedAt)) / 1000)}s`;
      // Meter the render so a count-capped tier actually reaches its cap. The
      // agent path logs via /api/agent/complete; this is the equivalent for the
      // server path, which free users are forced onto. Fire-and-forget: a
      // metering failure must never turn a finished render into a failed one.
      void logRenderCompleted({
        userId:          job.userId,
        sceneName:       job.name || job.compId,
        durationSeconds: Math.round((job.finishedAt - (job.startedAt ?? job.finishedAt)) / 1000),
      });
    } else {
      job.status = "failed";
      job.error = job.error || errMsg || stderrTail.split("\n").filter(Boolean).pop() || "Render failed";
      job.message = job.error;
    }
    processNext();
  };

  proc.on("close", (code) => finish(code === 0));
  proc.on("error", (e) => finish(false, `Could not start renderer: ${e.message}`));
}
