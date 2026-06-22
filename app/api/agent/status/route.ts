/**
 * GET /api/agent/status
 * Called by the browser to check if the current user's Render Agent is online.
 * Returns { online: boolean; machine?: string; jobs: AgentJob[] }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessionForUser, listJobsForUser } from "@/lib/agentBridge";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Dev fallback — resolve user via the file-backed store.
  if (!db) {
    const { id } = devGetOrCreateUserByClerk(clerkId);
    const session = sessionForUser(id);
    return NextResponse.json({ online: !!session, machine: session?.machine, jobs: listJobsForUser(id) });
  }

  const [user] = await db
    .select({ id: schema.users.id, agentKey: schema.users.agentKey })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);

  if (!user) return NextResponse.json({ online: false, jobs: [] });

  const session = sessionForUser(user.id);
  const jobs    = listJobsForUser(user.id);

  return NextResponse.json({
    online:  !!session,
    machine: session?.machine,
    jobs,
  });
}
