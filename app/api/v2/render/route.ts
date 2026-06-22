/**
 * POST /api/v2/render — enqueue a Mapanisy v2 project for 4K render on the
 * user's local Render Agent (renders the `MapanisyV2` Remotion composition).
 * Body: { project: Project, settings?: AgentJobSettings }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { enqueueAgentJob, sessionForUser, type AgentJobSettings } from "@/lib/agentBridge";
import { checkQuota } from "@/lib/quota";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";
import { Project as ProjectSchema } from "@/v2/doc/schema";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const parsed = ProjectSchema.safeParse(body?.project);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const project = parsed.data;
  const settings = (body?.settings ?? {}) as AgentJobSettings;

  // Resolve internal user id (DB or dev store).
  let userId: string;
  if (db) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.clerkId, clerkId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    userId = user.id;
  } else {
    userId = devGetOrCreateUserByClerk(clerkId).id;
  }

  // Agent must be online.
  if (!sessionForUser(userId)) return NextResponse.json({ error: "Render Agent not connected" }, { status: 409 });

  // Quota + watermark (count-metered free tier gated on the agent path).
  const quota = await checkQuota(userId);
  if (db && quota.unit === "animation" && !quota.allowed) {
    return NextResponse.json({
      error: "quota_exceeded",
      message: `You've used your ${quota.maxRenders} free animation${quota.maxRenders === 1 ? "" : "s"}. Upgrade to keep rendering.`,
      tier: quota.tier, unit: quota.unit, upgradeUrl: "/pricing",
    }, { status: 402 });
  }
  const watermark = !!db && quota.tier === "free";

  const name = (project.name || "mapanisy").replace(/[^a-zA-Z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "mapanisy";

  // Render the WHOLE STORY (every scene back-to-back as one film) when the
  // caller asks for it and there's more than one scene; otherwise just the
  // single active composition.
  const story = !!body?.story && Array.isArray(project.scenes) && project.scenes.length > 1;
  const job = story
    ? enqueueAgentJob(userId, name, "", "", settings, undefined, undefined, watermark, undefined, project.scenes)
    : enqueueAgentJob(userId, name, "", "", settings, undefined, undefined, watermark, project.composition);

  return NextResponse.json({ ok: true, jobId: job.id, compositionId: story ? "MapanisyStory" : "MapanisyV2", watermark, scenes: story ? project.scenes.length : 1 });
}
