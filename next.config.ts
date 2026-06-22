import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ["mapbox-gl", "react-map-gl"],
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
