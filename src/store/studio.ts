"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PERSIST_KEY } from "@/lib/constants";
import type {
  SceneSpec,
  MapSceneSpec,
  DataVizSceneSpec,
  TitleSceneSpec,
  LowerThirdSceneSpec,
  QuoteSceneSpec,
  StylePreset,
  Palette,
  AspectRatio,
} from "@/lib/types";
import { dimsFor, aspectOf } from "@/lib/aspect";

/** Merge brand palette into a base SceneSpec if one is set. Pure function. */
function withBrandPalette(base: SceneSpec, brandPalette: Palette | null): SceneSpec {
  if (!brandPalette) return base;
  return { ...base, style: { ...base.style, palette: brandPalette } };
}
import {
  DEFAULT_MAP_SCENE,
  DEFAULT_DATAVIZ_SCENE,
  DEFAULT_TITLE_SCENE,
  DEFAULT_LOWERTHIRD_SCENE,
  DEFAULT_QUOTE_SCENE,
} from "@/lib/defaults";
import { defaultHighlightStyle } from "@/lib/highlightStyle";

export type SceneKind = SceneSpec["kind"];

/** Default scene for each kind — the source for "+ Add scene". */
const DEFAULT_BY_KIND: Record<SceneKind, SceneSpec> = {
  map: DEFAULT_MAP_SCENE,
  dataviz: DEFAULT_DATAVIZ_SCENE,
  title: DEFAULT_TITLE_SCENE,
  lowerthird: DEFAULT_LOWERTHIRD_SCENE,
  quote: DEFAULT_QUOTE_SCENE,
};

/** Stable id generator. crypto.randomUUID where available, else a fallback. */
function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Prepare a base scene for insertion into the project: stamp an id, inject
 * the brand palette, and conform it to the project aspect ratio. This is the
 * single funnel every new/reset scene passes through so dims never drift.
 */
function prepScene(
  base: SceneSpec,
  aspect: AspectRatio,
  brandPalette: Palette | null,
): SceneSpec {
  return {
    ...withBrandPalette(base, brandPalette),
    id: genId(),
    aspect,
    ...dimsFor(aspect),
  };
}

/** Replace the active scene in the array (immutably). */
function replaceActive(
  scenes: SceneSpec[],
  activeId: string,
  next: SceneSpec,
): SceneSpec[] {
  return scenes.map((s) => (s.id === activeId ? next : s));
}

const INITIAL_SCENE: SceneSpec = { ...DEFAULT_MAP_SCENE, id: genId() };

/**
 * The "scene" field of a SceneSpec is a discriminated union by `spec.kind`.
 * patchScene accepts a partial of any kind — the runtime spread merges into
 * the current scene shape. Each builder component knows its kind so it only
 * passes the right keys.
 */
type ScenePatch =
  | Partial<MapSceneSpec>
  | Partial<DataVizSceneSpec>
  | Partial<TitleSceneSpec>
  | Partial<LowerThirdSceneSpec>
  | Partial<QuoteSceneSpec>;

/**
 * Picker mode — when active, the next click on the Map's interactive
 * surface is captured as a lon/lat instead of panning/zooming. Used by
 * "Pick on map" buttons in the CameraWaypoints + HighlightEditor.
 */
export type PickerTarget =
  | { kind: "waypoint"; position: "start" | "end" | number }
  | { kind: "highlight-coord" };

