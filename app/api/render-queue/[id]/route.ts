import { NextRequest, NextResponse } from "next/server";
import { getJob, cancel } from "@/lib/renderQueue";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = cancel(id);
  if (!ok) return NextResponse.json({ error: "Cannot cancel (not running/queued)" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
