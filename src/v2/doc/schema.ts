import { z } from "zod";

/**
 * Mapanisy v2 — the document model.
 *
 * ONE thesis: a Project is a Map Composition with an ordered stack of typed
 * Layers. Titles, quotes, charts, flags, routes, highlights — they are all
 * just layers you add to the map. Everything is Zod-validated at every
 * boundary (load / save / AI / render) and versioned for safe migrations.
 *
 * This is the single source of truth the editor, the renderer, and the AI all
 * speak. No discriminated-union-by-"scene kind"; no parallel codegen model.
 */

// ── Primitives ──────────────────────────────────────────────────────────────

export const Aspect = z.enum(["16:9", "9:16", "1:1"]);
export type Aspect = z.infer<typeof Aspect>;

export const Easing = z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring"]);
export type Easing = z.infer<typeof Easing>;

export const LonLat = z.object({ lon: z.number(), lat: z.number() });
export type LonLat = z.infer<typeof LonLat>;

export const CameraPose = z.object({
  lon: z.number(),
  lat: z.number(),
  zoom: z.number().min(0).max(22),
  pitch: z.number().min(0).max(85).default(0),
  bearing: z.number().default(0),
});
export type CameraPose = z.infer<typeof CameraPose>;

/**
 * The unified timing contract every overlay layer shares. This is what makes
 * "fade in / fade out / none / animation type / in-out" work identically and
 * correctly everywhere — defined once, not re-implemented per scene type.
 *
 *   inSec   — seconds from layer start until it has finished entering
 *   outSec  — seconds (absolute, from scene start) when it begins leaving;
 *             null = it stays on screen to the end (no exit)
 *   enter   — entrance style; "none" = hard cut in
 *   exit    — exit style;     "none" = hard cut / hold (with outSec null = hold)
 */
export const Timing = z.object({
  inSec: z.number().min(0).default(0.5),
  outSec: z.number().min(0).nullable().default(null),
  enter: z.enum(["fade", "slide-up", "slide-down", "scale", "none"]).default("fade"),
  exit: z.enum(["fade", "slide-down", "scale", "none"]).default("fade"),
  easing: Easing.default("easeInOut"),
});
export type Timing = z.infer<typeof Timing>;

/**
 * Fine 2-D transform applied to an overlay ON TOP of its anchor. Lets a map-
 * tracked element stay tracked while still being nudged, scaled and rotated in
 * the preview. Offsets are in % of the frame so they're resolution-independent.
 */
export const Transform = z.object({
  offsetXPct: z.number().default(0),
  offsetYPct: z.number().default(0),
  scale: z.number().min(0.05).max(8).default(1),
  rotation: z.number().default(0), // degrees
});
export type Transform = z.infer<typeof Transform>;

const layerBase = {
  id: z.string(),
  name: z.string().default(""),
  enabled: z.boolean().default(true),
};

// ── Layer: Camera (the base move — exactly one per composition) ──────────────

export const CameraLayer = z.object({
  ...layerBase,
  type: z.literal("camera"),
  start: CameraPose,
  end: CameraPose,
  waypoints: z.array(CameraPose).default([]),
  /**
   * Cinematic motion style:
   *   fly-in   — travel from start framing to end (the classic Vox push).
   *   zoom-out — start tight on the place and pull back to reveal context.
   *   orbit    — settle on the place while the bearing sweeps around it.
   *   push-in  — fly in with a rising tilt for a dramatic dolly.
   *   pan      — glide laterally across the place at a constant zoom.
   *   hold     — locked-off static shot on the place.
   */
  style: z.enum(["fly-in", "zoom-out", "orbit", "push-in", "pan", "hold"]).default("fly-in"),
  /** Fraction of the scene the move takes (0–1); rest holds on `end`. */
  moveFraction: z.number().min(0.1).max(1).default(0.85),
  easing: Easing.default("easeInOut"),
  smoothPath: z.boolean().default(true),
});

// ── Layer: Highlight (country / region / custom polygon) ─────────────────────

export const FillType = z.enum(["solid", "hatch", "crosshatch", "dots", "stripes", "flag"]);

