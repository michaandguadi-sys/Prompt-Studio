import type { RawTrack } from "../types";
import { parseKml } from "./kml";

/**
 * KMZ adapter — a KMZ is a ZIP containing a KML (usually `doc.kml`). We scan the
 * ZIP local file headers for the first `.kml` entry, inflate it (raw DEFLATE via
 * the platform `DecompressionStream`, available in modern browsers + Node ≥18),
 * then hand the KML text to the existing KML adapter. Dependency-free.
 */
export async function parseKmz(bytes: Uint8Array): Promise<RawTrack> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const td = new TextDecoder();
  let pos = 0;
  while (pos + 30 <= bytes.length) {
    if (dv.getUint32(pos, true) !== 0x04034b50) break; // not a local file header → stop
    const method = dv.getUint16(pos + 8, true);
    const compSize = dv.getUint32(pos + 18, true);
    const nameLen = dv.getUint16(pos + 26, true);
    const extraLen = dv.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const name = td.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = compSize > 0 ? dataStart + compSize : bytes.length;
    const isKml = /\.kml$/i.test(name) || name.toLowerCase().includes(".kml");
    if (isKml) {
      const slice = bytes.subarray(dataStart, dataEnd);
      const kml = method === 0 ? td.decode(slice) : td.decode(await inflateRaw(slice));
      return parseKml(kml);
    }
    if (compSize <= 0) break; // streamed entry without size → can't safely skip
    pos = dataEnd;
  }
  return { name: "", points: [] };
}

/** Raw-DEFLATE inflate via the platform DecompressionStream. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}
