/**
 * POST /api/v2/upload  (multipart form-data, field "file")
 *   → { url }   a public R2 URL for the uploaded video.
 *
 * Used to host a rendered/exported clip so the AI restyle model can fetch it.
 * Requires R2 env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME, R2_PUBLIC_URL); returns 501 when not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL,
} = process.env;

function r2(): S3Client | null {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const client = r2();
  if (!client) return NextResponse.json({ error: "Cloud storage (R2) is not configured." }, { status: 501 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected multipart form-data." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "File too large (200 MB max)." }, { status: 413 });

  const ext = (file.name.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp4";
  const key = `restyle-src/${userId.slice(0, 8)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: file.type || "video/mp4",
    }));
    return NextResponse.json({ url: `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}` });
  } catch (e: any) {
    return NextResponse.json({ error: `Upload failed: ${String(e?.message ?? e)}` }, { status: 502 });
  }
}
