import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getJob, cancel } from "@/lib/renderQueue";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const job = getJob(id);
  // 404 for both missing AND not-owned so job ids aren't enumerable across users.
  if (!job || job.userId !== clerkId) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const job = getJob(id);
  if (!job || job.userId !== clerkId) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const ok = cancel(id);
  if (!ok) return NextResponse.json({ error: "Cannot cancel (not running/queued)" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
