#!/usr/bin/env node
/**
 * Prompt Studio Render Agent v1.0
 *
 * Renders broadcast-quality video (4K H.264) on YOUR machine
 * using @remotion/renderer — zero server compute for the operator.
 *
 * Usage:
 *   node agent.mjs --key YOUR_AGENT_KEY
 *
 * The agent key and server URL are pre-filled at download time
 * from the Prompt Studio dashboard.
 *
 * Requirements:
 *   Node.js 18+
 *   npm install   (downloads @remotion/renderer + its bundled Chromium, ~200 MB)
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir, hostname, cpus } from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// Load the render engine; if it isn't installed yet, install it INTO this
// script's own folder automatically (one-time, ~200 MB incl. Chromium). That
// turns the whole setup into "download this one file and run it" — no npm,
// no package.json, no folder juggling for the operator.
async function loadRenderer() {
  try {
    return await import("@remotion/renderer");
  } catch {
    const dir = dirname(fileURLToPath(import.meta.url));
    console.log("\n📦  First run — installing the render engine (~200 MB, one time)…");
    console.log(`    Into: ${dir}\n`);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) writeFileSync(pkgPath, JSON.stringify({ name: "ps-render-agent", private: true, type: "module" }, null, 2) + "\n");
    await new Promise((resolve, reject) => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const proc = spawn(npm, ["install", "@remotion/renderer@4.0.290", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir, stdio: "inherit" });
      proc.on("error", (e) => reject(new Error(`Couldn't run npm — is Node.js 18+ installed?  (${e.message})`)));
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm install exited with code ${code}`))));
    });
    console.log("\n✅  Render engine installed — starting agent.\n");
    return await import("@remotion/renderer");
  }
}

let renderMedia, selectComposition, ensureBrowser;
try {
  ({ renderMedia, selectComposition, ensureBrowser } = await loadRenderer());
} catch (e) {
  console.error(`\n❌  ${e.message}\n    Make sure Node.js 18+ is installed (node --version), then run the command again.\n`);
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const flag = `--${name}=`;
  const inlined = args.find((a) => a.startsWith(flag));
  if (inlined) return inlined.slice(flag.length);
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

// PS_HOST is injected by the server when you download this script
const PS_HOST   = (getArg("url") ?? "https://app.promptstudio.io").replace(/\/$/, "");
const AGENT_KEY = getArg("key");
const OUT_DIR   = getArg("output") ?? join(homedir(), "Downloads");
// After each render, open the output folder in the OS file manager (Finder on
// macOS, Explorer on Windows, the default file manager on Linux). On by default;
// pass --no-reveal to disable (e.g. on a headless server).
const REVEAL    = !args.includes("--no-reveal");
// Sent as the x-agent-machine HTTP header - must stay ASCII/Latin-1.
// Header values are ByteStrings; chars > 255 (an em dash, an accented
// hostname) throw at fetch time. Strip anything non-ASCII.
const MACHINE   = `${hostname()} - Node agent`.replace(/[^\x20-\x7E]/g, "");
// Concurrency: Remotion accepts a NUMBER (must be ≤ CPU cores) OR a "N%" string.
// `parseInt("50%")` was 50 — way over the core cap — which crashed every render
// with "Maximum for --concurrency is N". Pass percent strings straight through
// (Remotion resolves them); clamp any explicit number to the core count; default
// to undefined so Remotion auto-picks a safe value.
const _coreCount = Math.max(1, cpus().length || 1);
const _concRaw = getArg("concurrency");
const CONCURRENCY = _concRaw == null
  ? undefined
  : (/%$/.test(_concRaw) ? _concRaw : Math.min(_coreCount, Math.max(1, parseInt(_concRaw, 10) || 1)));

// Mapbox GL renders with WebGL. Headless Chromium has no GPU, so without an
// explicit GL backend every map frame comes out BLANK. "angle" works on most
// machines (incl. Macs); pass --gl=swangle on headless Linux/servers if angle
// can't initialize. This is the difference between a real map and a blank one.
const GL_BACKEND = getArg("gl") ?? "angle";
const chromiumOptions = { gl: GL_BACKEND };

if (!AGENT_KEY) {
  console.error("\n❌  --key is required.");
  console.error("    Find your Agent Key in the Prompt Studio dashboard → Render Agent.\n");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  // HTTP header values are ByteStrings: ANY char > 255 (an em dash, an accented
  // hostname) throws "Cannot convert argument to a ByteString" at fetch time and
  // would otherwise spam the poll loop forever. Sanitize EVERY header value to
  // printable ASCII here, so no caller can ever crash the agent on a header.
  const raw = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  const headers = {};
  for (const [k, v] of Object.entries(raw)) headers[k] = String(v).replace(/[^\x20-\x7E]/g, "");
  const res = await fetch(`${PS_HOST}${path}`, { ...opts, headers });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`API ${path} → ${res.status}: ${text.slice(0, 200)}`); }
}

async function heartbeat() {
  try {
    await apiFetch("/api/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify({ agentKey: AGENT_KEY, machine: MACHINE }),
    });
  } catch (e) {
    // Suppress — network blips are normal
  }
}

async function reportProgress(jobId, progress, message) {
  try {
    await apiFetch("/api/agent/progress", {
      method: "POST",
      body: JSON.stringify({ agentKey: AGENT_KEY, jobId, progress, message }),
    });
  } catch {}
}

async function reportComplete(jobId, error) {
  try {
    await apiFetch("/api/agent/complete", {
      method: "POST",
      body: JSON.stringify({ agentKey: AGENT_KEY, jobId, ...(error ? { error: String(error) } : {}) }),
    });
  } catch {}
}

// Reveal the finished file in the OS file manager — cross-platform, fire-and-
// forget, and wrapped so it can NEVER crash the agent (a missing file manager
// on a headless box just no-ops).
function revealInFinder(file) {
  if (!REVEAL) return;
  try {
    const p = process.platform;
    const cmd     = p === "darwin" ? "open" : p === "win32" ? "explorer" : "xdg-open";
    const cmdArgs = p === "darwin" ? ["-R", file] : p === "win32" ? [`/select,${file}`] : [dirname(file)];
    const proc = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
    proc.on("error", () => {});
    proc.unref();
  } catch {}
}

// ── Render ────────────────────────────────────────────────────────────────────

let cachedBundleUrl = null;

async function getBundleUrl() {
  if (cachedBundleUrl) return cachedBundleUrl;
  const info = await apiFetch(`/api/agent/bundle-url?key=${encodeURIComponent(AGENT_KEY)}`);
  if (!info.available) {
    throw new Error(
      "Remotion bundle not built on server yet.\n" +
      "Ask the server operator to run: npm run build:agent-bundle\n" +
      "Then restart the agent."
    );
  }
  cachedBundleUrl = info.bundleUrl;
  return cachedBundleUrl;
}

async function renderJob(job) {
  const { id: jobId, spec, compositionId } = job;

  // A job is one of three shapes, in precedence order:
  //   v2composition → the Mapanisy v2 layer-stack doc (MapanisyV2 composition)
  //   scenes (>1)   → a v1 multi-scene timeline (PromptStudioSequence)
  //   spec          → a single v1 scene (PromptStudioScene)
  const v2story      = Array.isArray(job.v2story) && job.v2story.length ? job.v2story : null;
  const v2comp       = job.v2composition || null;
  const sceneList    = Array.isArray(job.scenes) && job.scenes.length > 1 ? job.scenes : null;
  if (!v2story && !v2comp && !spec && !sceneList) throw new Error("Job missing spec — cannot render.");

  // Free-tier watermark flag, set server-side from the user's subscription.
  const watermark    = !!job.watermark;

  const settings     = job.settings ?? {};
  const scale        = settings.scale ?? 1.0;
  const videoBitrate = settings.videoBitrate ?? "20M";
  const x264Preset   = settings.x264Preset ?? "medium";
  const isAlpha      = !!settings.alpha;
  const codec        = isAlpha ? "prores" : "h264";
  const ext          = isAlpha ? "mov" : "mp4";

  const v2dims = (a) => a === "9:16" ? { w: 2160, h: 3840 } : a === "1:1" ? { w: 2160, h: 2160 } : { w: 3840, h: 2160 };
  const sceneFrames  = (s) => Math.max(1, Math.round((s.durationSec ?? 0) * (s.fps ?? 24)));

  let compId, inputProps, totalFrames, baseW, baseH, fpsOut;
  if (v2story) {
    // The whole STORY — every scene rendered back-to-back as one film.
    compId      = "MapanisyStory";
    inputProps  = { scenes: v2story, watermark };
    fpsOut      = v2story[0]?.composition?.fps ?? 24;
    // Overlap-aware total: crossfade/slide transitions overlap their scenes
    // (shrinking runtime); cut/fade do not. Must match StoryComposition.
    {
      let cursor = 0;
      for (let i = 0; i < v2story.length; i++) {
        const sc = v2story[i];
        const frames = Math.max(1, Math.round((sc.composition?.durationSec ?? 6) * (sc.composition?.fps ?? 24)));
        const trans = i > 0 ? (sc.transition ?? "cut") : "cut";
        const tf = trans !== "cut" ? Math.max(1, Math.round((sc.transitionDuration ?? 0.6) * fpsOut)) : 0;
        const overlap = (trans === "crossfade" || trans === "slide") ? Math.min(tf, frames - 1) : 0;
        const from = i === 0 ? 0 : Math.max(0, cursor - overlap);
        cursor = from + frames;
      }
      totalFrames = Math.max(1, cursor);
    }
    const d = v2dims(v2story[0]?.composition?.aspect);
    baseW = d.w; baseH = d.h;
  } else if (v2comp) {
    compId      = "MapanisyV2";
    inputProps  = { comp: v2comp, watermark };
    fpsOut      = v2comp.fps ?? 24;
    totalFrames = Math.max(1, Math.round((v2comp.durationSec ?? 6) * fpsOut));
    const d = v2dims(v2comp.aspect);
    baseW = d.w; baseH = d.h;
  } else if (sceneList) {
    compId      = "PromptStudioSequence";
    inputProps  = { scenes: sceneList, watermark };
    fpsOut      = sceneList[0].fps ?? 24;
    totalFrames = sceneList.reduce((sum, s) => sum + sceneFrames(s), 0);
    baseW = sceneList[0].width ?? 3840; baseH = sceneList[0].height ?? 2160;
  } else {
    compId      = "PromptStudioScene";
    inputProps  = { spec, watermark };
    fpsOut      = spec.fps ?? 24;
    totalFrames = sceneFrames(spec);
    baseW = spec.width ?? 3840; baseH = spec.height ?? 2160;
  }
  const outW = Math.round(baseW * scale);
  const outH = Math.round(baseH * scale);

  const label = v2story ? `${compositionId} · story (${v2story.length} scenes)` : v2comp ? `${compositionId} · v2 (${v2comp.layers?.length ?? 0} layers)` : sceneList ? `${compositionId} · ${sceneList.length}-scene sequence` : compositionId;
  console.log(`\n🎬  Rendering "${label}"`);
  console.log(`    ${(totalFrames / fpsOut).toFixed(1)}s · ${totalFrames} frames · ${outW}×${outH} · ${videoBitrate} · ${codec}`);

  await reportProgress(jobId, 0.01, "Fetching Remotion bundle…");
  const bundleUrl = await getBundleUrl();
  console.log(`    Bundle: ${bundleUrl}`);

  // Let Remotion know the exact composition metadata via inputProps
  await reportProgress(jobId, 0.03, "Selecting composition…");
  const composition = await selectComposition({
    serveUrl:   bundleUrl,
    id:         compId,
    inputProps,
    chromiumOptions,
    ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${compositionId}.${ext}`);

  await reportProgress(jobId, 0.05, "Starting render (headless Chromium)…");
  console.log(`    Output: ${outFile}`);

  await renderMedia({
    composition,
    serveUrl:     bundleUrl,
    codec,
    outputLocation: outFile,
    inputProps,
    chromiumOptions,
    ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
    scale,
    ...(codec === "h264" ? {
      videoBitrate,
      x264Preset,
      pixelFormat: "yuv420p",
    } : {}),
    ...(CONCURRENCY ? { concurrency: CONCURRENCY } : {}),
    onProgress: async ({ progress, renderedFrames }) => {
      const pct = 0.05 + progress * 0.93;
      await reportProgress(
        jobId,
        pct,
        `Rendering frame ${renderedFrames}/${totalFrames} — ${Math.round(progress * 100)}%`,
      );
      process.stdout.write(`\r    Rendering: ${Math.round(progress * 100)}%  (${renderedFrames}/${totalFrames} frames)`);
    },
    overwrite: true,
  });

  console.log(`\n✅  Done — saved to ${outFile}`);
  await reportProgress(jobId, 1.0, `Saved to ${outFile}`);
  revealInFinder(outFile); // pop the folder open so the file is right there
  return outFile;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

// ── Browser provisioning (bulletproof) ───────────────────────────────────────
// Rendering needs a Chromium. Remotion can download its own "chrome-headless-
// shell", but that download (storage.googleapis.com) sometimes stalls and would
// crash the agent. So we PREFER a Chrome already on the machine (instant, no
// network), then fall back to Remotion's managed download WITH retries, then a
// clear, actionable error — the render never dies on browser provisioning.
function findSystemChrome() {
  const p = process.platform;
  const cands = p === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ] : p === "win32" ? [
    `${process.env["PROGRAMFILES"] || "C:/Program Files"}/Google/Chrome/Application/chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)"}/Google/Chrome/Application/chrome.exe`,
    `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)"}/Microsoft/Edge/Application/msedge.exe`,
  ] : [
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
    "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge",
  ];
  return cands.find((c) => { try { return existsSync(c); } catch { return false; } }) ?? null;
}

async function resolveBrowser() {
  const override = getArg("chrome");
  if (override) { if (existsSync(override)) return override; console.log(`  ⚠  --chrome path not found: ${override}`); }
  const sys = findSystemChrome();
  if (sys) return sys;                        // use the installed browser — no download
  // No system browser → have Remotion fetch its headless shell, with retries so a
  // transient "server sent no data" stall doesn't kill the whole agent.
  if (ensureBrowser) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        console.log(attempt === 1 ? "  Browser: downloading render engine (one time)…" : `  Browser: retry ${attempt}/4…`);
        await ensureBrowser();
        return null;                          // use Remotion's managed browser
      } catch (e) {
        console.log(`           download failed: ${String(e?.message || e).slice(0, 120)}`);
        if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 4000));
      }
    }
  }
  throw new Error(
    "Couldn't get a render browser: the automatic download failed and no Google Chrome was found.\n" +
    "    Fix: install Google Chrome (https://google.com/chrome) and run again,\n" +
    "    or point the agent at an existing browser:  --chrome=\"/path/to/your/chrome\""
  );
}

let BROWSER_EXECUTABLE = null;
try { BROWSER_EXECUTABLE = await resolveBrowser(); }
catch (e) { console.error(`\n❌  ${e.message}\n`); process.exit(1); }

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║   Prompt Studio Render Agent v1.6    ║`);
console.log(`╚══════════════════════════════════════╝`);
console.log(`  Server : ${PS_HOST}`);
console.log(`  Key    : ${AGENT_KEY.slice(0, 8)}…`);
console.log(`  Output : ${OUT_DIR}`);
console.log(`  Reveal : ${REVEAL ? "opens the folder when a render finishes" : "off (--no-reveal)"}`);
console.log(`  Browser: ${BROWSER_EXECUTABLE ? `${BROWSER_EXECUTABLE} (installed)` : "Remotion headless shell (downloaded)"}`);
console.log(`  GL     : ${GL_BACKEND} (maps need WebGL; use --gl=swangle if blank)`);
console.log(`\n  Polling for render jobs… (Ctrl+C to stop)\n`);

// Heartbeat every 30 s so the dashboard shows "Connected"
heartbeat();
setInterval(heartbeat, 30_000);

// Job poll loop — the API blocks for up to 25 s (long-poll)
let busy = false;

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const data = await apiFetch(
      `/api/agent/job?key=${encodeURIComponent(AGENT_KEY)}`,
      { headers: { "x-agent-machine": MACHINE } },
    );
    const { job } = data;
    if (!job) return; // timeout, no work — loop again

    console.log(`\n📥  Job received: ${job.compositionId} (${job.id.slice(0, 8)}…)`);
    try {
      await renderJob(job);
      await reportComplete(job.id);
    } catch (err) {
      console.error(`\n❌  Render failed: ${err.message}`);
      await reportComplete(job.id, err.message);
    }
  } catch (err) {
    if (err.message && !err.message.includes("abort")) {
      console.warn(`[poll error] ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 5_000)); // back-off on network errors
  } finally {
    busy = false;
  }
}

// Kick off immediately; interval keeps polling after each long-poll returns
setInterval(poll, 500);
poll();
