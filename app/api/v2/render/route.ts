/**
 * POST /api/v2/render — render a Mapanisy v2 project with ONE click.
 *
 * Two paths, picked automatically:
 *   • Render Agent connected → enqueue on the user's machine (fast, their GPU).
 *   • No agent → render on the SERVER (spawned @remotion/renderer worker) and
 *     hand the file back as a download. Zero setup for the customer.
 *
 * Body: { project: Project, story?: boolean, settings?: AgentJobSettings }
 * Poll GET /api/v2/render/[jobId] for progress; download when done.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { enqueueAgentJob, sessionForUser, listJobsForUser, type AgentJobSettings } from "@/lib/agentBridge";
import { enqueueServerRender, listServerJobsForUser } from "@/lib/serverRender";
import { checkQuota } from "@/lib/quota";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";
import { Project as ProjectSchema } from "@/v2/doc/schema";
import { validateProject } from "@/v2/doc/validate";

async function resolveUserId(clerkId: string): Promise<string | null> {
  if (db) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.clerkId, clerkId)).limit(1);
    return user?.id ?? null;
  }
  return devGetOrCreateUserByClerk(clerkId).id;
}

/** GET /api/v2/render — the user's render queue (cloud + agent), newest first. */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = await resolveUserId(clerkId);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const cloud = listServerJobsForUser(userId).map((j) => ({
    id: j.id, mode: "cloud" as const, name: j.name,
    status: j.status, progress: j.progress, message: j.message, error: j.error ?? null,
    enqueuedAt: j.enqueuedAt, startedAt: j.startedAt ?? null, finishedAt: j.finishedAt ?? null,
    // ETA from the observed frame rate so far (only meaningful while running).
    etaSec: j.status === "running" && j.startedAt && j.progress > 0.06
      ? Math.round(((Date.now() - j.startedAt) / 1000) * (1 - j.progress) / j.progress)
      : null,
    downloadUrl: j.status === "done" ? `/api/v2/render/${j.id}/file` : null,
  }));
  const agent = listJobsForUser(userId).map((j) => ({
    id: j.id, mode: "agent" as const, name: j.compositionId,
    status: j.status === "pending" ? "queued" : j.status, progress: j.progress, message: j.message, error: j.error ?? null,
    enqueuedAt: j.enqueuedAt, startedAt: j.startedAt ?? null, finishedAt: j.finishedAt ?? null,
    etaSec: null, downloadUrl: null,
  }));
  const jobs = [...cloud, ...agent].sort((a, b) => b.enqueuedAt - a.enqueuedAt).slice(0, 30);
  return NextResponse.json({ jobs, agentOnline: !!sessionForUser(userId) });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const parsed = ProjectSchema.safeParse(body?.project);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const project = parsed.data;
  const settings = (body?.settings ?? {}) as AgentJobSettings;

  // ── Pre-render QA gate ──
  // Auto-fix the mechanically fixable (NaN camera poses, clamped timings,
  // overlapping titles, captions with no text) and collect warnings for the
  // rest. The FIXED project is what renders; issues go back to the UI.
  const issues = validateProject(project as any);
  const warnings = issues.filter((i) => i.level === "warning");
  const fixes = issues.filter((i) => i.level === "fixed");

  const userId = await resolveUserId(clerkId);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Agent online → render on the user's machine; otherwise fall back to a
  // server-side render (one-click, no setup).
  const agentOnline = !!sessionForUser(userId);

  // Quota + watermark (count-metered free tier gated on the agent path).
  const quota = await checkQuota(userId);
  if (db && quota.unit === "animation" && !quota.allowed) {
    return NextResponse.json({
      error: "quota_exceeded",
      message: `You've used your ${quota.maxRenders} free animation${quota.maxRenders === 1 ? "" : "s"}. Upgrade to keep rendering.`,
      tier: quota.tier, unit: quota.unit, upgradeUrl: "/pricing",
    }, { status: 402 });
  }
  const watermark = !!db && quota.tier === "free";

  const name = (project.name || "mapanisy").replace(/[^a-zA-Z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "mapanisy";

  // Render the WHOLE STORY (every scene back-to-back as one film) when the
  // caller asks for it and there's more than one scene; otherwise just the
  // single active composition.
  const story = !!body?.story && Array.isArray(project.scenes) && project.scenes.length > 1;
  const compositionId = story ? "MapanisyStory" : "MapanisyV2";

  if (agentOnline) {
    const job = story
      ? enqueueAgentJob(userId, name, "", "", settings, undefined, undefined, watermark, undefined, project.scenes)
      : enqueueAgentJob(userId, name, "", "", settings, undefined, undefined, watermark, project.composition);
    return NextResponse.json({ ok: true, jobId: job.id, mode: "agent", compositionId, watermark, scenes: story ? project.scenes.length : 1, fixes, warnings });
  }

  const inputProps = story
    ? { scenes: project.scenes, watermark }
    : { comp: project.composition, watermark };
  const job = enqueueServerRender(userId, name, compositionId, inputProps, {
    scale: settings.scale,
    videoBitrate: settings.videoBitrate,
    x264Preset: settings.x264Preset,
    alpha: settings.alpha,
  }, req.nextUrl.origin);
  return NextResponse.json({ ok: true, jobId: job.id, mode: "cloud", compositionId, watermark, scenes: story ? project.scenes.length : 1, fixes, warnings });
}