export const HighlightLayer = z.object({
  ...layerBase,
  type: z.literal("highlight"),
  timing: Timing,
  place: z.string().default(""),
  countryISO: z.string().nullable().default(null),
  geojson: z.any(),
  fillType: FillType.default("solid"),
  fillColor: z.string().default("#6E7BFF"),
  fillOpacity: z.number().min(0).max(1).default(0.22),
  borderColor: z.string().default("#6E7BFF"),
  borderWidth: z.number().min(0).default(3.5),
  borderDash: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  borderOpacity: z.number().min(0).max(1).default(1),
  glowColor: z.string().default("#6E7BFF"),
  glowWidth: z.number().min(0).default(22),
  /** 3-D extrusion height (0 = flat). Raises the region off the map like a block. */
  extrude: z.number().min(0).max(100).default(0),
  /** Editable on-map label — overrides the auto place name. Empty = use `place`. */
  labelText: z.string().default(""),
  labelSize: z.number().min(8).max(300).default(46),
  labelColor: z.string().default("#ffffff"),
  /** "grow"/"shrink": the filled territory SPREADS from an origin to the borders
   *  (or recedes) — the "expansion of a country / empire" animation. */
  animation: z.enum(["fade", "sweep", "pulse", "border-first", "static", "grow", "shrink"]).default("fade"),
  /** border-first only: seconds the border stays alone before the fill arrives. */
  fillDelaySec: z.number().min(0.2).max(5).default(1.2),
  /** grow/shrink: where the spread starts from (null = the region's centre). */
  growOrigin: LonLat.nullable().default(null),
  /** grow/shrink: seconds the spread takes (the "keyframe" duration). */
  growSpanSec: z.number().min(0.5).max(20).default(3.5),
  /** When true, THIS highlight drives the camera (frames the region), overriding
   *  the camera layer — independent of z-order. Off = the camera layer frames. */
  framesCamera: z.boolean().default(false),
  /** ISO-2 used when fillType === "flag" (the flag fills the polygon). Falls
   *  back to countryISO. */
  flagISO: z.string().nullable().default(null),
});

// ── Layer: Route (animated journey with a vehicle icon) ──────────────────────

export const RouteLayer = z.object({
  ...layerBase,
  type: z.literal("route"),
  timing: Timing,
  from: LonLat.extend({ name: z.string().optional() }),
  to: LonLat.extend({ name: z.string().optional() }),
  /** Intermediate stops the journey passes THROUGH. Each can hold the vehicle
   *  for `pauseSec`, and `weight` tunes how much of the timeline the leg ARRIVING
   *  at it takes (relative to the other legs). */
  via: z.array(LonLat.extend({
    name: z.string().optional(),
    pauseSec: z.number().min(0).max(10).default(0),
    weight: z.number().min(0.2).max(5).default(1),
  })).default([]),
  transport: z.enum(["driving", "walking", "cycling", "boat", "aircraft"]).default("driving"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).default([]),
  color: z.string().default("#6E7BFF"),
  width: z.number().min(1).default(8),
  drawFraction: z.number().min(0).max(1).default(0.6),
  icon: z.enum(["none", "car", "plane", "boat", "walk", "bike", "train", "truck", "rocket", "heli", "run", "ship", "pin"]).default("car"),
  /** Any emoji/char to use as the moving marker — overrides the preset `icon`. */
  iconEmoji: z.string().default(""),
  // How the line APPEARS over time. "dotted" is legacy (dash now lives in
  // dashStyle) — kept for back-compat, hidden from the UI, treated as "draw".
  reveal: z.enum(["draw", "grow", "fade", "pulse", "dotted", "static"]).default("draw"),
  /** ── Line styling ──────────────────────────────────────────────────── */
  showLine: z.boolean().default(true),                 // false = vehicle only, no line
  /** Start/end dots + place names. Off = a clean animated path, nothing else. */
  showEndpoints: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),        // line opacity
  glow: z.number().min(0).max(1.5).default(0.35),      // glow intensity (0 = none)
  dashStyle: z.enum(["solid", "dotted", "dashed"]).default("solid"),
  smoothness: z.number().min(0).max(1).default(0),     // bezier corner-rounding (0 = raw, 1 = silky)
  /** Travel direction along the path. forward = from → to (standard). */
  direction: z.enum(["forward", "reverse"]).default("forward"),
  /**
   * Path shape:
   *   auto   — follow roads / foot paths / sea lanes per transport (default).
   *   direct — a straight great-circle line between the endpoints.
   */
  pathStyle: z.enum(["auto", "direct"]).default("auto"),
  /**
   * How the camera behaves WHEN this route is the priority (top-most) layer:
   *   follow   — travelling shot that tracks the moving vehicle (default).
   *   frame    — hold framed on the whole journey while the line draws.
   *   chase    — follow the vehicle AND turn the bearing into each leg.
   *   orbit    — frame the journey while the camera orbits around it.
   */
  cameraMode: z.enum(["follow", "frame", "chase", "orbit"]).default("follow"),
  /** When true, THIS route drives the camera (overrides the camera layer),
   *  independent of z-order. Off = the camera layer frames the scene. */
  framesCamera: z.boolean().default(false),
});

