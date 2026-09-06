import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Reduce referrer leakage
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), fullscreen=(self)" },
  // DNS prefetch control
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // HSTS — only enforced over HTTPS; safe to ship now, ignored on HTTP
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // X-XSS-Protection is DEPRECATED. The legacy auditor it enabled could itself
  // be abused to introduce XSS, so every major browser removed it and the
  // guidance is to explicitly disable it rather than turn it on. Real XSS
  // defence here is React's escaping + a CSP (see LAUNCH.md backlog).
  { key: "X-XSS-Protection", value: "0" },
];

const config: NextConfig = {
  // Allow an isolated build dir (e.g. verification builds alongside a live dev
  // server) without clobbering the dev server's .next. Unset in normal use.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: false,
  // This app renders every image through MapLibre/deck.gl canvases and plain
  // <img>; there is not one `next/image` import in app/ or src/. Disabling the
  // optimizer turns that into an enforced guarantee rather than a coincidence:
  //  • /_next/image stops being a reachable endpoint (it is a known SSRF and
  //    CPU-exhaustion surface — costly on a 4 vCPU VPS that also renders video).
  //  • Next's bundled `sharp` (0.34.5, carrying the libvips CVEs in
  //    GHSA-f88m-g3jw-g9cj) is never invoked.
  images: { unoptimized: true },
  transpilePackages: ["mapbox-gl", "react-map-gl"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // searoute-js `require`s a marine-network JSON by relative path. Keep it
  // external so Node requires it natively at runtime instead of Turbopack
  // trying to inline the data file into the route bundle (which 404s the route).
  serverExternalPackages: ["searoute-js", "@aws-sdk/client-s3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // NOTE: do NOT pin turbopack.root — doing so wedged dev-mode page compilation
  // here. The "inferred workspace root" warning (a stray ~/package-lock.json) is
  // cosmetic; delete that lockfile to silence it.
  turbopack: {
    resolveAlias: {},
  },
};

export default config;
