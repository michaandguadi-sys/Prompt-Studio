import type { RawTrack, RawPoint } from "../types";

/**
 * FIT adapter (Garmin / Wahoo / Coros watches). Dependency-free, lenient decoder
 * focused on `record` messages (global #20) — the GPS samples. Walks the FIT
 * binary: header → records (definition + data messages), tracking each local
 * type's field layout, and pulls lat/lon/altitude/timestamp out of record data.
 * Handles normal + compressed-timestamp headers and developer fields (skips them).
 * Not a full FIT profile parser, but covers the common watch export layout.
 */

const SC = 180 / 2 ** 31;          // semicircles → degrees
const FIT_EPOCH = 631065600;       // 1989-12-31T00:00:00Z, unix seconds

type FieldDef = { num: number; size: number; base: number };
type MsgDef = { le: boolean; global: number; fields: FieldDef[]; devSize: number };

export function parseFit(bytes: Uint8Array): RawTrack {
  const points: RawPoint[] = [];
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = bytes[0] >= 12 ? bytes[0] : 12;
    // ".FIT" magic lives at bytes 8..11 — sanity check, but stay lenient.
    const dataSize = dv.getUint32(4, true);
    const end = Math.min(bytes.length, headerSize + dataSize) || bytes.length;
    const defs: Record<number, MsgDef> = {};
    let pos = headerSize;

    const readData = (def: MsgDef, p: number): number => {
      let lat: number | null = null, lon: number | null = null, ele: number | null = null, t: number | null = null;
      for (const f of def.fields) {
        if (p + f.size > bytes.length) return bytes.length; // truncated
        if (def.global === 20) {
          if (f.num === 0 && f.size >= 4) { const v = dv.getInt32(p, def.le); if (v !== 0x7fffffff) lat = v * SC; }
          else if (f.num === 1 && f.size >= 4) { const v = dv.getInt32(p, def.le); if (v !== 0x7fffffff) lon = v * SC; }
          else if (f.num === 2 && f.size >= 2) { const v = dv.getUint16(p, def.le); if (v !== 0xffff) ele = v / 5 - 500; }
          else if (f.num === 78 && f.size >= 4) { const v = dv.getUint32(p, def.le); if (v !== 0xffffffff) ele = v / 5 - 500; }
          else if (f.num === 253 && f.size >= 4) { const v = dv.getUint32(p, def.le); if (v !== 0xffffffff) t = (v + FIT_EPOCH) * 1000; }
        }
        p += f.size;
      }
      p += def.devSize;
      if (def.global === 20 && lat != null && lon != null) points.push({ lon, lat, ele, t });
      return p;
    };

    while (pos < end) {
      const header = bytes[pos++];
      if (header === undefined) break;
      if (header & 0x80) {
        // compressed-timestamp data message → local type in bits 5–6
        const def = defs[(header >> 5) & 0x3];
        if (!def) break;
        pos = readData(def, pos);
      } else if (header & 0x40) {
        // definition message
        const local = header & 0x0f;
        pos++; // reserved
        const le = bytes[pos++] === 0;
        const global = dv.getUint16(pos, le); pos += 2;
        const nFields = bytes[pos++];
        const fields: FieldDef[] = [];
        for (let i = 0; i < nFields; i++) { fields.push({ num: bytes[pos++], size: bytes[pos++], base: bytes[pos++] }); }
        let devSize = 0;
        if (header & 0x20) { const nDev = bytes[pos++]; for (let i = 0; i < nDev; i++) { pos++; devSize += bytes[pos++]; pos++; } }
        defs[local] = { le, global, fields, devSize };
      } else {
        const def = defs[header & 0x0f];
        if (!def) break;
        pos = readData(def, pos);
      }
    }
  } catch { /* lenient: return whatever decoded before the error */ }
  return { name: "", points };
}
