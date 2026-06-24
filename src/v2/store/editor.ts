"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, Layer, LayerType, Composition, Timing, Theme, Scene } from "../doc/schema";
import { safeParseProject } from "../doc/schema";
import { createLayer, createDefaultProject } from "../doc/factory";
import { recolorLayer } from "../doc/themes";

/**
 * v2 editor store.
 *
 * ONE source of truth: the validated Project document. No `spec` mirror, no
 * write-through `commit()` — which is exactly what caused v1's undo/selection
 * drift bugs. Undo/redo are immutable document snapshots; because there's only
 * one doc, they can never desync.
 */

const MAX_HISTORY = 80;

type EditorState = {
  project: Project;
  selectedId: string | null;
  past: Project[];
  future: Project[];

  // selectors are derived in components; actions here:
  load: (p: Project) => void;
  reset: () => void;
  select: (id: string | null) => void;

  addLayer: (type: LayerType, overrides?: Record<string, unknown>) => void;
  /** Bulk-insert already-built layers (e.g. an applied add-on) into the scene. */
  addLayers: (layers: Layer[]) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  reorder: (orderedIds: string[]) => void;

  patchLayer: (id: string, patch: Record<string, unknown>) => void;
  patchTiming: (id: string, patch: Partial<Timing>) => void;
  patchComposition: (patch: Partial<Composition>) => void;
  /** Set just the theme (fonts/colours). `recolor` also repaints every layer. */
  setTheme: (patch: Partial<Theme>, recolor?: boolean) => void;
  rename: (name: string) => void;

  // ── Multi-scene storyboard ──
  addScene: () => void;
  removeScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  selectScene: (id: string) => void;
  moveScene: (id: string, dir: -1 | 1) => void;
  renameScene: (id: string, name: string) => void;
  setSceneNarration: (id: string, narration: string) => void;
  setSceneTransition: (id: string, transition: "cut" | "fade" | "crossfade" | "slide", duration?: number) => void;
  setSceneDuration: (id: string, sec: number) => void;
  /** Preview the WHOLE story (all scenes back-to-back) instead of the active scene. */
  playStory: boolean;
  setPlayStory: (v: boolean) => void;

  /** Live playback position (frames) of the scene preview — drives the timeline playhead. Transient (not persisted). */
  playheadFrame: number;
  setPlayheadFrame: (f: number) => void;
  /** The scene Player registers a seek fn here so the timeline ruler can scrub. */
  requestSeek: ((frame: number) => void) | null;
  registerSeek: (fn: ((frame: number) => void) | null) => void;
  /** Pro mode reveals the camera layer + advanced fine-tuning controls. Simple
   *  mode (default) keeps the camera auto-managed and the panels beginner-clean. */
  proMode: boolean;
  setProMode: (v: boolean) => void;
  /** Insert a scene built from a ready composition (e.g. AI-generated). Returns its id. */
  addSceneFromComposition: (composition: Composition, name?: string, afterId?: string) => string;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const clone = <T,>(v: T): T =>
  typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));

const sceneId = () =>
  "scn_" + (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

/**
 * Guarantee the project has a scenes[] and that `composition` mirrors the ACTIVE
 * scene. A legacy single-composition project is wrapped into one scene — so the
 * whole single-composition editor (18 files reading project.composition) keeps
 * working unchanged while we gain multi-scene storyboards. Mutates + returns.
 */
function ensureScenes(p: Project): Project {
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
    const id = sceneId();
    p.scenes = [{ id, name: "Scene 1", narration: "", transition: "cut", transitionDuration: 0.6, composition: p.composition }];
    p.activeSceneId = id;
    return p;
  }
  const active = p.scenes.find((s) => s.id === p.activeSceneId) ?? p.scenes[0];
  p.activeSceneId = active.id;
  p.composition = active.composition; // top-level mirrors the active scene
  return p;
}

