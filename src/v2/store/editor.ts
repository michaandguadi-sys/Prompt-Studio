"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, Layer, LayerType, Composition, Timing, Theme, Scene, CameraPose, KfEase } from "../doc/schema";
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

/** Current playhead as scene-time t (0..1) plus a "same keyframe" epsilon
 *  (~0.75 frames), so the keyframe button toggles the one under the playhead. */
function playheadT(p: Project, playheadFrame: number): { t: number; eps: number } {
  const tf = Math.max(1, Math.round((p.composition.durationSec || 1) * (p.composition.fps || 30)));
  const t = tf > 1 ? Math.min(1, Math.max(0, (playheadFrame || 0) / (tf - 1))) : 0;
  const eps = 0.75 / Math.max(1, tf - 1);
  return { t, eps };
}

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

  // ── Property keyframes (the universal animation system) ──
  /** Smart numeric setter. If `prop` is keyframed, writes the value to the
   *  keyframe at the current playhead (inserting one if none is there — After
   *  Effects style); otherwise sets the plain static field. */
  setLayerProp: (id: string, prop: string, value: number) => void;
  /** Toggle a keyframe for `prop` at the current playhead (add with the given
   *  value, or remove the one already there). Enables/anchors an animation. */
  toggleKeyframe: (id: string, prop: string, value: number) => void;
  /** Set the easing of the keyframe at/just-before the playhead on `prop`. */
  setKfEaseAtPlayhead: (id: string, prop: string, ease: "linear" | "smooth" | "easeIn" | "easeOut" | "hold") => void;
  /** Remove a property's whole keyframe track (back to a static value). */
  clearTrack: (id: string, prop: string, value?: number) => void;
  /** Jump the playhead to the next/prev keyframe of `prop` (−1 prev, +1 next). */
  gotoKeyframe: (id: string, prop: string, dir: -1 | 1) => void;
  /** Move a keyframe (identified by its current time `fromT`) to a new time on
   *  the timeline — powers dragging a diamond in the keyframe lane. */
  moveKeyframe: (id: string, prop: string, fromT: number, toT: number) => void;

  // ── Camera keyframes (the "Adjust camera" viewfinder / Earth-Studio move) ──
  /** Upsert a full camera pose keyframe at the current playhead time. If a key
   *  already sits at the playhead it's replaced; otherwise a new one is inserted
   *  (kept sorted). This is what the gizmo calls on every drag + Add-keyframe. */
  setCameraKeyAtPlayhead: (pose: CameraPose, ease?: KfEase) => void;
  /** Remove the camera keyframe at the current playhead (if any). */
  deleteCameraKeyAtPlayhead: () => void;
  /** Retime a camera keyframe (drag its diamond) from `fromT` to `toT`. */
  moveCameraKey: (fromT: number, toT: number) => void;
  /** Set the easing out of the camera keyframe governing the playhead. */
  setCameraKeyEaseAtPlayhead: (ease: KfEase) => void;
  /** Drop ALL camera keyframes (back to the classic auto/style camera). */
  clearCameraKeys: () => void;
  /** Jump the playhead to the next/prev camera keyframe (−1 prev, +1 next). */
  gotoCameraKey: (dir: -1 | 1) => void;
  /** Upsert a camera keyframe at an ARBITRARY time (timeline Option-click add). */
  setCameraKeyAt: (t: number, pose: CameraPose, ease?: KfEase) => void;
  /** Delete the camera keyframe nearest `t` (timeline Delete key). */
  deleteCameraKeyAt: (t: number) => void;
  /** Upsert a property keyframe at an arbitrary time (timeline Option-click add). */
  addKeyframeAt: (id: string, prop: string, t: number, value: number) => void;
  /** Delete the property keyframe nearest `t` (timeline Delete key). */
  deleteKeyframeAt: (id: string, prop: string, t: number) => void;

  patchComposition: (patch: Partial<Composition>) => void;
  /** Change the scene duration AND proportionally rescale every layer's timing
   *  (in/out points, narration beats, choreography spans) so the whole film
   *  keeps its rhythm at the new length — "fit my story to 30s" in one click. */
  retimeScene: (newDurationSec: number) => void;
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

        // ── Property keyframes ──────────────────────────────────────────────
        setLayerProp: (id, prop, value) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          if (!l) return;
          const track = l.tracks?.[prop] as { t: number; value: number; ease: string }[] | undefined;
          if (track && track.length) {
            // Keyframed → edit the keyframe at the playhead (insert if none there).
            const { t, eps } = playheadT(p, get().playheadFrame);
            const next = [...track];
            const i = next.findIndex((k) => Math.abs(k.t - t) < eps);
            if (i >= 0) next[i] = { ...next[i], value };
            else { next.push({ t, value, ease: "smooth" }); next.sort((a, b) => a.t - b.t); }
            l.tracks = { ...l.tracks, [prop]: next };
          }
          // Always mirror to the static field too (used when the track is empty
          // and as the value shown when the playhead sits off any keyframe).
          l[prop] = value;
        }),

        toggleKeyframe: (id, prop, value) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          if (!l) return;
          if (!l.tracks) l.tracks = {};
          const { t, eps } = playheadT(p, get().playheadFrame);
          const track: { t: number; value: number; ease: string }[] = l.tracks[prop] ? [...l.tracks[prop]] : [];
          const i = track.findIndex((k) => Math.abs(k.t - t) < eps);
          if (i >= 0) {
            track.splice(i, 1); // remove the keyframe under the playhead
            if (track.length === 0) { const { [prop]: _drop, ...rest } = l.tracks; l.tracks = rest; return; }
          } else {
            track.push({ t, value, ease: "smooth" });
            track.sort((a, b) => a.t - b.t);
          }
          l.tracks = { ...l.tracks, [prop]: track };
        }),

        setKfEaseAtPlayhead: (id, prop, ease) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          const track = l?.tracks?.[prop] as { t: number; value: number; ease: string }[] | undefined;
          if (!track?.length) return;
          const { t } = playheadT(p, get().playheadFrame);
          // The keyframe governing the segment at the playhead is the last one ≤ t.
          let idx = 0;
          for (let i = 0; i < track.length; i++) if (track[i].t <= t + 1e-6) idx = i;
          const next = [...track];
          next[idx] = { ...next[idx], ease };
          l.tracks = { ...l.tracks, [prop]: next };
        }),

        clearTrack: (id, prop, value) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          if (!l?.tracks?.[prop]) return;
          const { [prop]: _drop, ...rest } = l.tracks;
          l.tracks = rest;
          if (typeof value === "number") l[prop] = value; // freeze on the last-seen value
        }),

        moveKeyframe: (id, prop, fromT, toT) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          const track = l?.tracks?.[prop] as { t: number; value: number; ease: string }[] | undefined;
          if (!track?.length) return;
          const next = track.map((k) => k);
          let best = 0, bestD = Infinity;
          next.forEach((k, i) => { const d = Math.abs(k.t - fromT); if (d < bestD) { bestD = d; best = i; } });
          next[best] = { ...next[best], t: Math.min(1, Math.max(0, toT)) };
          next.sort((a, b) => a.t - b.t);
          l.tracks = { ...l.tracks, [prop]: next };
        }),

        // ── Camera keyframes (Earth-Studio move: a full pose pinned at time t) ──
        setCameraKeyAtPlayhead: (pose, ease = "smooth") => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam) return;
          const { t, eps } = playheadT(p, get().playheadFrame);
          const clean = {
            lon: pose.lon,
            lat: Math.min(85, Math.max(-85, pose.lat)),
            zoom: Math.min(22, Math.max(0, pose.zoom)),
            pitch: Math.min(85, Math.max(0, pose.pitch)),
            bearing: ((pose.bearing % 360) + 360) % 360,
          };
          const keys = Array.isArray(cam.keys) ? [...cam.keys] : [];
          const i = keys.findIndex((k: any) => Math.abs(k.t - t) < eps);
          if (i >= 0) keys[i] = { ...keys[i], pose: clean }; // update in place at this time
          else keys.push({ t, pose: clean, ease });
          keys.sort((a: any, b: any) => a.t - b.t);
          cam.keys = keys;
        }),

        deleteCameraKeyAtPlayhead: () => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam?.keys?.length) return;
          const { t, eps } = playheadT(p, get().playheadFrame);
          cam.keys = cam.keys.filter((k: any) => Math.abs(k.t - t) >= eps);
        }),

        moveCameraKey: (fromT, toT) => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam?.keys?.length) return;
          const keys = cam.keys.map((k: any) => k);
          let best = 0, bestD = Infinity;
          keys.forEach((k: any, i: number) => { const d = Math.abs(k.t - fromT); if (d < bestD) { bestD = d; best = i; } });
          keys[best] = { ...keys[best], t: Math.min(1, Math.max(0, toT)) };
          keys.sort((a: any, b: any) => a.t - b.t);
          cam.keys = keys;
        }),

        setCameraKeyEaseAtPlayhead: (ease) => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam?.keys?.length) return;
          const { t } = playheadT(p, get().playheadFrame);
          let idx = 0;
          for (let i = 0; i < cam.keys.length; i++) if (cam.keys[i].t <= t + 1e-6) idx = i;
          const keys = [...cam.keys];
          keys[idx] = { ...keys[idx], ease };
          cam.keys = keys;
        }),

        clearCameraKeys: () => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (cam) cam.keys = [];
        }),

        gotoCameraKey: (dir) => {
          const st = get();
          const cam = st.project.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam?.keys?.length) return;
          const c = st.project.composition;
          const tf = Math.max(1, Math.round(c.durationSec * c.fps));
          const cur = st.playheadFrame ?? 0;
          const frames = cam.keys.map((k: any) => Math.round(k.t * (tf - 1))).sort((a: number, b: number) => a - b);
          const target = dir > 0 ? frames.find((f: number) => f > cur + 0.5) : [...frames].reverse().find((f: number) => f < cur - 0.5);
          if (target != null) { st.setPlayheadFrame(target); st.requestSeek?.(target); }
        },

        setCameraKeyAt: (t, pose, ease = "smooth") => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam) return;
          const tf = Math.max(1, Math.round((p.composition.durationSec || 1) * (p.composition.fps || 30)));
          const eps = 0.75 / Math.max(1, tf - 1);
          const clean = {
            lon: pose.lon,
            lat: Math.min(85, Math.max(-85, pose.lat)),
            zoom: Math.min(22, Math.max(0, pose.zoom)),
            pitch: Math.min(85, Math.max(0, pose.pitch)),
            bearing: ((pose.bearing % 360) + 360) % 360,
          };
          const tc = Math.min(1, Math.max(0, t));
          const keys = Array.isArray(cam.keys) ? [...cam.keys] : [];
          const i = keys.findIndex((k: any) => Math.abs(k.t - tc) < eps);
          if (i >= 0) keys[i] = { ...keys[i], pose: clean };
          else keys.push({ t: tc, pose: clean, ease });
          keys.sort((a: any, b: any) => a.t - b.t);
          cam.keys = keys;
        }),

        deleteCameraKeyAt: (t) => commit((p) => {
          const cam = p.composition.layers.find((x) => x.type === "camera") as any;
          if (!cam?.keys?.length) return;
          let best = 0, bestD = Infinity;
          cam.keys.forEach((k: any, i: number) => { const d = Math.abs(k.t - t); if (d < bestD) { bestD = d; best = i; } });
          cam.keys = cam.keys.filter((_: any, i: number) => i !== best);
        }),

        addKeyframeAt: (id, prop, t, value) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          if (!l) return;
          if (!l.tracks) l.tracks = {};
          const tf = Math.max(1, Math.round((p.composition.durationSec || 1) * (p.composition.fps || 30)));
          const eps = 0.75 / Math.max(1, tf - 1);
          const tc = Math.min(1, Math.max(0, t));
          const track = l.tracks[prop] ? [...l.tracks[prop]] : [];
          const i = track.findIndex((k: any) => Math.abs(k.t - tc) < eps);
          if (i >= 0) track[i] = { ...track[i], value };
          else track.push({ t: tc, value, ease: "smooth" });
          track.sort((a: any, b: any) => a.t - b.t);
          l.tracks = { ...l.tracks, [prop]: track };
        }),

        deleteKeyframeAt: (id, prop, t) => commit((p) => {
          const l = p.composition.layers.find((x) => x.id === id) as any;
          const track = l?.tracks?.[prop] as { t: number }[] | undefined;
          if (!track?.length) return;
          let best = 0, bestD = Infinity;
          track.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bestD) { bestD = d; best = i; } });
          const next = track.filter((_, i) => i !== best);
          if (next.length) l.tracks = { ...l.tracks, [prop]: next };
          else { const { [prop]: _drop, ...rest } = l.tracks; l.tracks = rest; }
        }),

        gotoKeyframe: (id, prop, dir) => {
          const st = get();
          const l = st.project.composition.layers.find((x) => x.id === id) as any;
          const track = l?.tracks?.[prop] as { t: number }[] | undefined;
          if (!track?.length) return;
          const c = st.project.composition;
          const tf = Math.max(1, Math.round(c.durationSec * c.fps));
          const cur = st.playheadFrame ?? 0;
          const frames = track.map((k) => Math.round(k.t * (tf - 1))).sort((a, b) => a - b);
          const target = dir > 0 ? frames.find((f) => f > cur + 0.5) : [...frames].reverse().find((f) => f < cur - 0.5);
          if (target != null) { st.setPlayheadFrame(target); st.requestSeek?.(target); }
        },

        patchComposition: (patch) => commit((p) => { p.composition = { ...p.composition, ...patch }; }),

        retimeScene: (newDurationSec) => commit((p) => {
          const old = p.composition.durationSec;
          const dur = Math.min(60, Math.max(1, newDurationSec));
          if (!old || Math.abs(dur - old) < 0.01) return;
          const f = dur / old;
          const clampR = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
          p.composition.durationSec = dur;
          for (const l of p.composition.layers as any[]) {
            if (l.timing) {
              l.timing = {
                ...l.timing,
                inSec: clampR(l.timing.inSec * f, 0, dur),
                outSec: l.timing.outSec == null ? null : clampR(l.timing.outSec * f, 0, dur),
              };
            }
            // Layer-specific choreography spans scale too (clamped to schema
            // ranges) so a highlight's fill or a route's draw keeps its pacing.
            if (typeof l.fillDelaySec === "number") l.fillDelaySec = clampR(l.fillDelaySec * f, 0.2, 5);
            if (typeof l.growSpanSec === "number") l.growSpanSec = clampR(l.growSpanSec * f, 0.5, 20);
            if (typeof l.countSec === "number") l.countSec = clampR(l.countSec * f, 0.2, 12);
            // Route stopovers: the dwell at each via-point scales with the film.
            if (Array.isArray(l.via)) {
              l.via = l.via.map((v: any) =>
                typeof v?.pauseSec === "number" ? { ...v, pauseSec: clampR(v.pauseSec * f, 0, 10) } : v,
              );
            }
          }
          // Timed narration captions ride along with their beats.
          const lines = (p.composition as any).narrationLines;
          if (Array.isArray(lines)) {
            (p.composition as any).narrationLines = lines.map((ln: any) => ({
              ...ln, startSec: clampR((ln.startSec ?? 0) * f, 0, dur),
            }));
          }
        }),

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