type StudioState = {
  // ── Project (multi-scene) ─────────────────────────────────────────────
  /** Ordered list of scenes that assemble into one video on the timeline. */
  scenes: SceneSpec[];
  /** id of the scene currently being edited. */
  activeId: string;
  /** Project-level output framing — shared by every scene in the sequence. */
  aspect: AspectRatio;

  /**
   * The active scene. Kept as a live mirror of `scenes[activeId]` so every
   * existing consumer (`useStudio((s) => s.spec)`) keeps working unchanged.
   * All scene setters write through to both `spec` and the array entry.
   */
  spec: SceneSpec;

  setSpec: (s: SceneSpec) => void;
  patchScene: (patch: ScenePatch) => void;
  patchStyle: (patch: Partial<StylePreset>) => void;
  setPalette: (p: Palette) => void;
  setName: (name: string) => void;
  setDuration: (sec: number) => void;
  setAspect: (aspect: AspectRatio) => void;
  resetMap: () => void;
  resetDataViz: () => void;

  // ── Multi-scene actions ───────────────────────────────────────────────
  addScene: (kind: SceneKind) => void;
  /**
   * Ensure the active scene is of `kind`. Used by the per-kind quick-entry
   * pages (/studio/map, /studio/quote, …) so navigating to one NEVER wipes a
   * multi-scene project. If the active scene is already that kind it's a no-op;
   * otherwise it selects the first existing scene of that kind, or appends a
   * fresh one.
   */
  ensureSceneKind: (kind: SceneKind) => void;
  /** Reset only the active scene to `base` (in place — keeps every other scene). */
  resetActiveScene: (base: SceneSpec) => void;
  removeScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  selectScene: (id: string) => void;
  reorderScenes: (from: number, to: number) => void;
  /** Replace the whole project with a single fresh scene of `base`'s kind. */
  newProject: (base: SceneSpec) => void;

  // ── Brand palette ─────────────────────────────────────────────────────────
  /** Palette derived from the brand page — applied to new scenes as default. */
  brandPalette: Palette | null;
  setBrandPalette: (p: Palette | null) => void;
  /**
   * Reset the active spec to `base`, injecting the brand palette when set.
   * Use this instead of setSpec(DEFAULT_XXX) in studio pages.
   */
  resetScene: (base: SceneSpec) => void;

  // ── Picker mode (A3) ──────────────────────────────────────────────────
  picker: PickerTarget | null;
  startPicking: (target: PickerTarget) => void;
  cancelPicking: () => void;
  resolvePick: (lon: number, lat: number) => Promise<void>;
};

/**
 * Persisted to localStorage so the user's current scene survives refresh.
 * The PERSIST_KEY in constants.ts encodes the schema version — bumping it
 * invalidates old saves whenever the spec shape changes incompatibly.
 */
