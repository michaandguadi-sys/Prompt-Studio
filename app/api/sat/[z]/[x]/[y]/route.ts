import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Satellite tile proxy — re-serves ESRI World Imagery tiles WITH CORS so the
 * headless Remotion render agent can load them reliably.
 *
 * Why proxied: ArcGIS sends varying CORS headers and may throttle or block bulk
 * parallel requests from a headless Chrome user-agent, causing blank / half-painted
 * tiles in exported videos. Routing through this proxy:
 *   - Adds `Access-Control-Allow-Origin: *` unconditionally.
 *   - Adds aggressive `Cache-Control: immutable` so repeated frames that share the
 *     same viewport don't re-fetch — the render agent can easily hit 100+ tiles
 *     per second for a smooth fly-through.
 *   - Uses `next/fetch` `force-cache` so Next.js dedupes fetches across workers.
 *
 * Public — the render agent has no Clerk session, same as the DEM proxy.
 * Tile coords validated as integers and range-checked to prevent SSRF.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit("sat-tile", clientIp, { maxRequests: 500, windowSec: 60 })) {
    return new NextResponse("rate limit exceeded", { status: 429 });
  }
  const { z, x, y } = await params;
  const Z = Number(z);
  const X = Number(x);
  const Y = Number((y || "").replace(/\.(?:png|jpg|jpeg)$/i, ""));
  if (
    ![Z, X, Y].every((n) => Number.isInteger(n) && n >= 0) ||
    Z > 20 || X >= 2 ** Z || Y >= 2 ** Z
  ) {
    return new NextResponse("bad tile coords", { status: 400 });
  }

  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${Y}/${X}`;
  try {
    const res = await fetch(url, {
      cache: "force-cache",
      headers: { "User-Agent": "Mapanisy-RenderAgent/1.0 (+https://mapanisy.com)" },
    });
    if (!res.ok) {
      return new NextResponse("upstream error", { status: res.status });
    }
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") || "image/jpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=2592000, immutable", // 30 days
        "X-Proxy": "mapanisy-sat",
      },
    });
  } catch {
    return new NextResponse("upstream unreachable", { status: 502 });
  }
}
