/**
 * GET /api/v2/render/[jobId]/file — stream a finished cloud render to the
 * browser as a download. Owner-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getServerJob } from "@/lib/serverRender";
import { devGetOrCreateUserByClerk } from "@/lib/devAgentStore";
import fs from "fs";
import { Readable } from "stream";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await ctx.params;

  let userId: string | null;
  if (db) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.clerkId, clerkId)).limit(1);
    userId = user?.id ?? null;
  } else {
    userId = devGetOrCreateUserByClerk(clerkId).id;
  }

  const job = getServerJob(jobId);
  if (!job || job.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "done" || !fs.existsSync(job.outFile)) {
    return NextResponse.json({ error: "Not ready" }, { status: 409 });
  }

  const stat = fs.statSync(job.outFile);
  const stream = Readable.toWeb(fs.createReadStream(job.outFile)) as unknown as ReadableStream;
  const safeName = (job.name || "animation").replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "animation";
  return new NextResponse(stream, {
    headers: {
      "Content-Type": job.ext === "mov" ? "video/quicktime" : "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${safeName}.${job.ext}"`,
      "Cache-Control": "no-store",
    },
  });
}
