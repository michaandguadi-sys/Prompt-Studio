import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { enqueue, listJobsForUser, clearFinished, type JobSettings } from "@/lib/renderQueue";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkQuota } from "@/lib/quota";
import { rateLimit } from "@/lib/rateLimit";

/**
 * GET /api/render-queue       — list the CALLER'S jobs (newest first)
 * POST /api/render-queue      — enqueue a new render job (quota-gated)
 * DELETE /api/render-queue    — clear the caller's finished jobs
 *
 * The queue is shared process memory, so every handler is auth-gated and scoped
 * to the caller — one user must never see or clear another user's jobs.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ jobs: listJobsForUser(clerkId) });
}

export async function POST(req: NextRequest) {
  // ── Auth + rate limit ──────────────────────────────────────────────────
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("render-queue", clerkId, { maxRequests: 10, windowSec: 60 })) {
    return NextResponse.json({ error: "Rate limit exceeded — max 10 renders per minute" }, { status: 429 });
  }

  // ── Quota check ────────────────────────────────────────────────────────
  // When DB is configured, block renders that exceed the user's monthly limit.
  if (db) {
    if (clerkId) {
      const [user] = await db.select().from(schema.users)
        .where(eq(schema.users.clerkId, clerkId)).limit(1);

      if (user) {
        const quota = await checkQuota(user.id);
        if (!quota.allowed) {
          const message = quota.unit === "animation"
            ? `You've used your ${quota.maxRenders} free animation${quota.maxRenders === 1 ? "" : "s"}. Upgrade to keep rendering.`
            : `You've used ${quota.usedMinutes.toFixed(1)} of your ${quota.limitMinutes} render minutes this month.`;
          return NextResponse.json({
            error:        "quota_exceeded",
            message,
            usedMinutes:  quota.usedMinutes,
            limitMinutes: quota.limitMinutes,
            usedRenders:  quota.usedRenders,
            maxRenders:   quota.maxRenders,
            unit:         quota.unit,
            tier:         quota.tier,
            upgradeUrl:   "/pricing",
          }, { status: 402 });
        }
      }
    }
  }


  // ── Enqueue ────────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { compositionId, settings } = body as {
    compositionId: string;
    settings?: JobSettings;
  };
  if (!compositionId || typeof compositionId !== "string" || !/^[a-zA-Z0-9-]+$/.test(compositionId)) {
    return NextResponse.json({ error: "Invalid compositionId" }, { status: 400 });
  }
  const job = enqueue(compositionId, settings ?? {}, clerkId);
  return NextResponse.json({ job });
}

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const n = clearFinished(clerkId);
  return NextResponse.json({ cleared: n });
}
