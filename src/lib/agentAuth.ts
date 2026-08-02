/**
 * Agent render endpoints are Clerk-public and authenticate with the CLI --key.
 * Any route that acts on a specific job must (1) resolve the key to a user and
 * (2) verify the job belongs to that user — otherwise a valid key could touch a
 * stranger's render by guessing its id (IDOR). Centralized here so a new
 * job-scoped route can't accidentally skip the ownership check.
 */
import { db, schema } from "./db";
import { eq } from "drizzle-orm";
import { devUserIdForKey } from "./devAgentStore";
import { getJob, type AgentJob } from "./agentBridge";

export type AgentJobAuth =
  | { ok: true; userId: string; job: AgentJob }
  | { ok: false; status: number; error: string };

/** Resolve `agentKey → userId` and confirm `jobId` is owned by that user. */
export async function authorizeAgentJob(agentKey?: string, jobId?: string): Promise<AgentJobAuth> {
  if (!agentKey || !jobId) return { ok: false, status: 400, error: "Missing fields" };

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
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };

  const job = getJob(jobId);
  if (!job || job.userId !== userId) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, userId, job };
}
