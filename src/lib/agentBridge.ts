/**
 * In-memory bridge between the Render Agent (Electron/Node app running on the
 * subscriber's machine) and the Mapanisy web browser.
 *
 * Architecture:
 *   Browser ──POST /api/agent/job──► agentBridge (this module)
 *   Agent   ──GET  /api/agent/job──► agentBridge  (long-poll, picks up jobs)
 *   Agent   ──POST /api/agent/progress──► agentBridge (progress updates)
 *   Browser ──GET  /api/agent/status──► agentBridge (connection check)
 *
 * Lives in module scope so state survives across API route invocations within
 * the same Next.js server process. Same pattern as renderQueue.ts.
 */

import { randomUUID } from "crypto";

// ── Session (agent connection) ─────────────────────────────────────────────

export type AgentSession = {
  agentKey: string;
  userId:   string;
  /** ISO machine label sent by the agent (e.g. "MacBook Pro — macOS 15.2"). */
  machine:  string;
  /** Epoch ms of last heartbeat. Agent is "online" if < 35 s ago. */
  lastSeen: number;
};

/** agentKey → session */
const sessions = new Map<string, AgentSession>();

const ONLINE_THRESHOLD_MS = 35_000; // agent heartbeats every 30 s

export function heartbeat(agentKey: string, userId: string, machine: string): void {
  sessions.set(agentKey, { agentKey, userId, machine, lastSeen: Date.now() });
}

export function isOnline(agentKey: string): boolean {
  const s = sessions.get(agentKey);
  return !!s && Date.now() - s.lastSeen < ONLINE_THRESHOLD_MS;
}

/** Find the session for a userId — returns the most recently seen one. */
export function sessionForUser(userId: string): AgentSession | undefined {
  let best: AgentSession | undefined;
  for (const s of sessions.values()) {
    if (s.userId !== userId) continue;
    if (Date.now() - s.lastSeen >= ONLINE_THRESHOLD_MS) continue;
    if (!best || s.lastSeen > best.lastSeen) best = s;
  }
  return best;
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export type AgentJobStatus = "pending" | "running" | "done" | "failed";

export type AgentJobSettings = {
  scale?:       number;
  x264Preset?:  string;
  videoBitrate?: string;
  alpha?:        boolean;
  outputDir?:    string;
};

export type AgentJob = {
  id:            string;
  userId:        string;
  compositionId: string;
  /**
   * Scene spec JSON — the agent renders this directly using the scene
   * components bundled inside the agent package. Primary payload.
   */
  spec:          unknown;
  /**
   * Multi-scene sequence payload. When present (length > 1), the agent renders
   * the whole timeline via the `PromptStudioSequence` composition instead of the
   * single-scene `PromptStudioScene`. Undefined for single-scene jobs.
   */
  scenes?:       unknown[];
  /**
   * Mapanisy v2 composition (the layer-stack document). When present, the agent
   * renders the `MapanisyV2` Remotion composition with inputProps { comp }.
   * Takes precedence over spec/scenes.
   */
  v2composition?: unknown;
  /**
   * Mapanisy v2 STORY — an ordered array of scenes ({ composition, … }). When
   * present, the agent renders the `MapanisyStory` Remotion composition with
   * inputProps { scenes }, playing every scene back-to-back as one film.
   * Takes precedence over v2composition.
   */
  v2story?: unknown;
  /**
   * Free-tier watermark flag. When true, the agent renders a "Mapanisy"
   * overlay on top of the scene/sequence (passed as the `watermark` inputProp).
   * Paid tiers send false. Derived server-side from the user's subscription —
   * never trusted from the client.
   */
  watermark:     boolean;
  /** Fully standalone generated TSX source — kept for advanced users / debugging. */
  tsx:           string;
  /** Minimal Root.tsx registration source. */
  rootTsx:       string;
  settings:      AgentJobSettings;
  status:        AgentJobStatus;
  progress:      number; // 0–1
  message:       string;
  enqueuedAt:    number;
  startedAt?:    number;
  finishedAt?:   number;
  error?:        string;
};

/** All active agent jobs, keyed by id. */
const jobs = new Map<string, AgentJob>();

/** Resolvers waiting for a job to become available (long-poll). */
const waiters = new Map<string, Array<(job: AgentJob) => void>>();

export function enqueueAgentJob(
  userId:        string,
  compositionId: string,
  tsx:           string,
  rootTsx:       string,
  settings:      AgentJobSettings,
  spec?:         unknown,
  scenes?:       unknown[],
  watermark:     boolean = false,
  v2composition?: unknown,
  v2story?:      unknown[],
): AgentJob {
  const job: AgentJob = {
    id: randomUUID(),
    userId,
    compositionId,
    spec:    spec ?? null,
    ...(scenes && scenes.length > 1 ? { scenes } : {}),
    ...(v2composition ? { v2composition } : {}),
    ...(v2story && v2story.length ? { v2story } : {}),
    watermark,
    tsx,
    rootTsx,
    settings,
    status:     "pending",
    progress:   0,
    message:    "Queued for local render",
    enqueuedAt: Date.now(),
  };
  jobs.set(job.id, job);

  // Wake up any agent that is long-polling for this user's jobs
  const list = waiters.get(userId) ?? [];
  while (list.length > 0) {
    const resolve = list.shift()!;
    resolve(job);
  }
  return job;
}

export function getJob(id: string): AgentJob | undefined {
  return jobs.get(id);
}

export function listJobsForUser(userId: string): AgentJob[] {
  return [...jobs.values()]
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.enqueuedAt - a.enqueuedAt);
}

/** Called by the agent to claim the next pending job. Returns immediately if
 *  one exists, otherwise resolves after up to `timeoutMs` ms (long-poll). */
export async function pollNextJob(
  userId:    string,
  timeoutMs: number = 25_000,
): Promise<AgentJob | null> {
  // Check if there's already a pending job
  const pending = [...jobs.values()].find(
    (j) => j.userId === userId && j.status === "pending",
  );
  if (pending) {
    pending.status    = "running";
    pending.startedAt = Date.now();
    pending.message   = "Picked up by your Render Agent";
    return pending;
  }

  // Long-poll: wait for one to arrive
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const list = waiters.get(userId);
      if (list) {
        const idx = list.indexOf(cb);
        if (idx >= 0) list.splice(idx, 1);
      }
      resolve(null);
    }, timeoutMs);

    const cb = (job: AgentJob) => {
      clearTimeout(timeout);
      job.status    = "running";
      job.startedAt = Date.now();
      job.message   = "Picked up by your Render Agent";
      resolve(job);
    };

    const list = waiters.get(userId) ?? [];
    list.push(cb);
    waiters.set(userId, list);
  });
}

export function updateProgress(
  id:       string,
  progress: number,
  message:  string,
): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  job.progress = progress;
  job.message  = message;
  return true;
}

export function completeJob(id: string, error?: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  job.status      = error ? "failed" : "done";
  job.progress    = error ? job.progress : 1;
  job.message     = error ? `Failed: ${error}` : "Rendered on your device ✓";
  job.error       = error;
  job.finishedAt  = Date.now();
  // Prune old finished jobs (keep last 20 per user)
  const userJobs = listJobsForUser(job.userId);
  const done = userJobs.filter((j) => j.status === "done" || j.status === "failed");
  if (done.length > 20) {
    for (const old of done.slice(20)) jobs.delete(old.id);
  }
  return true;
}
