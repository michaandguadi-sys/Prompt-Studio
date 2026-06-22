#!/usr/bin/env node
/**
 * Smoke test: render a few frames of MapanisyV2 straight from the built bundle,
 * exactly the way the Render Agent does (selectComposition + renderMedia on the
 * public/remotion-bundle serveUrl). Proves the render engine actually produces
 * frames headlessly. Renders a short frameRange at quarter-scale so it's quick.
 *
 *   node scripts/smoke-render.mjs
 */
import { selectComposition, renderMedia } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const root = process.cwd();
const serveUrl = path.join(root, "public/remotion-bundle");
const outFile = path.join(root, ".smoke-render.mp4");

if (!fs.existsSync(path.join(serveUrl, "index.html"))) {
  console.error("✗ No bundle at public/remotion-bundle — run npm run build:agent-bundle first.");
  process.exit(1);
}

console.log("🎬  Smoke-rendering MapanisyV2 from the bundle…");
console.log(`    serveUrl: ${serveUrl}`);

const t0 = Date.now();
// Mapbox GL needs WebGL — headless Chromium has no GPU, so force the ANGLE GL
// backend (software-backed) or every map frame renders blank.
const chromiumOptions = { gl: "angle" };
// Use the composition's baked defaultProps (the default project) by passing none.
const composition = await selectComposition({ serveUrl, id: "MapanisyV2", chromiumOptions });
console.log(`    ✓ selectComposition: ${composition.width}×${composition.height} · ${composition.durationInFrames}f @ ${composition.fps}fps`);

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outFile,
  chromiumOptions,
  scale: 0.25,
  frameRange: [0, 8], // just enough to prove motion + map load render
  videoBitrate: "8M",
  x264Preset: "ultrafast",
  pixelFormat: "yuv420p",
  onProgress: ({ progress, renderedFrames }) =>
    process.stdout.write(`\r    rendering ${Math.round(progress * 100)}% (${renderedFrames} frames)   `),
  overwrite: true,
});

const sec = ((Date.now() - t0) / 1000).toFixed(1);
const size = fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(0) + " KB" : "MISSING";
console.log(`\n✅  Render OK in ${sec}s → ${outFile} (${size})`);
