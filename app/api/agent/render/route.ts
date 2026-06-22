/**
 * POST /api/agent/render
 * Browser-facing. Generates TSX for the spec and enqueues a render job
 * for the current user's connected Render Agent.
 * Body: { spec: SceneSpec, settings: AgentJobSettings }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateMapSceneTsx } from "@/lib/codegen/mapScene";
import { generateDataVizSceneTsx } from "@/lib/codegen/dataVizScene";
import { generateTitleSceneTsx } from "@/lib/codegen/titleScene";
import { generateLowerThirdSceneTsx } from "@/lib/codegen/lowerThirdScene";
import { generateQuoteSceneTsx } from "@/lib/codegen/quoteScene";
import { toComponentName } from "@/lib/codegen/util";
import { enqueueAgentJob, sessionForUser, type AgentJobSettings } from "@/lib/agentBridge";
import { checkQuota } from "@/lib/quota";
import { ExportSpecPayload, parseOrError } from "@/lib/schemas";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";
import type { SceneSpec } from "@/lib/types";

function generateTsx(spec: SceneSpec): string {
  switch (spec.kind) {
    case "map":        return generateMapSceneTsx(spec);
    case "dataviz":    return generateDataVizSceneTsx(spec);
    case "title":      return generateTitleSceneTsx(spec);
    case "quote":      return generateQuoteSceneTsx(spec);
    default:           return generateLowerThirdSceneTsx(spec);
  }
}

function buildRootTsx(spec: SceneSpec): string {
  const id        = spec.name.replace(/[^a-zA-Z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "Untitled";
  const component = toComponentName(id);
  const frames    = Math.round(spec.durationSec * spec.fps);
  return `import { Composition } from "remotion";
import { ${component} } from "./${id}";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="${id}"
      component={${component}}
      durationInFrames={${frames}}
      fps={${spec.fps}}
      width={${spec.width}}
      height={${spec.height}}
    />
  </>
);
`;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  // Validate spec
  const parsed = parseOrError(ExportSpecPayload, rawBody);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const spec = parsed.data.spec as SceneSpec;
  const settings = ((rawBody as any).settings ?? {}) as AgentJobSettings;

  // Look up internal user id — via DB, or the dev store when no DB.
  let userId: string;
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.clerkId, clerkId))
      .limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    userId = user.id;
  } else {
    userId = devGetOrCreateUserByClerk(clerkId).id;
  }

  // Verify agent is online
  const session = sessionForUser(userId);
  if (!session) return NextResponse.json({ error: "Render Agent not connected" }, { status: 409 });

  // Sanitize name (match export-tsx logic)
  spec.name = spec.name
    .replace(/[^a-zA-Z0-9\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "Untitled";

  const tsx     = generateTsx(spec);
  const rootTsx = buildRootTsx(spec);

  // Optional multi-scene sequence. When present (>1 scene), the agent renders
  // the whole timeline via the PromptStudioSequence composition. We trust the
  // client-side type system for the nested scene shapes (same posture as the
  // single-spec validation, which is intentionally permissive on deep fields).
  const rawScenes = (rawBody as any).scenes;
  const scenes: unknown[] | undefined =
    Array.isArray(rawScenes) && rawScenes.length > 1 ? rawScenes : undefined;

  // Quota + watermark, both derived server-side from the user's subscription so
  // the client can't tamper its way past them. When no DB is configured (local
  // dev) checkQuota allows everything and we treat the user as the operator.
  // Agent renders run on the user's OWN machine, so paid (minute-metered) tiers
  // are intentionally unmetered here. Only count-metered tiers (the Free plan's
  // 1-animation trial) are gated on this path — otherwise Free would be unlimited.
  const quota = await checkQuota(userId);
  if (db && quota.unit === "animation" && !quota.allowed) {
    return NextResponse.json({
      error:      "quota_exceeded",
      message:    `You've used your ${quota.maxRenders} free animation${quota.maxRenders === 1 ? "" : "s"}. Upgrade to keep rendering.`,
      tier:       quota.tier,
      unit:       quota.unit,
      usedRenders: quota.usedRenders,
      maxRenders:  quota.maxRenders,
      upgradeUrl: "/pricing",
    }, { status: 402 });
  }
  const watermark = !!db && quota.tier === "free";

  const job = enqueueAgentJob(userId, spec.name, tsx, rootTsx, settings, spec, scenes, watermark);
  return NextResponse.json({
    ok: true,
    jobId: job.id,
    compositionId: spec.name,
    sceneCount: scenes ? scenes.length : 1,
    watermark,
  });
}
