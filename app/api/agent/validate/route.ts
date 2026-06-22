/**
 * GET /api/agent/validate?key=AGENT_KEY
 * Returns { valid: boolean } — no Clerk auth required.
 * Used by the render-preview page to verify the key before rendering.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { devUserIdForKey } from "@/lib/devAgentStore";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ valid: false });

  // Dev fallback — validate against the file-backed store.
  if (!db) return NextResponse.json({ valid: !!devUserIdForKey(key) });

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.agentKey, key))
    .limit(1);

  return NextResponse.json({ valid: !!user });
}
