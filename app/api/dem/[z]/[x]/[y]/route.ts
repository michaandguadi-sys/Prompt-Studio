import { NextRequest, NextResponse } from "next/server";

/**
 * DEM tile proxy — re-serves the free AWS terrarium elevation tiles WITH CORS so
 * MapLibre can load them for real 3-D mesh terrain (`setTerrain`). The upstream
 * (s3.amazonaws.com/elevation-tiles-prod) sends no `Access-Control-Allow-Origin`,
 * which silently breaks terrain. The upstream host is fixed and the tile coords
 * are validated as integers, so there's no SSRF surface. Public (the render agent
 * has no Clerk session) — see middleware isPublic.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await params;
  const Z = Number(z), X = Number(x), Y = Number((y || "").replace(/\.png$/i, ""));
  if (![Z, X, Y].every((n) => Number.isInteger(n) && n >= 0) || Z > 16 || X > 2 ** Z || Y > 2 ** Z) {
    return new NextResponse("bad tile", { status: 400 });
  }
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${X}/${Y}.png`;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return new NextResponse("not found", { status: res.status });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse("upstream error", { status: 502 });
  }
}
