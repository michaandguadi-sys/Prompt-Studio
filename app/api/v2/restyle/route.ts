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
import { submitRestyle, pollRestyle, resolveRestyleConfig, restyleConfigFromUser } from "@/lib/ai/restyle";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const videoUrl = String(body?.videoUrl ?? "").trim();
  const prompt = String(body?.prompt ?? "").trim();
  if (!videoUrl) return NextResponse.json({ error: "A public video URL is required." }, { status: 400 });

  const cfg = restyleConfigFromUser(body?.restyle) ?? resolveRestyleConfig();
  if (!cfg) return NextResponse.json({ error: "No restyle provider configured. Add one in Settings (gear) or set RESTYLE_* env." }, { status: 501 });

  const job = await submitRestyle(videoUrl, prompt || "cinematic restyle", cfg);
  if (!job || !job.id) return NextResponse.json({ error: job?.error ?? "Failed to start restyle." }, { status: 502 });
  return NextResponse.json({ job, provider: cfg.label });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // BYO config can be passed as query params for polling (provider+key).
  const sp = req.nextUrl.searchParams;
  const cfg = restyleConfigFromUser({ provider: sp.get("provider") ?? undefined, apiKey: sp.get("apiKey") ?? undefined, model: sp.get("model") ?? undefined, baseUrl: sp.get("baseUrl") ?? undefined }) ?? resolveRestyleConfig();
  if (!cfg) return NextResponse.json({ error: "No restyle provider configured." }, { status: 501 });

  const job = await pollRestyle(id, cfg);
  if (!job) return NextResponse.json({ error: "Could not fetch job status." }, { status: 502 });
  return NextResponse.json({ job });
}
