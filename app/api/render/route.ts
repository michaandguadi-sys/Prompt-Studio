import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { RenderPayload, parseOrError } from "@/lib/schemas";

const MOTION_GRAFIKS_PATH = process.env.MOTION_GRAFIKS_PATH;

/**
 * Render a Remotion composition to MP4 (or ProRes 4444 .mov in alpha mode).
 *
 * Performance posture:
 *  - `--concurrency=auto` lets Remotion pick based on CPU cores (was 2 — way too
 *    conservative on Apple Silicon with 8+ cores). For a 4K Mapbox scene with
 *    terrain + buildings this is the #1 speed lever — went from ~22s/frame at
 *    concurrency=2 to ~5-8s/frame at auto on M-series.
 *  - `--gl=angle` is REQUIRED for Mapbox WebGL inside headless Chromium.
 *  - `--timeout=120000` per-frame: terrain tile loads can stall briefly; 30s
 *    default trips on the first frame. 120s gives slow tile fetches headroom.
 *  - Draft mode (`draft: true`) renders at 1080p with `--scale=0.5` (4× fewer
 *    pixels = ~4× faster), perfect for iteration. Final renders stay at 4K.
 *  - Re-try is on Remotion's side via `delayRender` retries — we set --timeout
 *    high enough that "Failed to fetch tile" gets a second chance via Chromium.
 */
export async function POST(req: NextRequest) {
  if (!MOTION_GRAFIKS_PATH) {
    return new Response("MOTION_GRAFIKS_PATH not set", { status: 500 });
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return new Response("Invalid JSON body", { status: 400 }); }
  const parsed = parseOrError(RenderPayload, raw);
  if (!parsed.ok) return new Response(parsed.error, { status: parsed.status });
  const { compositionId, alpha, draft, concurrency } = parsed.data;

  // Path-traversal guard: keep output under EXPORT/
  const exportRootAbs = path.resolve(MOTION_GRAFIKS_PATH, "EXPORT");
  const ext = alpha ? "mov" : "mp4";
  const suffix = draft ? "-draft" : "";
  const outFile = path.resolve(exportRootAbs, `${compositionId}${suffix}.${ext}`);
  if (!outFile.startsWith(exportRootAbs + path.sep)) {
    return new Response("Path traversal blocked", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (s: string) => controller.enqueue(enc.encode(s + "\n"));

      // Remotion accepts a number or "N%" — defaulting to "50%" of CPU cores
      // is safer than "auto" (which Remotion 4.0.x rejects) AND than "100%"
      // which exhausts RAM on 4K Mapbox renders. On an 8-core machine this
      // is 4 parallel frames — ~3× faster than the old hard-coded 2.
      const conc =
        concurrency === undefined ? "50%" : String(concurrency);

      const args = [
        "remotion",
        "render",
        compositionId,
        outFile,
        "--gl=angle",
        `--concurrency=${conc}`,
        // Per-frame timeout — Mapbox tile loads can stall up to ~60s on cold
        // start. 120s = generous headroom; without this, "Timeout (30000ms)
        // exceeded rendering the component" trips on the first frame.
        "--timeout=120000",
      ];

      // Draft mode: half-scale (1920×1080 from 3840×2160 composition) +
      // faster encoder preset for x264. Filename auto-suffixed "-draft".
      if (draft) {
        args.push("--scale=0.5");
        // x264 ultrafast: ~3× faster encode, ~25% larger file. Acceptable for drafts.
        if (!alpha) args.push("--x264-preset=ultrafast");
      }

      if (alpha) {
        // True alpha export requires four flags together. In Remotion 4.0.x
        // the CLI binding is `--prores-profile` (NO hyphen between pro & res):
        //   --codec=prores             → use Apple ProRes
        //   --prores-profile=4444      → 4444 profile supports alpha channel
        //   --pixel-format=yuva444p10le → the "a" means alpha plane is preserved
        //   --image-format=png         → required for transparent frames
        // Without all four, Remotion silently downgrades to opaque ProRes HQ.
        args.push(
          "--codec=prores",
          "--prores-profile=4444",
          "--pixel-format=yuva444p10le",
          "--image-format=png",
        );
      }

      send(`→ cd ${MOTION_GRAFIKS_PATH}`);
      send(`→ npx ${args.join(" ")}`);
      send(
        `→ Mode: ${draft ? "DRAFT 1080p (fast)" : "FINAL 4K"} · ` +
        `concurrency=${conc} · alpha=${!!alpha}`,
      );
      const startedAt = Date.now();

      const proc = spawn("npx", args, {
        cwd: MOTION_GRAFIKS_PATH,
        env: process.env,
      });

      proc.stdout.on("data", (b: Buffer) => send(b.toString()));
      proc.stderr.on("data", (b: Buffer) => send(b.toString()));
      proc.on("error", (e) => {
        send(`✗ spawn error: ${e.message}`);
        controller.close();
      });
      proc.on("close", (code) => {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        if (code === 0) {
          send(`✓ Rendered in ${elapsedSec}s → ${outFile}`);
        } else {
          send(
            `✗ exited with code ${code} after ${elapsedSec}s. ` +
            `Common causes: (1) tile-fetch timeout on slow network → re-run; ` +
            `(2) Mapbox API rate limit → check token quota; ` +
            `(3) out of memory at high concurrency → try lower --concurrency.`,
          );
        }
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
