"use client";

import { useEffect, useState } from "react";

/**
 * The engine choice — AI-directed vs the built-in "Smart (no AI)" logic — is a
 * single user preference shared across every place that generates (the home
 * Story Studio AND the in-editor AI bar). Persisted so the choice sticks, and
 * synced live across components in the same tab via a custom event.
 */
const KEY = "mapanisy-use-ai";
const EVT = "mapanisy-engine-change";

export function loadUseAI(): boolean {
  if (typeof window === "undefined") return true;
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === "1"; } catch { return true; }
}

export function saveUseAI(useAI: boolean): void {
  try { localStorage.setItem(KEY, useAI ? "1" : "0"); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: useAI })); } catch { /* ignore */ }
}

/** Reactive hook: `[useAI, setUseAI]`, backed by localStorage + cross-component sync. */
export function useAiEngine(): [boolean, (v: boolean) => void] {
  const [useAI, setLocal] = useState(true);
  useEffect(() => {
    setLocal(loadUseAI());
    const onChange = (e: Event) => { const d = (e as CustomEvent).detail; if (typeof d === "boolean") setLocal(d); };
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setLocal(loadUseAI()); };
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVT, onChange); window.removeEventListener("storage", onStorage); };
  }, []);
  const set = (v: boolean) => { setLocal(v); saveUseAI(v); };
  return [useAI, set];
}
