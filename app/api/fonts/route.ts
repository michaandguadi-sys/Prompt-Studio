/**
 * GET /api/fonts — same-origin proxy for the webfonts stylesheet.
 *
 * Headless Chromium (the render worker) gets a 400 / ERR_BLOCKED_BY_ORB when it
 * loads the Google-Fonts stylesheet cross-origin directly, so titles/labels
 * export in a fallback font. This proxy fetches the CSS server-side with a
 * normal desktop UA (Google serves woff2 happily) and rewrites the gstatic
 * font-file URLs to /api/fonts/file so EVERYTHING is same-origin — no ORB, no
 * UA 400. Mirrors the /api/sat + /api/dem tile-proxy pattern the renderer uses.
 */
import { NextResponse } from "next/server";
import { WEBFONTS_CSS_URL } from "@/v2/doc/themes";

// A stable desktop Chrome UA — Google Fonts serves woff2 @font-face rules for
// this (chrome-headless-shell's own UA gets a 400 on the long multi-family URL).
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET() {
  try {
    const res = await fetch(WEBFONTS_CSS_URL, {
      headers: { "User-Agent": DESKTOP_UA, Accept: "text/css,*/*;q=0.1" },
    });
    if (!res.ok) {
      // Never hard-fail a render over fonts — fall back to system fonts.
      return new NextResponse(`/* webfonts upstream ${res.status} */`, {
        status: 200,
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    }
    let css = await res.text();
    // Route every gstatic font file through the same-origin file proxy.
    css = css.replace(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g, (u) => `/api/fonts/file?u=${encodeURIComponent(u)}`);
    return new NextResponse(css, {
      status: 200,
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(`/* webfonts proxy error */`, {
      status: 200,
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }
}