// ── Layer: Label (titled pin / banner / tracked card on the map) ─────────────

export const LabelAnchor = z.union([
  z.object({ kind: z.literal("coord"), lon: z.number(), lat: z.number() }),
  z.object({ kind: z.literal("screen"), pos: z.enum(["bottom", "top", "center"]) }),
]);

export const LabelLayer = z.object({
  ...layerBase,
  type: z.literal("label"),
  timing: Timing,
  text: z.string().default("LABEL"),
  sub: z.string().default(""),
  variant: z.enum(["pin", "card", "banner", "lower-third"]).default("pin"),
  anchor: LabelAnchor.default({ kind: "coord", lon: 0, lat: 0 }),
  color: z.string().default("#ffffff"),
  accent: z.string().default("#6E7BFF"),
  sizePx: z.number().min(8).default(64),
  /** Drop-shadow strength for legibility over busy maps (0 = none). */
  shadow: z.number().min(0).max(1).default(0.55),
  /** Crisp dark text outline (stroke) — the Vox/news-graphic legibility trick. */
  outline: z.boolean().default(false),
  fontFamily: z.string().nullable().default(null),
  transform: Transform.default({}),
});

// ── Layer: Flag badge ────────────────────────────────────────────────────────

export const FlagLayer = z.object({
  ...layerBase,
  type: z.literal("flag"),
  timing: Timing,
  iso: z.string().default("FR"),
  anchor: LonLat,
  sizePx: z.number().min(40).default(220),
  showCode: z.boolean().default(true),
  transform: Transform.default({}),
});

// ── Layer: Title (full-frame title card overlay) ─────────────────────────────

export const TitleLayer = z.object({
  ...layerBase,
  type: z.literal("title"),
  timing: Timing,
  text: z.string().default("TITLE"),
  sub: z.string().default(""),
  template: z.enum(["classic", "impact", "kicker", "split"]).default("impact"),
  align: z.enum(["left", "center", "right"]).default("center"),
  position: z.enum(["top", "center", "bottom"]).default("center"),
  color: z.string().default("#ffffff"),
  accent: z.string().default("#6E7BFF"),
  /** Drop-shadow strength for legibility over the map (0 = none). */
  shadow: z.number().min(0).max(1).default(0.55),
  /** Crisp dark text outline (stroke) — the Vox/news-graphic legibility trick. */
  outline: z.boolean().default(false),
  fontFamily: z.string().nullable().default(null),
  transform: Transform.default({}),
});

// ── Layer: Chart (counter / bar / line) ──────────────────────────────────────

export const ChartLayer = z.object({
  ...layerBase,
  type: z.literal("chart"),
  timing: Timing,
  variant: z.enum(["counter", "bar", "line"]).default("counter"),
  value: z.number().default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  series: z.array(z.object({ label: z.string(), value: z.number() })).default([]),
  accent: z.string().default("#6E7BFF"),
  /** How long the count/grow animation runs (seconds). */
  countSec: z.number().min(0.2).max(12).default(1.5),
  /** Easing of the count/reveal — linear or eased. */
  countEasing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeOut"),
  /** Decimal places shown on the counter / bar values. */
  decimals: z.number().min(0).max(4).default(0),
  transform: Transform.default({}),
});

// ── Layer: Choropleth (geographic data comparison — countries colored by value) ──

