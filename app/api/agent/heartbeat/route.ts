/**
 * POST /api/agent/heartbeat
 * Called by the Render Agent every 30 seconds to mark itself as online.
 * Body: { agentKey: string; machine: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { heartbeat } from "@/lib/agentBridge";
import { devUserIdForKey } from "@/lib/devAgentStore";

export async function POST(req: NextRequest) {
  let body: { agentKey?: string; machine?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const { agentKey, machine } = body;
  if (!agentKey) return NextResponse.json({ error: "Missing agentKey" }, { status: 400 });

  let userId: string | null;
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.agentKey, agentKey))
      .limit(1);
    userId = user?.id ?? null;
  } else {
    userId = devUserIdForKey(agentKey);
  }

  if (!userId) return NextResponse.json({ error: "Invalid agent key" }, { status: 401 });

  heartbeat(agentKey, userId, machine ?? "Unknown device");
  return NextResponse.json({ ok: true });
}
