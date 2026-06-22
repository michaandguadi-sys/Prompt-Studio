/**
 * GET /api/quota — returns the current user's quota status.
 * Used by the dashboard and the render dialog to show usage + block over-limit renders.
 */
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkQuota } from "@/lib/quota";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) {
    // Dev mode without Supabase — return a dummy quota so the UI renders.
    return Response.json({
      allowed: true, usedMinutes: 0, limitMinutes: 9999,
      usedRenders: 0, maxRenders: null, unit: "minute",
      tier: "free", fraction: 0, periodStart: new Date().toISOString(),
    });
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);

  if (!user) return Response.json({ error: "User not found — webhook may not have fired yet" }, { status: 404 });

  const quota = await checkQuota(user.id);
  return Response.json(quota);
}
