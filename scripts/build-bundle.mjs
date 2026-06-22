#!/usr/bin/env node
/**
 * Build the Remotion bundle the Render Agent renders from → public/remotion-bundle.
 *
 * Uses @remotion/bundler programmatically (no CLI dependency). Wires the "@"
 * path alias (so @/lib/* resolves) and injects NEXT_PUBLIC_MAPBOX_TOKEN into the
 * bundle (Remotion's webpack does NOT auto-inline NEXT_PUBLIC_* vars, so without
 * this the 4K render would show a blank map).
 *
 *   npm run build:agent-bundle
 */
import { bundle } from "@remotion/bundler";
import path from "path";
import fs from "fs";

const root = process.cwd();
const entryPoint = path.join(root, "src/remotion/root.tsx");
// Build to a temp dir OUTSIDE public/. Remotion copies the project's publicDir
// (public/) into the bundle's own public/ folder — if outDir lived inside
// public/ that copy recurses infinitely (ENAMETOOLONG). We bundle outside, then
// atomically move the result into public/remotion-bundle for Next to serve.
const tmpOut = path.join(root, ".remotion-bundle-tmp");
const finalOut = path.join(root, "public/remotion-bundle");

// Read NEXT_PUBLIC_MAPBOX_TOKEN from the environment or .env.local.
function readMapboxToken() {
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(path.join(root, f), "utf8");
      const m = txt.match(/^\s*NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(.+)\s*$/m);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    } catch {}
  }
  return "";
}
const MAPBOX_TOKEN = readMapboxToken();
if (!MAPBOX_TOKEN) console.warn("⚠️  NEXT_PUBLIC_MAPBOX_TOKEN not found — map renders will be blank until it's set.");

console.log("🎬  Bundling Remotion compositions for the Render Agent…");

// Clean any prior output (incl. a half-built temp dir from a failed run).
// Delete the previous public/remotion-bundle BEFORE bundling too — otherwise
// Remotion copies the stale bundle into the new one's public/ (10 MB of bloat
// compounding every rebuild).
fs.rmSync(tmpOut, { recursive: true, force: true });
fs.rmSync(finalOut, { recursive: true, force: true });

const serveUrl = await bundle({
  entryPoint,
  outDir: tmpOut,
  // The agent fetches this bundle over HTTP from `${origin}/remotion-bundle/`
  // (see /api/agent/bundle-url — Next serves it from public/). Without a matching
  // publicPath the generated index.html points <script> at "/bundle.js" (root),
  // which 404s, so getStaticCompositions never loads and the render fails with
  // "not a valid Remotion project". Pin it to the real serving sub-path.
  publicPath: "/remotion-bundle/",
  onProgress: (p) => process.stdout.write(`\r    bundling ${p}%   `),
  webpackOverride: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), "@": path.join(root, "src") };
    // Inject the public Mapbox token into the existing DefinePlugin.
    const def = (config.plugins || []).find(
      (p) => p && p.constructor && p.constructor.name === "DefinePlugin" && p.definitions,
    );
    if (def) {
      def.definitions["process.env.NEXT_PUBLIC_MAPBOX_TOKEN"] = JSON.stringify(MAPBOX_TOKEN);
    }
    return config;
  },
});

// Move the freshly built bundle into public/remotion-bundle (replace any old one).
fs.rmSync(finalOut, { recursive: true, force: true });
fs.mkdirSync(path.dirname(finalOut), { recursive: true });
fs.renameSync(tmpOut, finalOut);

console.log(`\n✅  Bundle written to ${finalOut}`);
console.log("    The agent will now find it via /api/agent/bundle-url (available: true).");
