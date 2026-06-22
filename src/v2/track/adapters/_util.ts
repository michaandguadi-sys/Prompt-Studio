/** Small shared helpers for the format adapters. */

/** Parse a float, returning null for anything non-finite. */
export function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse an ISO-8601 timestamp to epoch ms (UTC). null if unparseable. */
export function parseTime(s: string | undefined | null): number | null {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? t : null;
}
