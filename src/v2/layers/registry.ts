import type { LayerType } from "../doc/schema";

/**
 * The Layer Registry — the extensibility backbone of v2.
 *
 * Each layer type is described once here (label, icon, category, whether it
 * lives on the map or full-frame). The editor's "Add layer" menu, the timeline,
 * and the inspector all read from this. Adding a new overlay = add a schema in
 * schema.ts, a renderer in render/layers, an entry here. No god component.
 */
export type LayerMeta = {
  type: LayerType;
  label: string;
  /** lucide-react icon name (resolved in the UI layer). */
  icon: string;
  /** Short description for the add-layer menu. */
  hint: string;
  /** "map" overlays anchor to coordinates; "frame" overlays are full-screen. */
  surface: "map" | "frame";
  /** Whether the user can add more than one (camera is singleton). */
  singleton?: boolean;
  /** Whether adding it benefits from a place search first. */
  needsPlace?: boolean;
};

export const LAYER_REGISTRY: Record<LayerType, LayerMeta> = {
  camera: {
    type: "camera", label: "Camera", icon: "Video", surface: "map", singleton: true,
    hint: "The cinematic move — where the shot starts and ends.",
  },
  highlight: {
    type: "highlight", label: "Highlight", icon: "Globe2", surface: "map", needsPlace: true,
    hint: "Fill a country or region — solid, hatched, with a flag.",
  },
  route: {
    type: "route", label: "Route", icon: "Plane", surface: "map", needsPlace: true,
    hint: "Animate a journey from A to B with a moving icon.",
  },
  label: {
    type: "label", label: "Label / Pin", icon: "MapPin", surface: "map", needsPlace: true,
    hint: "A titled pin, card, or banner anchored on the map.",
  },
  flag: {
    type: "flag", label: "Flag", icon: "Flag", surface: "map", needsPlace: true,
    hint: "A country flag badge dropped on the map.",
  },
  title: {
    type: "title", label: "Title card", icon: "Type", surface: "frame",
    hint: "A full-frame title or chapter card over the map.",
  },
  chart: {
    type: "chart", label: "Data / counter", icon: "BarChart3", surface: "frame",
    hint: "An animated counter, bar, or line chart overlay.",
  },
  image: {
    type: "image", label: "Image / photo", icon: "Image", surface: "map",
    hint: "Drop your own png / svg / jpg as a pin or overlay.",
  },
  marker: {
    type: "marker", label: "Marker / Icon", icon: "Swords", surface: "map", needsPlace: true,
    hint: "Drop an animated symbol — swords, fire, alert, skull — on a spot.",
  },
  annotation: {
    type: "annotation", label: "Annotation callout", icon: "MessageSquare", surface: "map", needsPlace: true,
    hint: "A leader-line note pointing at an exact spot — editorial style.",
  },
  connections: {
    type: "connections", label: "Connections / network", icon: "Share2", surface: "map",
    hint: "Link many places with arcs — trade, migration, alliances, spread.",
  },
  spotlight: {
    type: "spotlight", label: "Spotlight focus", icon: "Sun", surface: "map", needsPlace: true,
    hint: "Darken everything except one circle to lock the eye on a place.",
  },
  track: {
    type: "track", label: "GPS track", icon: "Route", surface: "map",
    hint: "Import a GPX/GeoJSON recording — an animated flythrough of your route.",
  },
  choropleth: {
    type: "choropleth", label: "Data choropleth", icon: "Globe2", surface: "map",
    hint: "Fill countries with a proportional colour scale driven by real figures.",
  },
  bubble: {
    type: "bubble", label: "Bubble map", icon: "CircleDot", surface: "map",
    hint: "Proportional circles on map locations — size encodes value (Gapminder style).",
  },
  flow: {
    type: "flow", label: "Flow arcs", icon: "Spline", surface: "map",
    hint: "Weighted arcs for trade, migration or spread — thickness encodes magnitude.",
  },
  heatmap: {
    type: "heatmap", label: "Heatmap", icon: "Flame", surface: "map",
    hint: "Density of points as a heat surface — driven by imported data.",
  },
};

/** Layers offered in the "Add" menu, in a sensible order (camera excluded —
 *  every composition already has exactly one). */
export const ADDABLE_LAYERS: LayerMeta[] = [
  LAYER_REGISTRY.label,
  LAYER_REGISTRY.marker,
  LAYER_REGISTRY.annotation,
  LAYER_REGISTRY.highlight,
  LAYER_REGISTRY.route,
  LAYER_REGISTRY.connections,
  LAYER_REGISTRY.spotlight,
  LAYER_REGISTRY.flag,
  LAYER_REGISTRY.title,
  LAYER_REGISTRY.chart,
  LAYER_REGISTRY.choropleth,
  LAYER_REGISTRY.bubble,
  LAYER_REGISTRY.flow,
  LAYER_REGISTRY.heatmap,
  LAYER_REGISTRY.image,
];
