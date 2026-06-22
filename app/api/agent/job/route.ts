/**
 * GET /api/agent/job?key=AGENT_KEY
 * Long-polls (up to 25 s) for the next pending render job for this agent's user.
 * Returns the job (TSX + settings) when one arrives, or { job: null } on timeout.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { heartbeat, pollNextJob } from "@/lib/agentBridge";
import { devUserIdForKey } from "@/lib/devAgentStore";

export const maxDuration = 30; // Vercel function timeout (seconds)

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  // Resolve the agent key → internal userId (DB, or dev store when no DB).
  let userId: string | null;
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.agentKey, key))
      .limit(1);
    userId = user?.id ?? null;
  } else {
    userId = devUserIdForKey(key);
  }

  if (!userId) return NextResponse.json({ error: "Invalid agent key" }, { status: 401 });

  // Keep agent session alive while it's polling
  heartbeat(key, userId, req.headers.get("x-agent-machine") ?? "Unknown");

  const job = await pollNextJob(userId, 25_000);
  return NextResponse.json({ job });
}
