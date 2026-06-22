/**
 * Minimal in-memory rate limiter for Next.js API routes.
 * Tracks per-key (e.g. Clerk userId) request counts in a sliding window.
 * Resets when the Next.js dev server restarts; fine for MVP.
 *
 * Usage:
 *   const ok = rateLimit("render-log", clerkId, { maxRequests: 20, windowSec: 60 });
 *   if (!ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
 */

type Window = { count: number; resetAt: number };
const store = new Map<string, Window>();

export function rateLimit(
  namespace: string,
  key: string,
  { maxRequests, windowSec }: { maxRequests: number; windowSec: number },
): boolean {
  const mapKey = `${namespace}:${key}`;
  const now = Date.now();
  const win = store.get(mapKey);

  if (!win || win.resetAt < now) {
    store.set(mapKey, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }

  win.count++;
  if (win.count > maxRequests) return false;
  return true;
}
