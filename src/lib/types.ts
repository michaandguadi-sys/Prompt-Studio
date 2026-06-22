export type Palette = {
  name: string;
  tone: "cold" | "conflict" | "historical" | "trade" | "political" | "custom";
  borderColor: string;
  glowColor: string;
  fillColor: string;
  countryStroke: string;
  dotColor: string;
  ringColor: string;
};

export type FontSpec = {
  family: string;
  weight: number;
  /** path under public/fonts, or null for system font */
  src: string | null;
};

export type LabelTypography = {
  titleSize: number;
  titleWeight: number;
  titleSpacing: number;
  subSize: number;
  subSpacing: number;
};

export type StylePreset = {
  name: string;
  palette: Palette;
  fonts: { primary: FontSpec; secondary: FontSpec };
  labelTypography: LabelTypography;
  letterboxHeight: number;
};

export type CameraPos = {
  lon: number;
  lat: number;
  zoom: number;
  /** Optional 3D camera tilt 0–60° (defaults to 0 if unset). */
  pitch?: number;
  /** Optional 0–360° compass rotation (defaults to 0 if unset). */
  bearing?: number;
};

/**
 * Timing beats as FRACTIONS of total duration (0–1).
 * Stored as fractions so changing duration scales every beat proportionally
 * — fixes the "only the end gets slower" bug from the absolute-frame model.
 *
 * Multi-waypoint refactor: the whole camera pan happens in [0, arrive].
 * Highlight fades in over [hold, breathe]. open/approach/push are vestigial
 * from the old 2-phase model and ignored — left out of the new type.
 *
 * Legacy beats with absolute frame numbers (> 1) auto-normalize via
 * normalizeBeats() in beats.ts.
 */
export type Beats = {
  hold: number;       // when highlight starts fading in (default 0.42)
  breathe: number;    // when highlight reaches full (default 0.64)
  arrive: number;     // when camera reaches final waypoint (default 0.78)
  /** @deprecated — preserved on read so old presets don't break; never written */
  open?: number;
  /** @deprecated */
  approach?: number;
  /** @deprecated */
  push?: number;
};

export type SceneLabel = {
  primary: string;
  secondary: string;
  primaryInFrame: number;
  primaryOutFrame: number;
  secondaryInFrame: number;
  /**
   * Layout — where + how the label is rendered.
   *   - "city-projected"  → tracks projectLon/projectLat (dot + ring + text above)
   *   - "bottom-banner"   → fixed bottom-center with bordered card
   *   - "tracked-card"    → tracked card overlay anchored at projectLon/Lat (like a tooltip)
   *   - "stat-counter"    → tracked counter that animates from 0 → counterValue
   *   - "lowerthird"      → tracked lower-third bar style at the projection point
   */
  layout: "city-projected" | "bottom-banner" | "tracked-card" | "stat-counter" | "lowerthird";
  projectLon?: number;
  projectLat?: number;
  /** Visibility — toggle off to hide without removing. Default true. */
  enabled?: boolean;
  /** Fade the label IN at its In time. Default true. When false it cuts in. */
  fadeIn?: boolean;
  /** Fade the label OUT at its Out time. Default true. When false it holds on
   *  screen to the end of the scene (no out animation). */
  fadeOut?: boolean;
  /** For stat-counter variant: target number to count up to. */
  counterValue?: number;
  /** For stat-counter: prefix/suffix around the number (e.g. "€", " people"). */
  counterPrefix?: string;
  counterSuffix?: string;
  /** Accent color override for the label's chrome (border / counter / bar). */
  accentColor?: string;
  /**
   * Per-label font override. When unset, the label uses the style package's
   * primary font (style.fonts.primary.family). Set to a font family name to
   * override just this label — every label can pick its own font while the
   * package font is the default.
   */
  fontFamily?: string;
};

/** Animated route between waypoints, with a moving vehicle icon. */
export type TransportMode =
  | "walking"
  | "cycling"
  | "driving"
  | "driving-traffic"
  | "boat"
  | "aircraft";

