/**
 * Picks the best MediaRecorder output format the current browser supports,
 * preferring an editor-friendly MP4 over WebM.
 *
 * Order of preference:
 *   1. MP4 / H.265 (HEVC, "hvc1")  — smallest, modern; Safari + some Chrome
 *   2. MP4 / H.264 (AVC, "avc1")   — universally editable .mp4 (Premiere,
 *                                    Resolve, FCP, CapCut, mobile) — Chrome 130+/Safari
 *   3. MP4 (let the browser choose the codec)
 *   4. WebM / VP9, then VP8, then generic WebM (Chrome/Firefox fallback)
 *
 * Returns the chosen MIME string plus the matching file extension so the
 * download is named correctly. `mp4` files drop straight onto an NLE timeline;
 * `.webm` is the last-resort fallback for older browsers.
 */
export type RecordingFormat = { mimeType: string; ext: "mp4" | "webm" };

const CANDIDATES: { mimeType: string; ext: "mp4" | "webm" }[] = [
  { mimeType: "video/mp4;codecs=hvc1", ext: "mp4" }, // H.265 / HEVC
  { mimeType: "video/mp4;codecs=h265", ext: "mp4" },
  { mimeType: "video/mp4;codecs=avc1.640028", ext: "mp4" }, // H.264 high
  { mimeType: "video/mp4;codecs=avc1", ext: "mp4" }, // H.264
  { mimeType: "video/mp4", ext: "mp4" },
  { mimeType: "video/webm;codecs=vp9", ext: "webm" },
  { mimeType: "video/webm;codecs=vp8", ext: "webm" },
  { mimeType: "video/webm", ext: "webm" },
];

export function pickRecordingFormat(): RecordingFormat {
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const c of CANDIDATES) {
      try {
        if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
      } catch {
        /* some engines throw on odd codec strings — keep scanning */
      }
    }
  }
  // Absolute fallback — every MediaRecorder implementation accepts plain webm.
  return { mimeType: "video/webm", ext: "webm" };
}