/** One data point in a choropleth: the place + its value + pre-computed render fields. */
export const ChoroplethEntry = z.object({
  place: z.string(),
  value: z.number(),
  label: z.string().default(""),
  iso: z.string().default(""),
  /** Pre-computed colour from the buildFromPlan pipeline; do not set manually. */
  color: z.string().default("#6E7BFF"),
  /** Pre-fetched and cleaned polygon; do not set manually. */
  geojson: z.any().optional(),
});

export const ChoroplethLayer = z.object({
  ...layerBase,
  type: z.literal("choropleth"),
  timing: Timing,
  /** The data set: one entry per country/region, pre-geocoded and colored. */
  data: z.array(ChoroplethEntry).default([]),
  /** Metric label shown in the legend (e.g. "GDP (USD trillion)"). */
  metric: z.string().default(""),
  /** Value unit appended to numbers in the legend (e.g. "%", " M", "°C"). */
  unit: z.string().default(""),
  /** Low-value end of the color gradient. */
  colorLow: z.string().default("#e3f2fd"),
  /** High-value end of the color gradient. */
  colorHigh: z.string().default("#0d47a1"),
  /** Show the gradient legend overlay. */
  showLegend: z.boolean().default(true),
  transform: Transform.default({}),
});

// ── Layer: Bubble (proportional symbol map — Gapminder-style circles) ────────

/** One data point in a bubble map: a geocoded place with a pre-projected position. */
export const BubbleEntry = z.object({
  place: z.string(),
  value: z.number(),
  label: z.string().default(""),
  lon: z.number().default(0),
  lat: z.number().default(0),
  /** Pre-computed size in px (sqrt-scaled for equal area). Set by buildFromPlan. */
  sizePx: z.number().default(40),
  color: z.string().default("#6E7BFF"),
});

export const BubbleLayer = z.object({
  ...layerBase,
  type: z.literal("bubble"),
  timing: Timing,
  data: z.array(BubbleEntry).default([]),
  metric: z.string().default(""),
  unit: z.string().default(""),
  /** Maximum bubble diameter in pixels (reference = 1080p height). */
  maxSizePx: z.number().min(20).max(400).default(140),
  color: z.string().default("#6E7BFF"),
  showLabels: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  animate: z.enum(["grow", "pulse", "fade", "none"]).default("grow"),
  transform: Transform.default({}),
});

// ── Layer: Image (custom png/svg/jpg pin or overlay) ─────────────────────────

export const ImageLayer = z.object({
  ...layerBase,
  type: z.literal("image"),
  timing: Timing,
  url: z.string(),
  anchor: LabelAnchor.default({ kind: "coord", lon: 0, lat: 0 }),
  sizePx: z.number().min(20).default(180),
  rounded: z.boolean().default(true),
  caption: z.string().default(""),
  transform: Transform.default({}),
});

// ── Layer: Marker (an animated icon / emoji dropped on a single spot) ─────────

/** Curated symbol set for storytelling beats — conflict, disaster, economy,
 *  power. `emoji` overrides with ANY character so the palette is unlimited. */
export const MarkerIcon = z.enum([
  "swords", "explosion", "fire", "skull", "alert", "radiation", "biohazard",
  "crown", "anchor", "plane", "tank", "ship", "oil", "money", "factory",
  "landmark", "flag", "pin", "dot", "target", "arrow", "star", "cross", "heart",
]);
export type MarkerIcon = z.infer<typeof MarkerIcon>;

export const MarkerLayer = z.object({
  ...layerBase,
  type: z.literal("marker"),
  timing: Timing,
  anchor: LonLat,
  icon: MarkerIcon.default("pin"),
  /** Any emoji/char — overrides the preset `icon` when non-empty. */
  emoji: z.string().default(""),
  sizePx: z.number().min(8).max(600).default(120),
  color: z.string().default("#ff5a44"),         // ring / dot / glow colour
  glow: z.number().min(0).max(1.5).default(0.6), // emissive halo intensity
  ring: z.boolean().default(true),               // pulsing locator ring around it
  label: z.string().default(""),                 // optional caption beneath
  labelColor: z.string().default("#ffffff"),
  animation: z.enum(["pop", "drop", "pulse", "spin", "flash", "throb", "none"]).default("pop"),
  transform: Transform.default({}),
});

// ── Layer: Annotation (editorial leader-line callout pointing at a spot) ──────

