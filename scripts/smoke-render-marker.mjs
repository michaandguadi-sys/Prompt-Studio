#!/usr/bin/env node
/**
 * Smoke test for the MARKER element + antique MAP FILTER. Builds a comp with a
 * ⚔️ swords marker (pop-in, glow, locator ring, caption) over an antique-graded
 * map + a title, then renders a few mid frames headlessly. Exercises MarkerView
 * and mapFilterCss in the real Remotion/Chromium render path.
 */
import { selectComposition, renderMedia } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const root = process.cwd();
const serveUrl = path.join(root, "public/remotion-bundle");
const outFile = path.join(root, ".smoke-marker.mp4");
const chromiumOptions = { gl: "angle" };

const timing = { inSec: 0.3, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" };
const tf = { offsetXPct: 0, offsetYPct: 0, scale: 1, rotation: 0 };

const comp = {
  aspect: "16:9", fps: 24, durationSec: 4,
  basemap: { styleUrl: "mapbox://styles/mapbox/dark-v11", showStreets: false, showLabels: true, buildings3d: false, terrain: false, transparentBg: false },
  theme: { name: "Conflict Red", accent: "#ff5a44", fill: "#3a0a0a", border: "#ffffff", glow: "#ff4444", text: "#ffffff", fontDisplay: "Oswald", fontBody: "Inter" },
  look: { vignette: 0.6, letterbox: 0.1, grain: 0.2, texture: "none", textureOpacity: 0.5, mapFilter: "antique", mapFilterAmount: 0.9, tintColor: "#1a0606", tintOpacity: 0.2, bgColor: "#0a0303" },
  layers: [
    { id: "cam1", name: "Camera", enabled: true, type: "camera",
      start: { lon: 74, lat: 25, zoom: 3, pitch: 0, bearing: 0 },
      end: { lon: 74, lat: 26, zoom: 4.4, pitch: 40, bearing: -10 },
      waypoints: [], style: "zoom-out", moveFraction: 0.85, easing: "easeInOut", smoothPath: true },
    { id: "mk1", name: "Swords", enabled: true, type: "marker", timing,
      anchor: { lon: 74, lat: 26 }, icon: "swords", emoji: "", sizePx: 150, color: "#ff3030", glow: 0.8, ring: true, label: "KASHMIR", labelColor: "#ffffff", animation: "pop", transform: tf },
    { id: "ti1", name: "Title", enabled: true, type: "title", timing,
      text: "FLASHPOINT", sub: "contested border", template: "impact", align: "center", position: "bottom", color: "#ffffff", accent: "#ff5a44", fontFamily: null, transform: tf },
  ],
};

console.log("🎬  Smoke-rendering MARKER + antique filter…");
const composition = await selectComposition({ serveUrl, id: "MapanisyV2", inputProps: { comp, watermark: false }, chromiumOptions });
console.log(`    ✓ ${composition.width}×${composition.height} · ${composition.durationInFrames}f`);
await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: outFile, chromiumOptions,
  inputProps: { comp, watermark: false }, scale: 0.25, frameRange: [20, 36],
  videoBitrate: "8M", x264Preset: "ultrafast", pixelFormat: "yuv420p",
  onProgress: ({ progress, renderedFrames }) => process.stdout.write(`\r    rendering ${Math.round(progress * 100)}% (${renderedFrames})   `),
  overwrite: true,
});
const size = fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(0) + " KB" : "MISSING";
console.log(`\n✅  Marker render OK → ${outFile} (${size})`);
