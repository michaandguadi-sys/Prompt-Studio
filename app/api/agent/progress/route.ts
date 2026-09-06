/**
 * POST /api/agent/progress
 * Called by the Render Agent to report frame-by-frame render progress.
 * Body: { agentKey: string; jobId: string; progress: number; message: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { updateProgress } from "@/lib/agentBridge";
import { authorizeAgentJob } from "@/lib/agentAuth";

export async function POST(req: NextRequest) {
  let body: { agentKey?: string; jobId?: string; progress?: number; message?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  // Auth + ownership: only report progress on your OWN job (see agentAuth).
  const authz = await authorizeAgentJob(body.agentKey, body.jobId);
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  updateProgress(body.jobId!, body.progress ?? 0, body.message ?? "");
  return NextResponse.json({ ok: true });
}
