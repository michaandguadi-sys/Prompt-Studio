#!/usr/bin/env node
/**
 * Smoke test for the TRAVEL ROUTE animation + hierarchy. Builds a comp where a
 * route is the top-most layer (so it drives the camera = follow-camera path),
 * with a plane icon and progressive draw, then renders a few frames headlessly.
 * Exercises routeTravel / followRoutePose / RouteSource / RouteIconView.
 */
import { selectComposition, renderMedia } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const root = process.cwd();
const serveUrl = path.join(root, "public/remotion-bundle");
const outFile = path.join(root, ".smoke-route.mp4");
const chromiumOptions = { gl: "angle" };

const timing = { inSec: 0.3, outSec: null, enter: "fade", exit: "fade", easing: "easeInOut" };
const coords = [[2.35, 48.85], [6, 49.6], [10.0, 50.1], [13.4, 52.5]]; // Paris → Berlin-ish

const comp = {
  aspect: "16:9", fps: 24, durationSec: 5,
  basemap: { styleUrl: "mapbox://styles/mapbox/dark-v11", showStreets: false, showLabels: true, buildings3d: false, terrain: false, transparentBg: false },
  theme: { name: "Default", accent: "#6E7BFF", fill: "#6E7BFF", border: "#6E7BFF", glow: "#6E7BFF", text: "#ffffff", fontDisplay: "Inter", fontBody: "Inter" },
  look: { vignette: 0.5, letterbox: 0.11, grain: 0.2, tintColor: "#0a1030", tintOpacity: 0.18, bgColor: "#05060e" },
  layers: [
    // ROUTE is first → it is the director (drives the camera).
    { id: "rt1", name: "Flight", enabled: true, type: "route", timing,
      from: { lon: 2.35, lat: 48.85, name: "Paris" }, to: { lon: 13.4, lat: 52.5, name: "Berlin" }, via: [],
      transport: "aircraft", coordinates: coords, color: "#6E7BFF", width: 8, drawFraction: 0.7, icon: "plane", reveal: "draw", cameraMode: "chase" },
    { id: "cam1", name: "Camera", enabled: true, type: "camera",
      start: { lon: 2.35, lat: 48.85, zoom: 4, pitch: 0, bearing: 0 },
      end: { lon: 13.4, lat: 52.5, zoom: 5, pitch: 40, bearing: 0 },
      waypoints: [], style: "fly-in", moveFraction: 0.85, easing: "easeInOut", smoothPath: true },
  ],
};

console.log("🎬  Smoke-rendering TRAVEL ROUTE (route as director)…");
const composition = await selectComposition({ serveUrl, id: "MapanisyV2", inputProps: { comp, watermark: false }, chromiumOptions });
console.log(`    ✓ ${composition.width}×${composition.height} · ${composition.durationInFrames}f`);
await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: outFile, chromiumOptions,
  inputProps: { comp, watermark: false }, scale: 0.25, frameRange: [12, 28], // mid-travel frames
  videoBitrate: "8M", x264Preset: "ultrafast", pixelFormat: "yuv420p",
  onProgress: ({ progress, renderedFrames }) => process.stdout.write(`\r    rendering ${Math.round(progress * 100)}% (${renderedFrames})   `),
  overwrite: true,
});
const size = fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(0) + " KB" : "MISSING";
console.log(`\n✅  Route render OK → ${outFile} (${size})`);
