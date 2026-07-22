/**
 * POST /api/agent/complete
 * Called by the Render Agent when a render finishes (success or failure).
 * Body: { agentKey: string; jobId: string; error?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { completeJob, getJob } from "@/lib/agentBridge";
import { devUserIdForKey } from "@/lib/devAgentStore";
import { TIERS, type Tier } from "@/lib/tiers";
import { grantAllPro } from "@/lib/quota";

/** Video length (seconds) of a job — sums scenes for a sequence, else the spec. */
function jobVideoSeconds(job: ReturnType<typeof getJob>): number {
  if (!job) return 0;
  const dur = (s: any) => Math.max(0, Number(s?.durationSec ?? 0) || 0);
  if (Array.isArray(job.scenes) && job.scenes.length > 1) {
    return job.scenes.reduce((sum: number, s: any) => sum + dur(s), 0);
  }
  return dur(job.spec);
}

export async function POST(req: NextRequest) {
  let body: { agentKey?: string; jobId?: string; error?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const { agentKey, jobId, error } = body;
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

  // Capture the job before completeJob() (which may prune finished jobs) so we
  // can log a render row. Only successful renders count toward quota.
  const job = getJob(jobId);
  completeJob(jobId, error);

  // Log a completed render so the Free tier's 1-animation cap is metered on the
  // agent path. Paid (minute-metered) tiers render on their own machine and are
  // intentionally NOT logged here — that keeps agent renders quota-free for them.
  // No-op without a DB or on failure. Also skipped under TEST_UNLIMITED, where
  // everyone is Pro/unlimited and no render should count against a Free cap.
  if (db && !error && job && !grantAllPro()) {
    try {
      const [sub] = await db
        .select({ tier: schema.subscriptions.tier })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .limit(1);
      const tier = (sub?.tier as Tier) ?? "free";
      const countMetered = TIERS[tier]?.maxRenders != null;
      if (countMetered) {
        await db.insert(schema.renderLogs).values({
          userId,
          sceneName:       job.compositionId ?? "render",
          durationSeconds: String(jobVideoSeconds(job)),
          tierAtRender:    tier,
          status:          "completed",
        });
      }
    } catch {
      // Logging is best-effort; never fail the agent's completion callback.
    }
  }

  return NextResponse.json({ ok: true });
}
