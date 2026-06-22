"use client";

import { useStudio } from "./studio";
import type { SceneSpec, AspectRatio } from "@/lib/types";
import { MAX_HISTORY, HISTORY_PUSH_THROTTLE_MS } from "@/lib/constants";

/**
 * Undo / redo for the studio PROJECT (multi-scene).
 *
 * Design:
 *  - Single global history store outside React (plain arrays + listeners) —
 *    we don't want every edit re-rendering subscribers to history.
 *  - A snapshot captures the whole editable project: { scenes, activeId, aspect }.
 *    This is what makes structural edits (add / remove / reorder scenes) and the
 *    project aspect ratio undoable — not just edits to the active scene. It also
 *    keeps the `spec` mirror and the `scenes` array from drifting on undo, which
 *    a spec-only snapshot would have broken after the multi-scene refactor.
 *  - We trigger on a change to the `scenes` array reference or `aspect`. Every
 *    scene edit funnels through the store's `commit()` which rebuilds `scenes`
 *    via `.map`, so a new reference reliably signals "something changed".
 *    A pure selection change (activeId only) is NOT recorded — re-selecting a
 *    scene shouldn't cost an undo step.
 *  - Throttle pushes to 1 per HISTORY_PUSH_THROTTLE_MS so dragging a slider
 *    doesn't create 50 history entries in a second.
 *  - On undo/redo we call useStudio.setState directly while `suspended` so the
 *    push hook doesn't record the undo itself as a new edit.
 *  - Past/future are capped at MAX_HISTORY; oldest entry is dropped.
 */

type Snapshot = {
  scenes: SceneSpec[];
  activeId: string;
  aspect: AspectRatio;
};

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let lastPushAt = 0;
let suspended = false;
/** The last snapshot we observed — the baseline the next edit is diffed against.
 *  Module-scoped (not a closure local) so undo/redo can refresh it after they
 *  restore state, preventing a stale snapshot from being pushed on the next edit. */
let last: Snapshot | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

/** Snapshots are shallow — store state is treated as immutable, so the array
 *  and scene objects are safe to retain by reference across history entries. */
const snap = (st: { scenes: SceneSpec[]; activeId: string; aspect: AspectRatio }): Snapshot => ({
  scenes: st.scenes,
  activeId: st.activeId,
  aspect: st.aspect,
});

/** Restore a snapshot, re-deriving the `spec` mirror from the active scene so
 *  every consumer (builder, timeline, sequence preview) stays in sync. */
function apply(s: Snapshot) {
  const active = s.scenes.find((x) => x.id === s.activeId) ?? s.scenes[0];
  suspended = true;
  useStudio.setState({
    scenes: s.scenes,
    activeId: active.id!,
    aspect: s.aspect,
    spec: active,
  });
  suspended = false;
  // Refresh the baseline so the next real edit diffs against what we just
  // restored — otherwise it would push this (now-stale) snapshot.
  last = snap(useStudio.getState());
}

/** Wire this up once at app boot — listens to project changes + pushes snapshots */
export function installHistory() {
  last = snap(useStudio.getState());
  useStudio.subscribe((state) => {
    if (suspended) return;
    if (!last) { last = snap(state); return; }
    // Only structural / content changes count — not pure selection moves.
    if (state.scenes === last.scenes && state.aspect === last.aspect) return;
    const now = Date.now();
    // Throttle: if we just pushed, fold this into the head instead of stacking.
    if (now - lastPushAt < HISTORY_PUSH_THROTTLE_MS && past.length > 0) {
      last = snap(state);
      return;
    }
    past.push(last);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0; // any new edit kills the redo stack
    lastPushAt = now;
    last = snap(state);
    notify();
  });
}

export function undo() {
  if (past.length === 0) return;
  const prev = past.pop()!;
  future.push(snap(useStudio.getState()));
  apply(prev);
  notify();
}

export function redo() {
  if (future.length === 0) return;
  const next = future.pop()!;
  past.push(snap(useStudio.getState()));
  apply(next);
  notify();
}

export function getHistoryCounts() {
  return { past: past.length, future: future.length };
}

export function subscribeHistory(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