export const useEditor = create<EditorState>()(
  persist(
    (set, get) => {
      /** Apply a mutation to the project with undo bookkeeping. */
      const commit = (mutate: (p: Project) => void) =>
        set((s) => {
          const past = [...s.past, clone(s.project)].slice(-MAX_HISTORY);
          const next = clone(s.project);
          mutate(next);
          // Mirror the live composition back into the active scene so scenes[]
          // is always current (for persist, scene-switching, and rendering).
          const sc = next.scenes?.find((x) => x.id === next.activeSceneId);
          if (sc) sc.composition = next.composition;
          next.updatedAt = Date.now();
          return { project: next, past, future: [] };
        });

      const layerIndex = (p: Project, id: string) => p.composition.layers.findIndex((l) => l.id === id);

      return {
        project: ensureScenes(createDefaultProject()),
        selectedId: null,
        past: [],
        future: [],

        load: (p) => set({ project: ensureScenes(clone(p)), selectedId: null, past: [], future: [] }),
        reset: () => set({ project: ensureScenes(createDefaultProject()), selectedId: null, past: [], future: [] }),
        select: (id) => set({ selectedId: id }),

        addLayer: (type, overrides) => {
          // New layers inherit the project's accent so they match the palette
          // out of the box (still overridable per-layer).
          const theme = get().project.composition.theme;
          const layer = recolorLayer(createLayer(type, overrides), theme);
          commit((p) => { p.composition.layers.push(layer); });
          set({ selectedId: layer.id });
        },

        addLayers: (layers) => {
          if (!layers?.length) return;
          // Fresh ids so an add-on can be applied repeatedly without collisions.
          const fresh = layers.map((l) => ({ ...clone(l), id: "ly_" + Math.random().toString(36).slice(2, 10) })) as Layer[];
          commit((p) => { p.composition.layers.push(...fresh); });
          set({ selectedId: fresh[fresh.length - 1]?.id ?? null });
        },

        removeLayer: (id) => {
          commit((p) => { p.composition.layers = p.composition.layers.filter((l) => l.id !== id); });
          if (get().selectedId === id) set({ selectedId: null });
        },

        duplicateLayer: (id) => {
          const src = get().project.composition.layers.find((l) => l.id === id);
          if (!src || src.type === "camera") return;
          const copy = createLayer(src.type, { ...clone(src), id: undefined, name: `${src.name || src.type} copy` } as any);
          commit((p) => {
            const i = layerIndex(p, id);
            p.composition.layers.splice(i + 1, 0, copy);
          });
          set({ selectedId: copy.id });
        },

        moveLayer: (id, dir) => commit((p) => {
          const i = layerIndex(p, id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= p.composition.layers.length) return;
          const arr = p.composition.layers;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }),

        reorder: (orderedIds) => commit((p) => {
          const byId = new Map(p.composition.layers.map((l) => [l.id, l]));
          const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Layer[];
          // keep any layers not in the list (safety)
          for (const l of p.composition.layers) if (!orderedIds.includes(l.id)) next.push(l);
          p.composition.layers = next;
        }),

        patchLayer: (id, patch) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id);
          if (l) Object.assign(l, patch);
        }),

        patchTiming: (id, patch) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          if (l && l.timing) l.timing = { ...l.timing, ...patch };
        }),

        patchComposition: (patch) => commit((p) => { p.composition = { ...p.composition, ...patch }; }),

        setTheme: (patch, recolor) => commit((p) => {
          const theme = { ...p.composition.theme, ...patch };
          p.composition.theme = theme;
          if (recolor) p.composition.layers = p.composition.layers.map((l) => recolorLayer(l, theme));
        }),

        rename: (name) => commit((p) => { p.name = name; }),

        // ── Multi-scene storyboard ──
        addScene: () => {
          // New scene inherits the current framing/look (camera + basemap/theme/
          // look) but starts with no overlays — a clean next beat.
          const cur = get().project.composition;
          const comp = { ...clone(cur), layers: clone(cur.layers.filter((l) => l.type === "camera")) } as Composition;
          const id = sceneId();
          const n = get().project.scenes.length + 1;
          commit((p) => {
            p.scenes.push({ id, name: `Scene ${n}`, narration: "", transition: "fade", transitionDuration: 0.6, composition: comp });
            p.activeSceneId = id;
            p.composition = comp;
          });
          set({ selectedId: null });
        },

        removeScene: (id) => {
          if (get().project.scenes.length <= 1) return; // keep at least one
          commit((p) => {
            const i = p.scenes.findIndex((s) => s.id === id);
            if (i < 0) return;
            p.scenes.splice(i, 1);
            if (p.activeSceneId === id) {
              const nextScene = p.scenes[Math.max(0, i - 1)] ?? p.scenes[0];
              p.activeSceneId = nextScene.id;
              p.composition = nextScene.composition;
            }
          });
          set({ selectedId: null });
        },

        duplicateScene: (id) => {
          const src = get().project.scenes.find((s) => s.id === id);
          if (!src) return;
          const nid = sceneId();
          const copy: Scene = { id: nid, name: `${src.name} copy`, narration: src.narration, transition: src.transition ?? "cut", transitionDuration: src.transitionDuration ?? 0.6, composition: clone(src.composition) };
          commit((p) => {
            const i = p.scenes.findIndex((s) => s.id === id);
            p.scenes.splice(i + 1, 0, copy);
            p.activeSceneId = nid;
            p.composition = copy.composition;
          });
          set({ selectedId: null });
        },

        selectScene: (id) => {
          if (get().project.activeSceneId === id) return;
          commit((p) => {
            const sc = p.scenes.find((s) => s.id === id);
            if (!sc) return;
            p.activeSceneId = id;
            p.composition = sc.composition;
          });
          set({ selectedId: null });
        },

        moveScene: (id, dir) => commit((p) => {
          const i = p.scenes.findIndex((s) => s.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= p.scenes.length) return;
          [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
        }),

        renameScene: (id, name) => commit((p) => {
          const sc = p.scenes.find((s) => s.id === id);
          if (sc) sc.name = name;
        }),

        setSceneNarration: (id, narration) => commit((p) => {
          const sc = p.scenes.find((s) => s.id === id);
          if (sc) sc.narration = narration;
        }),

        setSceneTransition: (id, transition, duration) => commit((p) => {
          const sc = p.scenes.find((s) => s.id === id);
          if (sc) { sc.transition = transition; if (typeof duration === "number") sc.transitionDuration = duration; }
        }),

        playStory: false,
        setPlayStory: (v) => set({ playStory: v }),
        proMode: false,
        setProMode: (v) => set({ proMode: v }),

        setSceneDuration: (id, sec) => commit((p) => {
          const s = Math.max(1, Math.min(60, Math.round(sec * 10) / 10));
          const sc = p.scenes.find((x) => x.id === id);
          if (sc) { sc.composition.durationSec = s; if (p.activeSceneId === id) p.composition.durationSec = s; }
        }),

        addSceneFromComposition: (composition, name, afterId) => {
          const id = sceneId();
          const comp = clone(composition) as Composition;
          const nm = name || `Scene ${get().project.scenes.length + 1}`;
          commit((p) => {
            const sc: Scene = { id, name: nm, narration: "", transition: "fade", transitionDuration: 0.6, composition: comp };
            const i = afterId ? p.scenes.findIndex((x) => x.id === afterId) : -1;
            if (i >= 0) p.scenes.splice(i + 1, 0, sc); else p.scenes.push(sc);
            p.activeSceneId = id;
            p.composition = comp;
          });
          set({ selectedId: null });
          return id;
        },

        undo: () => set((s) => {
          if (s.past.length === 0) return s;
          const prev = s.past[s.past.length - 1];
          return { project: prev, past: s.past.slice(0, -1), future: [clone(s.project), ...s.future].slice(0, MAX_HISTORY) };
        }),
        redo: () => set((s) => {
          if (s.future.length === 0) return s;
          const next = s.future[0];
          return { project: next, future: s.future.slice(1), past: [...s.past, clone(s.project)].slice(-MAX_HISTORY) };
        }),
        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,

        playheadFrame: 0,
        setPlayheadFrame: (f) => set({ playheadFrame: f }),
        requestSeek: null,
        registerSeek: (fn) => set({ requestSeek: fn }),
      };
    },
    {
      name: "mapanisy-v2",
      version: 5,
      partialize: (s) => ({ project: s.project, proMode: s.proMode }),
      // Re-validate the persisted project through the CURRENT Zod schema on load.
      // This fills EVERY new default (theme, cinematic look, route direction /
      // path / camera-mode, per-layer transforms, …) on every layer — so a
      // project saved before a feature shipped behaves identically to a fresh
      // one. Falls back to a clean default if the saved data is unrecoverable.
      migrate: (persisted: any) => {
        const parsed = persisted?.project ? safeParseProject(persisted.project) : null;
        return { project: ensureScenes(parsed ?? createDefaultProject()) };
      },
    },
  ),
);
