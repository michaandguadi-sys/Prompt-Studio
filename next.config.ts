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
  // Prevent cross-site scripting via unguessable token
  { key: "X-XSS-Protection", value: "1; mode=block" },
];

const config: NextConfig = {
  reactStrictMode: false,
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
