/**
 * GET /api/fonts/file?u=<gstatic url> — same-origin proxy for a single webfont
 * file (woff2). Only fonts.gstatic.com is allowed. Long-cached + immutable.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new NextResponse("missing u", { status: 400 });
  let url: URL;
  try { url = new URL(u); } catch { return new NextResponse("bad url", { status: 400 }); }
  if (url.protocol !== "https:" || url.hostname !== "fonts.gstatic.com") {
    return new NextResponse("forbidden host", { status: 403 });
  }
  try {
    const res = await fetch(url.toString(), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return new NextResponse("upstream error", { status: 502 });
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type")
      || (url.pathname.endsWith(".woff2") ? "font/woff2" : url.pathname.endsWith(".woff") ? "font/woff" : "application/octet-stream");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return new NextResponse("fetch error", { status: 502 });
  }
}