export type RouteIconPreset =
  | "walking"
  | "car"
  | "bike"
  | "boat"
  | "aircraft"
  | "custom";

export type RouteStyle = {
  color: string;
  width: number;
  glowColor: string;
  glowWidth: number;
  casingColor: string;   // dark outline under the colored line for legibility
  casingWidth: number;
  dashed: boolean;
};

/** How the route line is revealed over time. */
export type RouteAnimationStyle =
  /** Line draws from start → end via line-trim-offset (default, most cinematic). */
  | "draw"
  /** Whole line visible at frame 0, fades from 0 → 1 opacity. */
  | "fade"
  /** Dashed line where dashes flow continuously along the path. */
  | "dotted-flow"
  /** No animation — line is fully visible from the start. */
  | "static";

export type RouteSpec = {
  /** Two required endpoints (lon, lat). */
  from: { lon: number; lat: number; name?: string };
  to:   { lon: number; lat: number; name?: string };
  /**
   * Optional intermediate waypoints. Mapbox Directions supports up to 25
   * coordinates per request. The effective route is [from, ...via, to].
   */
  via?: { lon: number; lat: number; name?: string }[];
  transport: TransportMode;
  /** Resolved path coordinates [lon, lat][] — cached from /api/route. */
  coordinates: [number, number][];
  /** Distance in km from /api/route — display only. */
  distanceKm?: number;
  /** Duration in minutes from /api/route — display only (no duration for boat overlay note). */
  durationMin?: number;
  /** Recompute when from/to/transport changes (set client-side). */
  resolvedAt: number;
  style: RouteStyle;
  icon: { preset: RouteIconPreset; customUrl?: string; size: number; show: boolean };
  /** Fraction of total duration the line takes to draw (0–1). */
  drawDuration: number;
  /** Animation style — defaults to "draw" if unset. */
  animationStyle?: RouteAnimationStyle;
  /** When true, camera lon/lat follows the icon position during the draw animation. */
  followCamera?: boolean;
  /** Show numbered pulse markers at each stop. Default true when route is added. */
  showStopMarkers?: boolean;
  /**
   * Hide the route from the scene without destroying it. Default true.
   * Toggling visibility off keeps all settings/coords so the user can
   * temporarily compare with/without the route. Use the explicit "Delete
   * route" button to actually destroy.
   */
  enabled?: boolean;
  /**
   * Snapshot of the camera waypoints + animation state BEFORE the route
   * was added. Set automatically by addRoute() so disabling the route
   * restores the user's original camera framing — no "where did my zoom go?"
   * surprise.
   */
  prevCamera?: {
    start: { lon: number; lat: number; zoom: number; pitch?: number; bearing?: number };
    mid?: { lon: number; lat: number; zoom: number; pitch?: number; bearing?: number };
    extraWaypoints?: { lon: number; lat: number; zoom: number; pitch?: number; bearing?: number }[];
    end: { lon: number; lat: number; zoom: number; pitch: number; bearing: number };
  };
};

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "smooth"
  | "cinematic";

/** Visual styling for a highlight polygon — border, glow, fill. */
/** Fill treatment for a highlighted area. "solid" is the default flat tint;
 *  the others are tiled textures rendered via Mapbox fill-pattern — the staple
 *  "contested / occupied territory" look in history & geopolitics explainers. */
export type HighlightFillType = "solid" | "hatch" | "crosshatch" | "dots" | "stripes";

export type HighlightStyle = {
  borderColor: string;
  borderWidth: number;       // line-width px (default 3.5)
  glowColor: string;
  glowWidth: number;         // line-width px for soft outer glow (default 22)
  glowBlur: number;          // line-blur px (default 10)
  fillColor: string;
  fillOpacity: number;       // 0–1 (default 0.22)
  /** Fill texture. Defaults to "solid" when unset (back-compat). */
  fillType?: HighlightFillType;
};