export const AnnotationLayer = z.object({
  ...layerBase,
  type: z.literal("annotation"),
  timing: Timing,
  anchor: LonLat,                              // the point it POINTS AT on the map
  text: z.string().default("Annotation"),
  sub: z.string().default(""),
  /** Which way the text box sits from the point; the leader line connects them. */
  side: z.enum(["top", "bottom", "left", "right", "auto"]).default("top"),
  distance: z.number().min(0).max(60).default(16),   // box offset, % of frame
  color: z.string().default("#ffffff"),
  accent: z.string().default("#6E7BFF"),             // leader line + dot + box edge
  sizePx: z.number().min(8).max(200).default(40),
  boxStyle: z.enum(["card", "bracket", "underline", "none"]).default("card"),
  draw: z.boolean().default(true),                    // animate the leader line in
  fontFamily: z.string().nullable().default(null),
  transform: Transform.default({}),
});

// ── Layer: Connections (a network of arcs — hub-and-spoke or a chain) ─────────

export const ConnectionsLayer = z.object({
  ...layerBase,
  type: z.literal("connections"),
  timing: Timing,
  /** In "hub" mode every point links to the hub; in "chain" mode A→B→C in order. */
  mode: z.enum(["hub", "chain"]).default("hub"),
  hub: LonLat.extend({ name: z.string().optional() }).nullable().default(null),
  points: z.array(LonLat.extend({ name: z.string().optional(), weight: z.number().optional() })).default([]),
  color: z.string().default("#6E7BFF"),
  width: z.number().min(1).max(40).default(5),
  glow: z.number().min(0).max(1.5).default(0.5),
  curve: z.number().min(0).max(1).default(0.5),       // arc bow amount
  dashStyle: z.enum(["solid", "dotted", "dashed"]).default("solid"),
  reveal: z.enum(["draw", "fade", "grow", "static"]).default("draw"),
  stagger: z.number().min(0).max(1).default(0.5),      // spacing of sequential reveals
  dots: z.boolean().default(true),                     // node dots
  dotColor: z.string().default("#ffffff"),
  pulse: z.boolean().default(false),                   // travelling pulse along arcs
  showLabels: z.boolean().default(false),
});

// ── Layer: Spotlight (darken everything except a circle to direct the eye) ────

export const SpotlightLayer = z.object({
  ...layerBase,
  type: z.literal("spotlight"),
  timing: Timing,
  anchor: LonLat,
  radiusPct: z.number().min(2).max(90).default(24),   // radius, % of frame height
  dim: z.number().min(0).max(1).default(0.72),         // surrounding darkness
  feather: z.number().min(0).max(1).default(0.5),      // edge softness
  color: z.string().default("#000000"),
  ringColor: z.string().default("#ffffff"),
  ring: z.boolean().default(false),                    // draw a crisp ring at the edge
  pulse: z.boolean().default(false),
});

// ── Layer: Track (an imported GPS/GPX flythrough) ────────────────────────────
// A real recorded track from any device/app. The raw file is parsed + smoothed +
// resampled OFF this object (src/v2/track) into the normalized form below — the
// renderer, camera and inspector read ONLY this. Everything under the "editable
// render controls" block is mutated live by the inspector (no re-import needed).

/** One normalized track sample. ele/t are null when the source lacks them. */
export const TrackPoint = z.object({
  lon: z.number(),
  lat: z.number(),
  ele: z.number().nullable().default(null),
  t: z.number().nullable().default(null), // epoch ms (UTC)
});
export type TrackPoint = z.infer<typeof TrackPoint>;

/** Camera/flythrough preset (see src/v2/track/variants). */
export const TrackVariant = z.enum(["overview-draw", "chase-flyover", "hybrid-dive", "terrain-flyover"]);
export type TrackVariant = z.infer<typeof TrackVariant>;

/** Visual look preset; selecting one re-applies a token bundle + basemap. */
export const TrackStyle = z.enum(["vox-dark", "topo", "satellite", "minimal"]);
export type TrackStyle = z.infer<typeof TrackStyle>;

