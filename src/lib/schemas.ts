import { z } from "zod";

/**
 * zod schemas for every /api/* route input. Reject malformed payloads at the
 * boundary with a 400 — preventing the runtime crashes that used to happen
 * when the studio sent a partial spec (e.g. missing scene during a hot reload).
 *
 * We intentionally keep these PERMISSIVE on optional/deep fields (passthrough
 * objects) — the goal is to catch top-level shape errors, not re-validate
 * every nested field that's already type-checked client-side.
 */

// ── Common primitives ─────────────────────────────────────────────────────
const LonLat = z.object({ lon: z.number(), lat: z.number() });
const LonLatNamed = z.object({
  lon: z.number(),
  lat: z.number(),
  name: z.string().optional(),
});

// ── /api/export-tsx ───────────────────────────────────────────────────────
export const ExportSpecPayload = z.object({
  spec: z
    .object({
      kind: z.enum(["map", "dataviz", "title", "lowerthird", "quote"]),
      name: z.string().min(1, "Scene name required"),
      durationSec: z.number().positive().max(120),
      fps: z.literal(24),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      style: z.object({}).passthrough(),
      scene: z.object({}).passthrough(),
    })
    .passthrough(),
});

// ── /api/render ───────────────────────────────────────────────────────────
export const RenderPayload = z.object({
  compositionId: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9-]+$/, "compositionId must be alphanumeric + dashes"),
  alpha: z.boolean().optional(),
  /** Draft mode: render at 1920×1080 instead of 3840×2160 (4× fewer pixels = ~4× faster). */
  draft: z.boolean().optional(),
  /** Override concurrency. Defaults to "50%". Accept a number or "N%" string. */
  concurrency: z.union([z.number().int().positive().max(16), z.string().regex(/^\d+%$/)]).optional(),
});

// ── /api/route ────────────────────────────────────────────────────────────
export const RoutePayload = z.object({
  from: LonLat,
  to: LonLat,
  via: z.array(LonLat).max(23).optional(), // Mapbox supports 25 incl. from/to
  transport: z.enum([
    "walking",
    "cycling",
    "driving",
    "driving-traffic",
    "boat",
    "aircraft",
  ]),
});

// ── /api/geocode + /api/highlight-search ──────────────────────────────────
// (these are GET with ?q=... — no body, so no schema needed for the body,
// just a query validator)
export const SearchQuery = z.object({
  q: z.string().min(1).max(200),
});

// ── /api/presets ──────────────────────────────────────────────────────────
export const PresetUpsertPayload = z.object({
  kind: z.enum(["style", "scene"]),
  name: z.string().min(1).max(120),
  data: z.unknown(), // shape varies; we trust the client-side type system
});

/**
 * Helper that wraps a route handler with zod validation. Returns 400 with the
 * zod error message on failure.
 */
export function parseOrError<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; status: number; error: string } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  return {
    ok: false,
    status: 400,
    error: `Invalid input: ${first.path.join(".") || "(root)"} — ${first.message}`,
  };
}