export const useStudio = create<StudioState>()(
  persist(
    (set) => {
      /**
       * Write a new version of the active scene through to BOTH the `spec`
       * mirror and its entry in the `scenes` array. Every scene-level setter
       * funnels through here so the two never drift.
       */
      const commit = (st: StudioState, next: SceneSpec) => {
        // Enforce the project invariants on every scene write: the active scene
        // always carries `activeId` and the project's aspect + dimensions. This
        // guarantees the `spec` mirror and the matching `scenes` entry can never
        // drift — even when a caller hands us a FOREIGN spec (a loaded preset or
        // an imported .json) that brought its own id or a different aspect.
        const scene: SceneSpec = {
          ...next,
          id: st.activeId,
          aspect: st.aspect,
          ...dimsFor(st.aspect),
        };
        return {
          spec: scene,
          scenes: replaceActive(st.scenes, st.activeId, scene),
        };
      };

      return {
      scenes: [INITIAL_SCENE],
      activeId: INITIAL_SCENE.id!,
      aspect: aspectOf(INITIAL_SCENE),
      spec: INITIAL_SCENE,

      setSpec: (spec) => set((st) => commit(st, spec)),
      patchScene: (patch) =>
        set((st) =>
          commit(st, {
            ...st.spec,
            // Merge the partial into whichever kind is active. The runtime
            // shape is always the current kind; TS can't narrow across the
            // discriminated union when patching, so we cast at the boundary.
            scene: { ...st.spec.scene, ...patch } as SceneSpec["scene"],
          }),
        ),
      patchStyle: (patch) =>
        set((st) => commit(st, { ...st.spec, style: { ...st.spec.style, ...patch } })),
      setPalette: (p) =>
        set((st) => commit(st, { ...st.spec, style: { ...st.spec.style, palette: p } })),
      setName: (name) => set((st) => commit(st, { ...st.spec, name })),
      setDuration: (durationSec) => set((st) => commit(st, { ...st.spec, durationSec })),
      // Aspect is project-level: conform EVERY scene so the sequence shares
      // one output frame, then refresh the active mirror.
      setAspect: (aspect) =>
        set((st) => {
          const dims = dimsFor(aspect);
          const scenes = st.scenes.map((s) => ({ ...s, aspect, ...dims }));
          const active = scenes.find((s) => s.id === st.activeId) ?? scenes[0];
          return { aspect, scenes, spec: active };
        }),
      resetMap: () =>
        set((st) => {
          const scene = prepScene(DEFAULT_MAP_SCENE, st.aspect, st.brandPalette);
          return { scenes: [scene], activeId: scene.id!, spec: scene };
        }),
      resetDataViz: () =>
        set((st) => {
          const scene = prepScene(DEFAULT_DATAVIZ_SCENE, st.aspect, st.brandPalette);
          return { scenes: [scene], activeId: scene.id!, spec: scene };
        }),

      // ── Multi-scene actions ──────────────────────────────────────────
      addScene: (kind) =>
        set((st) => {
          const scene = prepScene(DEFAULT_BY_KIND[kind], st.aspect, st.brandPalette);
          const scenes = [...st.scenes, scene];
          return { scenes, activeId: scene.id!, spec: scene };
        }),
      ensureSceneKind: (kind) =>
        set((st) => {
          if (st.spec.kind === kind) return st; // already editing this kind
          const existing = st.scenes.find((s) => s.kind === kind);
          if (existing) return { activeId: existing.id!, spec: existing };
          const scene = prepScene(DEFAULT_BY_KIND[kind], st.aspect, st.brandPalette);
          return { scenes: [...st.scenes, scene], activeId: scene.id!, spec: scene };
        }),
      resetActiveScene: (base) =>
        set((st) => {
          // Keep the active scene's id + timeline position; only its content resets.
          const fresh = prepScene(base, st.aspect, st.brandPalette);
          const scene: SceneSpec = { ...fresh, id: st.activeId };
          return commit(st, scene);
        }),
      removeScene: (id) =>
        set((st) => {
          if (st.scenes.length <= 1) return st; // always keep at least one scene
          const idx = st.scenes.findIndex((s) => s.id === id);
          const scenes = st.scenes.filter((s) => s.id !== id);
          let activeId = st.activeId;
          if (id === st.activeId) {
            activeId = scenes[Math.max(0, idx - 1)].id!;
          }
          const active = scenes.find((s) => s.id === activeId) ?? scenes[0];
          return { scenes, activeId, spec: active };
        }),
      duplicateScene: (id) =>
        set((st) => {
          const idx = st.scenes.findIndex((s) => s.id === id);
          if (idx < 0) return st;
          const src = st.scenes[idx];
          const copy: SceneSpec = { ...src, id: genId(), name: `${src.name} copy` };
          const scenes = [...st.scenes];
          scenes.splice(idx + 1, 0, copy);
          return { scenes, activeId: copy.id!, spec: copy };
        }),
      selectScene: (id) =>
        set((st) => {
          const active = st.scenes.find((s) => s.id === id);
          if (!active) return st;
          return { activeId: id, spec: active };
        }),
      reorderScenes: (from, to) =>
        set((st) => {
          if (from === to || from < 0 || to < 0) return st;
          if (from >= st.scenes.length || to >= st.scenes.length) return st;
          const scenes = [...st.scenes];
          const [moved] = scenes.splice(from, 1);
          scenes.splice(to, 0, moved);
          return { scenes };
        }),
      newProject: (base) =>
        set((st) => {
          const scene = prepScene(base, st.aspect, st.brandPalette);
          return { scenes: [scene], activeId: scene.id!, spec: scene };
        }),

      // ── Brand palette ────────────────────────────────────────────────
      brandPalette: null,
      setBrandPalette: (p) => set({ brandPalette: p }),
      resetScene: (base) =>
        set((st) => {
          const scene = prepScene(base, st.aspect, st.brandPalette);
          return { scenes: [scene], activeId: scene.id!, spec: scene };
        }),

      // ── Picker mode ────────────────────────────────────────────────
      picker: null,
      startPicking: (target) => set({ picker: target }),
      cancelPicking: () => set({ picker: null }),
      resolvePick: async (lon: number, lat: number) => {
        const st = useStudio.getState();
        const target = st.picker;
        if (!target) return;
        const map = st.spec.scene as MapSceneSpec;

        if (target.kind === "waypoint") {
          // Insert a new camera waypoint at the picked position.
          // Default zoom = average of nearest two waypoints, clamped.
          const list = [
            map.start,
            ...(map.mid ? [map.mid] : []),
            ...(map.extraWaypoints ?? []),
            map.end,
          ];
          const zoom = Math.max(2, Math.min(13, (list[0].zoom + list[list.length - 1].zoom) / 2));
          const wp = { lon, lat, zoom };
          let next = [...list];
          if (target.position === "start") next.unshift(wp);
          else if (target.position === "end") next.push(wp);
          else next.splice(target.position + 1, 0, wp);

          // Reshape into start/mid/extra/end
          const start = next[0];
          const end = { ...map.end, ...next[next.length - 1] };
          let patch: Partial<MapSceneSpec>;
          if (next.length === 2) patch = { start, mid: undefined, extraWaypoints: [], end };
          else if (next.length === 3) patch = { start, mid: next[1], extraWaypoints: [], end };
          else patch = { start, mid: next[1], extraWaypoints: next.slice(2, -1), end };

          useStudio.getState().patchScene(patch);
        } else if (target.kind === "highlight-coord") {
          // Reverse-lookup: hit /api/highlight-search with a name guess from
          // a small bbox around the picked coordinate. If nothing found,
          // just drop a tiny placeholder polygon at the click point.
          try {
            const res = await fetch(
              `/api/highlight-search?q=${encodeURIComponent(`${lat},${lon}`)}`,
            );
            const data = await res.json();
            const r = data.results?.[0];
            if (r) {
              const newHl = {
                name: r.shortName ?? r.name.split(",")[0],
                placeType: r.placeType,
                geojson: r.geojson,
                style: defaultHighlightStyle(st.spec.style.palette),
              };
              const cur = (map.highlights ?? (map.highlight ? [map.highlight] : []));
              useStudio.getState().patchScene({
                highlights: [...cur, newHl],
                highlight: null,
              });
            } else {
              // Fallback: small square polygon (~3km) at the picked point
              const d = 0.03;
              const newHl = {
                name: `Pin ${lat.toFixed(2)},${lon.toFixed(2)}`,
                placeType: "custom",
                geojson: {
                  type: "Polygon",
                  coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]],
                },
                style: defaultHighlightStyle(st.spec.style.palette),
              };
              const cur = (map.highlights ?? (map.highlight ? [map.highlight] : []));
              useStudio.getState().patchScene({
                highlights: [...cur, newHl],
                highlight: null,
              });
            }
          } catch {
            /* ignore — picker just deactivates */
          }
        }
        set({ picker: null });
      },
      };
    },
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Persist the project (scenes + selection + aspect) and brand palette.
      // `spec` is the active-scene mirror — persisted too so rehydrate is a
      // straight restore with no recompute step.
      partialize: (state) =>
        ({
          scenes: state.scenes,
          activeId: state.activeId,
          aspect: state.aspect,
          spec: state.spec,
          brandPalette: state.brandPalette,
        }) as unknown as StudioState,
      /**
       * v0 → v1 migration: the old store persisted a single `{ spec }`. Wrap it
       * as a 1-scene project so existing localStorage loads with no data loss.
       */
      migrate: (persisted: unknown, version: number) => {
        const p = persisted as Partial<StudioState> & { spec?: SceneSpec };
        if (version >= 1) return p as StudioState;
        const spec: SceneSpec = p?.spec ?? INITIAL_SCENE;
        const withId: SceneSpec = spec.id ? spec : { ...spec, id: genId() };
        return {
          scenes: [withId],
          activeId: withId.id!,
          aspect: aspectOf(withId),
          spec: withId,
          brandPalette: p?.brandPalette ?? null,
        } as unknown as StudioState;
      },
    },
  ),
);
