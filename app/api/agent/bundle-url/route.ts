/**
 * GET /api/agent/bundle-url?key=AGENT_KEY
 *
 * Returns the URL of the Remotion bundle that the agent should use
 * as `serveUrl` for renderMedia().
 *
 * The bundle is built at deploy time via:
 *   npm run build:agent-bundle   (→ scripts/build-bundle.mjs)
 *
 * Returns:
 *   { bundleUrl: string, compositionId: "MapanisyV2", available: boolean }
 * (The agent picks the actual composition id per job — MapanisyV2 for v2 docs.)
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { existsSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  // Validate agent key
  if (db) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.agentKey, key))
      .limit(1);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine the origin to build the absolute bundle URL
  const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const bundleUrl = `${origin}/remotion-bundle/`;

  // Check if the bundle has been built (public/remotion-bundle/index.html exists)
  const bundleIndex = path.resolve(process.cwd(), "public/remotion-bundle/index.html");
  const available = existsSync(bundleIndex);

  return NextResponse.json({
    bundleUrl,
    compositionId: "MapanisyV2",
    available,
    buildInstructions: available ? null : "Run: npm run build:agent-bundle",
  });
}