/** How the highlight reveals over time. */
export type HighlightAnimation =
  /** Border + fill fade in together over [hold, breathe]. */
  | "fade"
  /** Border line draws around the polygon perimeter, then fill fades in. */
  | "sweep"
  /** Border-width grows from 0 to full as opacity ramps up (energetic). */
  | "pulse-in"
  /** Border first (opacity), fill comes in delayed for cleaner attention. */
  | "border-first"
  /** Always fully visible — no animation. */
  | "static";

/** A label rendered AT the polygon's centroid (or custom anchor). */
export type HighlightLabel = {
  text: string;                 // e.g. "GERMANY"
  sub?: string;                 // e.g. "EUROPE"  (optional secondary line)
  /** Where to anchor the label relative to the polygon. Default "centroid". */
  anchor?: "centroid" | "top" | "bottom" | { lon: number; lat: number };
  /** Optional typography overrides — falls back to scene's labelTypography. */
  style?: {
    color?: string;
    size?: number;              // px (4K canvas)
    weight?: number;
    spacing?: number;           // letter-spacing px
    subColor?: string;
    subSize?: number;
  };
  /** Fade in/out timing as 0–1 fractions of scene duration. */
  fade?: { in: number; out: number };
};

/**
 * Any highlighted shape on the map — country, region, district, town,
 * ocean, custom polygon. The geojson is inline (small enough to embed in
 * the generated TSX) so no separate file needs to live in public/.
 */
export type HighlightSpec = {
  /** Human-readable name shown in UI (e.g. "Balingen, Baden-Württemberg") */
  name: string;
  /** Place type from search ("country" | "city" | "district" | "ocean" | "custom") */
  placeType: string;
  /** Inline GeoJSON FeatureCollection or Feature */
  geojson: any;
  style: HighlightStyle;
  /** Animation style — defaults to "fade" if unset. */
  animationStyle?: HighlightAnimation;
  /**
   * Per-highlight fade-in / fade-out timing as 0–1 fractions of scene
   * duration. When unset, falls back to global beats.hold/breathe.
   */
  fade?: { in: number; out: number };
  /** Optional label tracked on the polygon (centroid by default). */
  label?: HighlightLabel;
  /**
   * ISO 3166-1 alpha-2 country code (e.g. "FR"), auto-detected when the
   * highlight is picked from search. Used to source the flag image.
   */
  countryISO?: string;
  /**
   * Optional country-flag overlay — the staple "this is X country" beat in
   * history / geopolitics explainers. Rendered as a chip at the polygon anchor.
   */
  flag?: {
    show: boolean;
    /** ISO-2 code (lowercased for the flag CDN). Defaults to countryISO. */
    iso: string;
    /** Where to place the chip relative to the polygon. Default "centroid". */
    anchor?: "centroid" | "top" | "bottom";
    /** Chip width in 4K canvas px (height derived 3:2). Default 220. */
    size?: number;
    /** Show the ISO code beside the flag. Default true. */
    showCode?: boolean;
  };
  /** Visibility — toggle off to hide without removing. Default true. */
  enabled?: boolean;
};

/**
 * Photo pin — a custom image dropped at a coordinate, tracked on the map.
 * Renders as a circle-cropped polaroid with a small drop shadow above the
 * anchor. Common in YouTube travel docs for "here's where this person lives".
 */
export type PhotoPin = {
  name: string;
  lon: number;
  lat: number;
  /** URL to image (uploaded to /public/fonts/ or external). */
  url: string;
  /** Circle diameter in 4K canvas px (default 180). */
  size?: number;
  /** Optional caption beneath the photo. */
  caption?: string;
  /** Fade in/out fractions of scene duration. Defaults to [0.3, 1]. */
  fade?: { in: number; out: number };
};

/**
 * Animated arrow — curved line from A → B with an arrowhead.
 * Great for "X migration", "Y trade route", "Z invasion". Uses the same
 * great-circle math as boat/aircraft routes for the curve.
 */
