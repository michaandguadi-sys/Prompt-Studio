/**
 * POST /api/agent/progress
 * Called by the Render Agent to report frame-by-frame render progress.
 * Body: { agentKey: string; jobId: string; progress: number; message: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { updateProgress, getJob } from "@/lib/agentBridge";
import { devUserIdForKey } from "@/lib/devAgentStore";

export async function POST(req: NextRequest) {
  let body: { agentKey?: string; jobId?: string; progress?: number; message?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const { agentKey, jobId, progress, message } = body;
  if (!agentKey || !jobId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  let userId: string | null = null;
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.agentKey, agentKey))
      .limit(1);
    userId = user?.id ?? null;
  } else {
    userId = devUserIdForKey(agentKey) ?? null;
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership guard: only report progress on YOUR OWN jobs — a valid key must
  // not be able to write progress into another user's job by guessing its id.
  const job = getJob(jobId);
  if (!job || job.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  updateProgress(jobId, progress ?? 0, message ?? "");
  return NextResponse.json({ ok: true });
}