export const TrackLayer = z.object({
  ...layerBase,
  type: z.literal("track"),
  timing: Timing,
  // ── normalized track data (written once at import; the single source of truth) ─
  /** Resampled + smoothed + simplified points (NOT raw). */
  points: z.array(TrackPoint).default([]),
  /** Indices into `points` where the track was paused/split — the line must NOT
   *  be drawn across these gaps (lunch breaks etc.). */
  segments: z.array(z.number()).default([]),
  stats: z.object({
    rawCount: z.number().default(0),
    cleanCount: z.number().default(0),
    distanceM: z.number().default(0),
    ascentM: z.number().default(0),
    descentM: z.number().default(0),
    durationS: z.number().nullable().default(null),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).default([0, 0, 0, 0]), // [w,s,e,n]
    midpoint: z.tuple([z.number(), z.number()]).default([0, 0]),
  }).default({}),
  /** Origin file label, e.g. "garmin.fit" / "strava.gpx". */
  sourceName: z.string().default(""),
  /** True when the source had elevation (enables elevation profile + terrain). */
  hasElevation: z.boolean().default(false),
  /** True when the source had timestamps (enables time-based speed). */
  hasTime: z.boolean().default(false),

  // ── editable render controls (the brief's RouteData.render) ──────────────────
  variant: TrackVariant.default("overview-draw"),
  style: TrackStyle.default("vox-dark"),
  /** Playback multiplier (how fast the head moves along the track). */
  speed: z.number().min(0.1).max(5).default(1),
  /** Trim the played portion of the track (0..1 along its length). */
  trimStart: z.number().min(0).max(1).default(0),
  trimEnd: z.number().min(0).max(1).default(1),
  // style tokens — overridable individually after a style is picked
  routeColor: z.string().default("#ffffff"),
  routeGlow: z.string().default("#6E7BFF"),
  routeWidth: z.number().min(1).max(40).default(6),
  trailColor: z.string().default("#6E7BFF"), // the already-travelled portion
  dotColor: z.string().default("#ffffff"),    // the moving head
  showDot: z.boolean().default(true),
  // camera offsets layered on top of the variant's base framing
  pitch: z.number().min(0).max(84).default(60),
  zoomOffset: z.number().min(-4).max(4).default(0),
  bearingOffset: z.number().min(-180).max(180).default(0),
  // labels
  labels: z.object({
    start: z.boolean().default(true),
    end: z.boolean().default(true),
    distance: z.boolean().default(false),
    elevation: z.boolean().default(false),
  }).default({}),
  startLabel: z.string().default("Start"),
  endLabel: z.string().default("Finish"),
});
export type TrackLayer = z.infer<typeof TrackLayer>;

// ── The Layer union ──────────────────────────────────────────────────────────

export const Layer = z.discriminatedUnion("type", [
  CameraLayer,
  HighlightLayer,
  RouteLayer,
  LabelLayer,
  FlagLayer,
  TitleLayer,
  ChartLayer,
  ChoroplethLayer,
  BubbleLayer,
  ImageLayer,
  MarkerLayer,
  AnnotationLayer,
  ConnectionsLayer,
  SpotlightLayer,
  TrackLayer,
]);
export type Layer = z.infer<typeof Layer>;
export type LayerType = Layer["type"];

export type CameraLayer = z.infer<typeof CameraLayer>;
export type HighlightLayer = z.infer<typeof HighlightLayer>;
export type RouteLayer = z.infer<typeof RouteLayer>;
export type LabelLayer = z.infer<typeof LabelLayer>;
export type FlagLayer = z.infer<typeof FlagLayer>;
export type TitleLayer = z.infer<typeof TitleLayer>;
export type ChartLayer = z.infer<typeof ChartLayer>;
export type ChoroplethLayer = z.infer<typeof ChoroplethLayer>;
export type BubbleLayer = z.infer<typeof BubbleLayer>;
export type BubbleEntry = z.infer<typeof BubbleEntry>;
export type ImageLayer = z.infer<typeof ImageLayer>;
export type MarkerLayer = z.infer<typeof MarkerLayer>;
export type AnnotationLayer = z.infer<typeof AnnotationLayer>;
export type ConnectionsLayer = z.infer<typeof ConnectionsLayer>;
export type SpotlightLayer = z.infer<typeof SpotlightLayer>;

// ── Composition + Project ────────────────────────────────────────────────────

