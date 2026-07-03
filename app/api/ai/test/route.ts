/**
 * POST /api/ai/test — verify a bring-your-own AI connection actually works.
 * Body: { ai?: UserAIConfig } — when omitted, tests the server's env-configured
 * provider. Sends a one-token prompt and reports ok/error + latency, so the
 * Settings modal can show "Connected ✓" before the user relies on it.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { aiComplete, configFromUser, resolveAIConfig } from "@/lib/ai/providers";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const cfg = configFromUser(body?.ai) ?? resolveAIConfig();
  if (!cfg) return NextResponse.json({ ok: false, error: "No AI provider configured — pick a provider and paste your API key." });

  const t0 = Date.now();
  const r = await aiComplete(
    "You are a connection test. Reply with exactly: OK",
    "ping",
    cfg,
    { maxTokens: 8, temperature: 0, timeoutMs: 20_000, retries: 0 },
  );
  const latencyMs = Date.now() - t0;
  if (r.text === null) return NextResponse.json({ ok: false, label: cfg.label, latencyMs, error: r.error ?? "No response from the provider." });
  return NextResponse.json({ ok: true, label: cfg.label, latencyMs });
}
