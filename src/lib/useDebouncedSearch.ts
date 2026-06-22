"use client";

import { useEffect, useRef, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "./constants";

/**
 * Debounced + cancellable search hook. Replaces the trio of useState
 * (q, results, loading) + manual setTimeout + raw fetch that was repeated
 * in LocationSearch, RouteEditor PointPicker, HighlightEditor, and CameraWaypoints.
 *
 * Guarantees:
 *  - Aborts in-flight request when input changes again (no race)
 *  - Aborts on unmount (no stale state set after teardown)
 *  - Single debounce constant from constants.ts (consistent across the app)
 *  - results is `[]` when q.length < 2 — never undefined
 */
export function useDebouncedSearch<T>(
  q: string,
  fetcher: (q: string, signal: AbortSignal) => Promise<T[]>,
  options: { minLen?: number; debounceMs?: number } = {},
): { results: T[]; loading: boolean } {
  const minLen = options.minLen ?? 2;
  const debounceMs = options.debounceMs ?? SEARCH_DEBOUNCE_MS;
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!q || q.length < minLen) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Cancel any pending fetch + scheduled fire from the previous keystroke
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    timerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const data = await fetcher(q, controller.signal);
        if (!controller.signal.aborted) setResults(data);
      } catch (e: any) {
        if (e?.name !== "AbortError" && !controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    // Cleanup on unmount or next q change
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [q, minLen, debounceMs, fetcher]);

  return { results, loading };
}
