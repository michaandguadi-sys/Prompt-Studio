/**
 * GET /api/v2/render/[jobId] — unified render-job status for BOTH paths
 * (server-side "cloud" render and local Render Agent). The client polls this
 * for a live progress bar and gets a downloadUrl when a cloud render is ready.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getJob as getAgentJob } from "@/lib/agentBridge";
import { getServerJob, cancelServerJob, retryServerJob, pauseServerJob, resumeServerJob } from "@/lib/serverRender";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";

async function resolveUserId(clerkId: string): Promise<string | null> {
  if (db) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.clerkId, clerkId)).limit(1);
    return user?.id ?? null;
  }
  return devGetOrCreateUserByClerk(clerkId).id;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await ctx.params;
  const userId = await resolveUserId(clerkId);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const server = getServerJob(jobId);
  if (server) {
    if (server.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      id: server.id,
      mode: "cloud",
      status: server.status,
      paused: !!server.paused,
      progress: server.progress,
      message: server.message,
      error: server.error ?? null,
      downloadUrl: server.status === "done" ? `/api/v2/render/${server.id}/file` : null,
    });
  }

  const agent = getAgentJob(jobId);
  if (agent) {
    if (agent.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      id: agent.id,
      mode: "agent",
      // Normalize agent statuses to the cloud vocabulary ("pending" → "queued").
      status: agent.status === "pending" ? "queued" : agent.status,
      progress: agent.progress,
      message: agent.message,
      error: agent.error ?? null,
      downloadUrl: null, // agent renders save directly on the user's machine
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** PATCH — job actions: { action: "pause" | "resume" | "retry" | "duplicate" }.
 *  retry/duplicate re-enqueue the job's exact payload and return the new jobId. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await ctx.params;
  const userId = await resolveUserId(clerkId);
  const job = getServerJob(jobId);
  if (!job || job.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let action = "";
  try { action = String((await req.json())?.action ?? ""); } catch {}
  if (action === "pause") return NextResponse.json({ ok: pauseServerJob(jobId) });
  if (action === "resume") return NextResponse.json({ ok: resumeServerJob(jobId) });
  if (action === "retry" || action === "duplicate") {
    const next = retryServerJob(jobId);
    if (!next) return NextResponse.json({ ok: false, error: "Job can't be re-run (still active, or its payload expired)." }, { status: 409 });
    return NextResponse.json({ ok: true, jobId: next.id });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await ctx.params;
  const userId = await resolveUserId(clerkId);
  const server = getServerJob(jobId);
  if (!server || server.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: cancelServerJob(jobId) });
}
