#!/usr/bin/env node
/**
 * Server-side render worker — renders a Mapanisy v2 job on THIS machine (the
 * server), using the same prebuilt bundle the Render Agent uses. Spawned by
 * src/lib/serverRender.ts, one process per job.
 *
 *   node scripts/render-worker.mjs /path/to/job.json
 *
 * The job file: { compId, inputProps, settings, outFile }.
 * Progress is emitted as JSON lines on stdout: {"progress":0.42,"message":"…"}.
 * Exit code 0 = success (outFile exists), non-zero = failure (last line = error).
 */
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import { existsSync, readFileSync, mkdirSync, symlinkSync } from "fs";
import path from "path";
import { cpus } from "os";

/** How many Chromium tabs composite frames in parallel.
 *
 *  Default: half the cores, capped at 4 — on the 4 vCPU VPS that is 2, which
 *  leaves headroom for the web server while a render runs.
 *
 *  RENDER_CONCURRENCY overrides it. Remotion accepts either a NUMBER or a
 *  percentage STRING ("50%"), so the raw env value could not just be passed
 *  through: `RENDER_CONCURRENCY=2` handed Remotion the string "2", which is
 *  neither form. Parse both shapes and ignore anything else rather than letting
 *  a typo take the render down mid-job. */
function resolveConcurrency() {
  const fallback = Math.max(1, Math.min(4, Math.floor((cpus().length || 2) / 2)));
  const raw = (process.env.RENDER_CONCURRENCY ?? "").trim();
  if (!raw) return fallback;
  if (/^\d+%$/.test(raw)) return raw;              // Remotion's percentage form
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1) return n;
  console.warn(`[render-worker] ignoring invalid RENDER_CONCURRENCY=${raw}; using ${fallback}`);
  return fallback;
}

const emit = (progress, message) =>
  process.stdout.write(JSON.stringify({ progress, message }) + "\n");
const fail = (message) => {
  process.stdout.write(JSON.stringify({ error: String(message).slice(0, 500) }) + "\n");
  process.exit(1);
};

const jobFile = process.argv[2];
if (!jobFile || !existsSync(jobFile)) fail("Missing job file");
const job = JSON.parse(readFileSync(jobFile, "utf8"));
const { compId, inputProps, settings = {}, outFile, origin } = job;
if (!compId || !inputProps || !outFile) fail("Job file incomplete");

const root = process.cwd();
const bundleDir = path.join(root, "public/remotion-bundle");
if (!existsSync(path.join(bundleDir, "index.html"))) {
  fail("Remotion bundle not built — run: npm run build:agent-bundle");
}

// PREFER loading the bundle over HTTP from the app origin (exactly like the
// Render Agent): the composition fetches map tiles from RELATIVE same-origin
// proxies (/api/sat, /api/dem), and those only resolve when the page's origin
// IS the app. Served from the filesystem, satellite imagery and 3-D terrain
// silently come back 404 → blank/flat maps. The filesystem path stays as an
// offline fallback (basemaps from public CDNs still work there).
let serveUrl;
if (origin) {
  serveUrl = `${String(origin).replace(/\/$/, "")}/remotion-bundle/`;
} else {
  serveUrl = bundleDir;
  // The bundle is built with publicPath "/remotion-bundle/" (for HTTP serving
  // through Next). When Remotion's own static server serves the directory at
  // "/", every asset would 404 — a self-referential symlink fixes resolution.
  try {
    const selfLink = path.join(bundleDir, "remotion-bundle");
    if (!existsSync(selfLink)) symlinkSync(".", selfLink, "dir");
  } catch { /* EEXIST race or read-only fs — the render will surface any real problem */ }
}

// Maps render with WebGL; headless Chromium has no GPU. "angle" works on
// macOS/most desktops; set RENDER_GL=swangle for headless Linux servers.
const chromiumOptions = { gl: process.env.RENDER_GL || "angle" };

// Prefer an installed Chrome (instant); else Remotion's managed download.
function findSystemChrome() {
  const p = process.platform;
  const cands = p === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ] : p === "win32" ? [
    `${process.env["PROGRAMFILES"] || "C:/Program Files"}/Google/Chrome/Application/chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)"}/Google/Chrome/Application/chrome.exe`,
  ] : [
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
    "/usr/bin/chromium-browser", "/snap/bin/chromium",
  ];
  return cands.find((c) => { try { return existsSync(c); } catch { return false; } }) ?? null;
}

try {
  const browserExecutable = findSystemChrome();
  if (!browserExecutable) {
    emit(0.01, "Preparing render engine…");
    await ensureBrowser();
  }

  emit(0.03, "Preparing composition…");
  const composition = await selectComposition({
    serveUrl, id: compId, inputProps, chromiumOptions,
    ...(browserExecutable ? { browserExecutable } : {}),
  });

  mkdirSync(path.dirname(outFile), { recursive: true });

  const isAlpha = !!settings.alpha;
  const codec = isAlpha ? "prores" : "h264";
  const scale = settings.scale ?? 1;
  const totalFrames = composition.durationInFrames;

  emit(0.05, "Rendering…");
  await renderMedia({
    composition,
    serveUrl,
    codec,
    outputLocation: outFile,
    inputProps,
    chromiumOptions,
    ...(browserExecutable ? { browserExecutable } : {}),
    scale,
    ...(codec === "h264" ? {
      videoBitrate: settings.videoBitrate ?? "20M",
      x264Preset: settings.x264Preset ?? "medium",
      pixelFormat: "yuv420p",
    } : {
      proresProfile: "4444",
      pixelFormat: "yuva444p10le",
      imageFormat: "png",
    }),
    concurrency: resolveConcurrency(),
    timeoutInMilliseconds: 120_000,
    onProgress: ({ progress, renderedFrames }) =>
      emit(0.05 + progress * 0.94, `Rendering frame ${renderedFrames}/${totalFrames} — ${Math.round(progress * 100)}%`),
    overwrite: true,
  });

  emit(1, "Done");
  process.exit(0);
} catch (e) {
  fail(e?.message ?? e);
}
