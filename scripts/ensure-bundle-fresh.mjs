#!/usr/bin/env node
/**
 * Keep the Remotion render bundle (public/remotion-bundle) in sync with the
 * render code during local dev.
 *
 * The Render Agent and the server render worker both render from the PREBUILT
 * bundle — NOT from live source. `next dev` never rebuilds it, so editing a
 * render component (MapComposition, the overlay views, root.tsx…) and then
 * rendering silently uses STALE code — the classic "my new elements don't show
 * up in the export" bug. This guard runs as `predev`: it compares the bundle's
 * timestamp to the newest render-source file and rebuilds ONLY when something
 * changed (a fast mtime scan when nothing did, so `npm run dev` stays snappy).
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const bundleIndex = path.join(root, "public/remotion-bundle/index.html");
// The directories whose changes must be reflected in a re-render.
const WATCH = ["src/v2/render", "src/remotion", "src/v2/doc"];

function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { const m = fs.statSync(p).mtimeMs; if (m > newest) newest = m; } catch { /* ignore */ } }
    }
  };
  walk(dir);
  return newest;
}

const bundleMtime = fs.existsSync(bundleIndex) ? fs.statSync(bundleIndex).mtimeMs : 0;
const srcMtime = Math.max(0, ...WATCH.map((d) => newestMtime(path.join(root, d))));

if (bundleMtime !== 0 && bundleMtime >= srcMtime) {
  console.log("🎬  Remotion render bundle is fresh — renders will include every element.");
  process.exit(0);
}

console.log(
  bundleMtime === 0
    ? "🎬  Remotion render bundle missing — building it so renders work…"
    : "🎬  Render code changed since the last bundle — rebuilding so exports include every element…",
);
try {
  execFileSync(process.execPath, [path.join(root, "scripts/build-bundle.mjs")], { stdio: "inherit" });
} catch (e) {
  // Never block `npm run dev` on a bundle build failure — just warn loudly.
  console.warn("⚠️  Bundle rebuild failed — renders may be stale. Fix, then run: npm run build:agent-bundle");
  console.warn(String(e?.message ?? e));
}