export const Basemap = z.object({
  styleUrl: z.string().default("mapbox://styles/mapbox/dark-v11"),
  showStreets: z.boolean().default(false),
  showLabels: z.boolean().default(true),
  /** Which place names show: none · countries only · countries+cities · all. */
  labelDetail: z.enum(["none", "countries", "cities", "all"]).default("cities"),
  buildings3d: z.boolean().default(false),
  terrain: z.boolean().default(false),
  transparentBg: z.boolean().default(false),
  /** OpenHistoricalMap only — show the world AS OF this year (e.g. "1880").
   *  Empty = the full historical dataset. Ignored by normal Mapbox basemaps. */
  mapYear: z.string().default(""),
  /** OpenHistoricalMap only — when set, the displayed year ANIMATES from
   *  `mapYear` → `mapYearEnd` across the scene, so borders/places change over
   *  time as the video plays ("watch history unfold"). Empty = static year. */
  mapYearEnd: z.string().default(""),
  /** 3D terrain exaggeration (0 = flat … 5 = extreme). */
  terrainStrength: z.number().min(0).max(5).default(1.4),
  /** Recolour the MAP ITSELF (not the grade): land/continent fill. Empty = style default. */
  landColor: z.string().default(""),
  /** Recolour the MAP ITSELF: ocean/water fill. Empty = style default. */
  waterColor: z.string().default(""),
  /** ── Creative 3D art-direction (drives the "3D map styles") ────────────── */
  /** 3D building extrusion colour. Empty = neutral default. */
  buildingColor: z.string().default(""),
  /** 3D building opacity (0 = invisible … 1 = solid). */
  buildingOpacity: z.number().min(0).max(1).default(0.62),
  /** Multiply building heights — >1 = dramatic skyline, <1 = flatter. */
  buildingHeightMult: z.number().min(0.2).max(8).default(1),
  /** Vertical light→dark gradient on buildings (glassy / holographic look). */
  buildingGradient: z.boolean().default(false),
  /** Glowing accent colour on country/admin boundaries + coastlines. Empty = off. */
  boundaryGlow: z.string().default(""),
  /** Optional atmosphere/sky tint painted as a top-of-frame gradient. Empty = none. */
  skyColor: z.string().default(""),
  /** The id of the applied creative 3D map style (for the picker's active state). */
  style3d: z.string().default(""),
  /** PHOTOREAL 3D (Google Earth) — render Google's Photorealistic 3D Tiles in
   *  the preview (needs a user Google Maps Platform key). Export falls back. */
  photoreal3d: z.boolean().default(false),
});
export type Basemap = z.infer<typeof Basemap>;

/**
 * Theme — the project-wide palette + fonts. New layers inherit `accent`, and
 * "Apply palette" recolours existing layers. Fonts (display = headings/labels,
 * body = sub-lines) are the defaults every text layer uses unless it sets its
 * own `fontFamily`. Defaults match the out-of-the-box look so nothing changes
 * for users who never open the panel — it just "opens the possibility".
 */
export const Theme = z.object({
  name: z.string().default("Default"),
  accent: z.string().default("#6E7BFF"),
  fill: z.string().default("#6E7BFF"),
  border: z.string().default("#6E7BFF"),
  glow: z.string().default("#6E7BFF"),
  text: z.string().default("#ffffff"),
  fontDisplay: z.string().default("Inter"),
  fontBody: z.string().default("Inter"),
});
export type Theme = z.infer<typeof Theme>;

/**
 * Cinematic "look" — a post layer applied OVER the whole frame for a graded,
 * film-like finish. All default to 0/off so it changes nothing until used.
 */