export type MapArrow = {
  name: string;
  from: { lon: number; lat: number };
  to: { lon: number; lat: number };
  color: string;
  width: number;       // px
  /** Curvature 0–1 — 0 = straight line, 1 = exaggerated bow. Default 0.4. */
  curvature?: number;
  /** Draw animation duration as fraction of scene (default 0.5). */
  drawDuration?: number;
  /** Fade window — defaults to [0.2, 1]. */
  fade?: { in: number; out: number };
};

export type MapSceneSpec = {
  start: CameraPos;
  mid?: CameraPos;
  /**
   * Optional list of additional intermediate camera waypoints.
   * The effective camera path is: [start, mid?, ...extraWaypoints, end].
   * Animation time (0 → beats.arrive) is distributed evenly across all phases.
   */
  extraWaypoints?: CameraPos[];
  end: CameraPos & { pitch: number; bearing: number };
  beats: Beats;
  /** Per-phase easing for camera moves. Defaults to easeInOut / smooth. */
  easing: { phase1: EasingName; phase2: EasingName };
  /**
   * Highlighted areas — N polygons (countries, regions, cities, oceans, …)
   * each with independent styling. Rendered in array order (later items
   * paint on top). Empty array = no highlights.
   */
  highlights?: HighlightSpec[];
  /** @deprecated single-highlight legacy field — read on load, never written. Use `highlights` instead. */
  highlight?: HighlightSpec | null;
  /** When true: bg + map tiles are transparent, only highlight + labels render. */
  transparentBg: boolean;
  /** Show street/road layers (toggles all road-like layers in the basemap). */
  showStreets: boolean;
  /** Show text labels (city names, country names, POI labels, etc.) */
  showLabels: boolean;
  /** Optional animated route with vehicle icon. */
  route: RouteSpec | null;
  /** C1 — photo pins anchored at coordinates. */
  photoPins?: PhotoPin[];
  /** C2 — animated arrows between pairs of coordinates. */
  arrows?: MapArrow[];
  labels: SceneLabel[];
  mapStyleUrl: string;
  /** Catmull-Rom spline through waypoints (smoother than linear). Default true. */
  smoothCameraPath?: boolean;
  /** Render 3D buildings (fill-extrusion). Only on streets/light/dark/sat-streets. */
  show3dBuildings?: boolean;
  /** Render 3D terrain with elevation exaggeration. */
  terrain?: { enabled: boolean; exaggeration: number };
};

export type DataVizSceneSpec = {
  variant: "counter" | "bar" | "line";
  data: {
    value?: number;
    suffix?: string;
    prefix?: string;
    bars?: { label: string; value: number }[];
    points?: { label: string; value: number }[];
    /** Counter: decimal places shown (default 0). */
    decimals?: number;
    /** Counter: group thousands with separators (default true). */
    separator?: boolean;
  };
  labels: { title: string; subtitle: string };
  reveal: { inFrame: number; holdFrame: number; outFrame: number };
  /** Accent color for the counter / bars / line / dots. Defaults to palette.borderColor. */
  accentColor?: string;
};

/**
 * Title templates (#8) — distinct, ready-to-use looks inspired by the title
 * cards real YouTube docs/explainers use. Each is a complete visual treatment;
 * the individual knobs below (align/position/scale/accent/animation/…) let the
 * user fine-tune any of them. `template` is optional so legacy title scenes
 * (which only had `variant`) keep rendering as the "classic" look.
 */
export type TitleTemplate =
  /** Thin elegant centered title with soft glow (the original look). */
  | "classic"
  /** Huge bold uppercase title with an accent underline bar. Punchy. */
  | "impact"
  /** Kicker sits inside a filled accent pill above the title. */
  | "kicker-box"
  /** Accent vertical bar on the left, title + subtitle stacked tight. */
  | "stacked"
  /** Serif title, hairline rule, italic subtitle. Editorial / prestige. */
  | "serif"
  /** Title words rise in sequence (word-by-word reveal). */
  | "word-reveal";

export type TitleAnimation =
  | "fade-up"     // fade + slide up (default)
  | "fade"        // pure opacity
  | "scale"       // scale from 0.9 + fade
  | "word-reveal" // each word staggers in
  | "wipe";       // clip-path wipe left→right

