/**
 * Preview-map bridge — the single mechanism that lets the "Adjust camera" gizmo
 * drive the LIVE preview with zero latency.
 *
 * The on-screen <Player> renders MapComposition, which owns a real MapLibre
 * instance and jumpTo()s it to the current frame's pose every render. We expose
 * THAT instance here so the gizmo can move the actual displayed frame under the
 * user's hand while the Player is paused (a paused frame never re-renders, so
 * nothing fights the gizmo's jumpTo). On pointer-release the gizmo commits a
 * camera keyframe to the store; the Player then re-renders and lands on exactly
 * the committed pose — a seamless hand-off with no visual jump.
 *
 * Only the on-screen preview registers (never the headless render worker).
 */

type LiveMap = {
  jumpTo: (o: any) => void;
  easeTo: (o: any) => void;
  flyTo: (o: any) => void;
  panBy: (offset: [number, number], o?: any) => void;
  fitBounds?: (bounds: any, o?: any) => void;
  getBearing: () => number;
  getPitch: () => number;
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
} | null;

let live: LiveMap = null;
const subs = new Set<() => void>();

export const previewMapBridge = {
  /** MapComposition calls this with its map instance (or null on unmount). */
  register(m: LiveMap) {
    live = m;
    subs.forEach((f) => f());
  },
  /** The gizmo reads the live map here (null until the preview map is ready). */
  get(): LiveMap {
    return live;
  },
  /** Notify when the live map appears/disappears (so the gizmo can enable). */
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
};