export const Look = z.object({
  vignette: z.number().min(0).max(1).default(0),        // darkened edges
  letterbox: z.number().min(0).max(0.25).default(0),    // bar height as a fraction of frame height
  grain: z.number().min(0).max(1).default(0),           // film-grain intensity
  /** Full-frame texture overlay — the "old paper / print" aesthetic. */
  texture: z.enum(["none", "paper", "halftone", "scanlines", "grid", "noise"]).default("none"),
  textureOpacity: z.number().min(0).max(1).default(0.5),
  /** Colour-grade the MAP itself (CSS filter) — "antique" makes any basemap read
   *  like an old historical map; sepia/noir/cool/warm/blueprint are film grades. */
  mapFilter: z.enum(["none", "sepia", "antique", "noir", "cool", "warm", "blueprint", "duotone"]).default("none"),
  mapFilterAmount: z.number().min(0).max(1).default(0.85),
  tintColor: z.string().default("#0a1030"),             // colour-grade wash
  tintOpacity: z.number().min(0).max(1).default(0),
  bgColor: z.string().default("#05060e"),               // backdrop behind the map (and letterbox bars)
  /** ── 3-way colour grade (lift / gamma / gain) ──────────────────────────
   *  Tint the shadows, midtones and highlights independently — the "colour
   *  wheels" of a real grading suite. Empty hex = that band untouched; the
   *  amount is how strongly the tint is pushed. Rendered as render-safe blend
   *  overlays UNDER the text so type stays clean. */
  gradeShadow: z.string().default(""),
  gradeShadowAmt: z.number().min(0).max(1).default(0.5),
  gradeMid: z.string().default(""),
  gradeMidAmt: z.number().min(0).max(1).default(0.5),
  gradeHigh: z.string().default(""),
  gradeHighAmt: z.number().min(0).max(1).default(0.5),
  /** Show the composition's narration as a documentary-style subtitle at the bottom of frame. */
  showCaptions: z.boolean().default(false),
});
export type Look = z.infer<typeof Look>;

export const Composition = z.object({
  aspect: Aspect.default("16:9"),
  fps: z.literal(24).default(24),
  durationSec: z.number().min(1).max(60).default(6),
  basemap: Basemap.default({}),
  theme: Theme.default({}),
  look: Look.default({}),
  layers: z.array(Layer).default([]),
  /** Suggested voiceover / documentary narration for this beat.
   *  Rendered as a subtitle at the bottom when look.showCaptions is true. */
  narration: z.string().default(""),
  /** Journalism-grade in-frame source citations (e.g. "World Bank 2024", "UN OCHA").
   *  Auto-populated from the AI brief's fact sources; displayed as a subtle corner overlay. */
  citations: z.array(z.string()).default([]),
});
export type Composition = z.infer<typeof Composition>;

/**
 * A Scene = one composition in a multi-scene STORY, plus its title and the
 * suggested voiceover/narration for that beat. A Project is an ordered list of
 * scenes played in sequence; `Project.composition` always mirrors the ACTIVE
 * scene (so the whole single-composition editor keeps working unchanged).
 */
export const Scene = z.object({
  id: z.string().default(() => "scn_" + Math.random().toString(36).slice(2, 10)),
  name: z.string().default("Scene"),
  narration: z.string().default(""),
  /** How this scene enters from the PREVIOUS one (ignored on the first scene). */
  transition: z.enum(["cut", "fade", "crossfade", "slide"]).default("cut"),
  transitionDuration: z.number().min(0.1).max(3).default(0.6),
  composition: Composition,
});
export type Scene = z.infer<typeof Scene>;

export const SCHEMA_VERSION = 1 as const;

export const Project = z.object({
  id: z.string(),
  name: z.string().default("Untitled animation"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** The ACTIVE scene's composition (mirrored from scenes[active] by the store). */
  composition: Composition,
  /** Ordered scenes played in sequence. Empty = legacy single-scene (the store
   *  wraps it into one scene on load), so old projects keep working. */
  scenes: z.array(Scene).default([]),
  activeSceneId: z.string().default(""),
  /** Public share token (`shr_…`) when the owner has published a read-only
   *  viewer link, else null. Managed only via /api/v2/projects/share — normal
   *  saves preserve it (never wipe it) so editing a shared project keeps it live. */
  shareToken: z.string().nullable().default(null),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});
export type Project = z.infer<typeof Project>;

/** Output pixel dimensions for an aspect (long edge = 4K-class). */
export function dimsFor(aspect: Aspect): { width: number; height: number } {
  switch (aspect) {
    case "9:16": return { width: 2160, height: 3840 };
    case "1:1": return { width: 2160, height: 2160 };
    default: return { width: 3840, height: 2160 };
  }
}

/** Parse + validate an unknown value into a Project (throws on invalid). */
export function parseProject(input: unknown): Project {
  return Project.parse(input);
}

/** Safe parse — returns null instead of throwing. */
export function safeParseProject(input: unknown): Project | null {
  const r = Project.safeParse(input);
  return r.success ? r.data : null;
}
