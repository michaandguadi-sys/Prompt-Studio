/**
 * POST /api/v2/restyle  { videoUrl, prompt, restyle? } → { job }
 * GET  /api/v2/restyle?id=ID[&...byo] → { job }
 *
 * Submits a rendered map video to a video-to-video model to re-style it (anime,
 * oil paint, etc.), and polls the job. Provider is BYO (sent from the client) or
 * server env. The video must be a publicly-fetchable URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { submitRestyle, pollRestyle, resolveRestyleConfig, restyleConfigFromUser } from "@/lib/ai/restyle";
import { rateLimit } from "@/lib/rateLimit";
import { checkQuota } from "@/lib/quota";
import { resolveOrCreateUserId } from "@/lib/users";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  // Restyle is the most expensive AI call in the app. Rate-limit EVERY caller…
  if (!rateLimit("restyle", clerkId, { maxRequests: 5, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many restyle requests — give it a minute." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const videoUrl = String(body?.videoUrl ?? "").trim();
  const prompt = String(body?.prompt ?? "").trim();
  if (!videoUrl) return NextResponse.json({ error: "A public video URL is required." }, { status: 400 });

  const byo = restyleConfigFromUser(body?.restyle);
  const cfg = byo ?? resolveRestyleConfig();
  if (!cfg) return NextResponse.json({ error: "No restyle provider configured. Add one in Settings (gear) or set RESTYLE_* env." }, { status: 501 });

  const uid = await resolveOrCreateUserId(clerkId).catch(() => null);
  // …and meter the OPERATOR-credit path against quota so a free user can't run
  // up an unbounded Replicate/Runway bill. BYO keys (the user's own provider)
  // are the user's cost, so they skip quota (still rate-limited above).
  if (!byo && uid) {
    const q = await checkQuota(uid);
    if (!q.allowed) {
      return NextResponse.json({ error: "quota_exceeded", message: "You've used your free allowance. Upgrade to keep restyling.", upgradeUrl: "/pricing" }, { status: 402 });
    }
  }

  const job = await submitRestyle(videoUrl, prompt || "cinematic restyle", cfg);
  if (!job || !job.id) return NextResponse.json({ error: job?.error ?? "Failed to start restyle." }, { status: 502 });
  // Record ownership so status/output polling is scoped to the submitter (closes
  // the cross-user poll leak on the shared-key path). Best-effort.
  if (db && uid) {
    try { await db.insert(schema.restyleJobs).values({ jobId: job.id, userId: uid, provider: cfg.label }).onConflictDoNothing(); } catch { /* non-fatal */ }
  }
  return NextResponse.json({ job, provider: cfg.label });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("restyle-poll", userId, { maxRequests: 60, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // BYO config can be passed as query params for polling (provider+key).
  const sp = req.nextUrl.searchParams;
  const byoCfg = restyleConfigFromUser({ provider: sp.get("provider") ?? undefined, apiKey: sp.get("apiKey") ?? undefined, model: sp.get("model") ?? undefined, baseUrl: sp.get("baseUrl") ?? undefined });

  // Shared-key polling must be scoped to the job's owner — otherwise any authed
  // user who learns a job id could read another user's restyle status/output.
  // BYO polling uses the caller's own provider key, so it can't leak ours.
  if (!byoCfg && db) {
    try {
      const uid = await resolveOrCreateUserId(userId).catch(() => null);
      const [row] = uid
        ? await db.select({ owner: schema.restyleJobs.userId }).from(schema.restyleJobs).where(eq(schema.restyleJobs.jobId, id)).limit(1)
        : [];
      if (!row || row.owner !== uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } catch {
      // restyle_jobs not migrated yet (pre db:push) or a transient DB error —
      // degrade to the prior behavior rather than 500 the poll. Ownership scoping
      // resumes once the table exists.
    }
  }

  const cfg = byoCfg ?? resolveRestyleConfig();
  if (!cfg) return NextResponse.json({ error: "No restyle provider configured." }, { status: 501 });

  const job = await pollRestyle(id, cfg);
  if (!job) return NextResponse.json({ error: "Could not fetch job status." }, { status: 502 });
  return NextResponse.json({ job });
}