export type TitleSceneSpec = {
  variant: "centered" | "left" | "split";
  title: string;
  subtitle: string;
  kicker: string;        // small text above title (chapter number, location, etc.)
  background: "solid" | "gradient" | "transparent";
  reveal: { inFrame: number; holdFrame: number; outFrame: number };

  // ── #8: template + adjustability (all optional → back-compat) ──────────
  /** Named template. Defaults to "classic" when unset. */
  template?: TitleTemplate;
  /** Horizontal alignment. Falls back to variant (left/centered) when unset. */
  align?: "left" | "center" | "right";
  /** Vertical placement of the block. Default "center". */
  position?: "top" | "center" | "bottom";
  /** Multiplier on the template's title size (0.5–2). Default 1. */
  titleScale?: number;
  /** Accent color for bars / pills / rules. Defaults to palette.borderColor. */
  accentColor?: string;
  /** Title text color. Default white. */
  titleColor?: string;
  /** Force-uppercase the title. */
  uppercaseTitle?: boolean;
  /** Title font weight override. */
  titleWeight?: number;
  /** Entrance animation. Default "fade-up". */
  animation?: TitleAnimation;
  /** Wrap width as a fraction of canvas width (0.3–1). Default 0.84. */
  maxWidthPct?: number;
};

export type LowerThirdSceneSpec = {
  /** Bottom-corner positioning */
  position: "left" | "right";
  name: string;
  role: string;          // small text under name
  accentBar: boolean;
  reveal: { inFrame: number; holdFrame: number; outFrame: number };

  // ── Adjustability (all optional → back-compat) ─────────────────────────
  /** Multiplier on the name/role text size (0.5–2). Default 1. */
  fontScale?: number;
  /** Entrance animation. Default "slide". */
  animation?: "slide" | "fade" | "wipe";
  /** Accent color for the bar. Defaults to palette.borderColor. */
  accentColor?: string;
};

/**
 * Quote Card — large pull-quote for interview cutaways / doc moments.
 *
 *   ┌──────────────────────────────────────┐
 *   │  "  the actual quote text in serif   │
 *   │     with proper hanging punctuation  │
 *   │     across multiple lines           "│
 *   │                                       │
 *   │     — ATTRIBUTION · CONTEXT           │
 *   └──────────────────────────────────────┘
 */
export type QuoteSceneSpec = {
  quote: string;
  attribution: string;
  context: string;                 // optional second line under attribution
  variant: "centered" | "left";
  showQuoteMarks: boolean;
  background: "solid" | "gradient" | "transparent";
  reveal: { inFrame: number; holdFrame: number; outFrame: number };

  // ── Adjustability (all optional → back-compat) ─────────────────────────
  /** Multiplier on the quote text size (0.5–2). Default 1. */
  fontScale?: number;
  /** Accent color for quote marks + attribution. Defaults to palette.borderColor. */
  accentColor?: string;
  /** Wrap width as a fraction of canvas width (0.4–1). Default 0.8. */
  maxWidthPct?: number;
  /** Entrance animation. Default "fade-up". */
  animation?: "fade-up" | "fade" | "scale";
};

/** Output framing. Drives width/height via dimsFor(). fps is fixed at 24. */
export type AspectRatio = "16:9" | "9:16" | "1:1";

export type SceneSpec = {
  /**
   * Stable per-scene identity. Used as the React key + timeline selection
   * handle in the multi-scene editor. Optional so legacy single-spec saves
   * (which had no id) still type-check; the store assigns one on load.
   */
  id?: string;
  kind: "map" | "dataviz" | "title" | "lowerthird" | "quote";
  name: string;
  durationSec: number;
  fps: number;
  /** Output framing. Defaults to "16:9" when absent (legacy specs). */
  aspect?: AspectRatio;
  width: number;
  height: number;
  style: StylePreset;
  scene:
    | MapSceneSpec
    | DataVizSceneSpec
    | TitleSceneSpec
    | LowerThirdSceneSpec
    | QuoteSceneSpec;
};
