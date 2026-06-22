import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rateLimit";

/**
 * POST /api/render-log
 * Body: { sceneName: string; durationSeconds: number; tier?: string }
 *
 * Called by RenderQueueWidget when a job transitions to "done". Inserts a row
 * into render_logs so the monthly quota is correctly accounted for.
 *
 * No-ops gracefully when the DB is not configured (local dev without Supabase).
 */
export async function POST(req: NextRequest) {
  if (!db) return NextResponse.json({ ok: true });

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 30 render-log calls per minute per user is generous for any legitimate use
  if (!rateLimit("render-log", clerkId, { maxRequests: 30, windowSec: 60 })) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { sceneName, durationSeconds } = body as {
    sceneName?: string;
    durationSeconds?: number;
  };

  const MAX_RENDER_SECONDS = 7200; // 2 hours — hard ceiling; no single render is longer

  if (
    !sceneName ||
    typeof sceneName !== "string" ||
    sceneName.length > 500 ||
    typeof durationSeconds !== "number" ||
    durationSeconds < 0 ||
    durationSeconds > MAX_RENDER_SECONDS
  ) {
    return NextResponse.json(
      { error: "Missing or invalid sceneName / durationSeconds" },
      { status: 400 },
    );
  }

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkId, clerkId)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await db.insert(schema.renderLogs).values({
    userId:          user.id,
    sceneName,
    durationSeconds: String(durationSeconds),
    status:          "completed",
  });

  return NextResponse.json({ ok: true });
}
