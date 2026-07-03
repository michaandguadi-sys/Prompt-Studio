"use client";

import React, { useEffect, useMemo, useRef } from "react";
import MapGL, { type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoStop } from "./worldCoords";

/**
 * GRADED SATELLITE base — real Earth texture (ESRI World Imagery through our
 * cached /api/sat proxy) pulled down into a dark cinematic grade: desaturated,
 * crushed blacks, gentle warmth. Terrain reads as texture, never as noise.
 */
const satelliteNightStyle = (origin: string): Record<string, unknown> => ({
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [`${origin}/api/sat/{z}/{x}/{y}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#04060f" } },
    {
      id: "sat", type: "raster", source: "sat",
      paint: {
        "raster-saturation": -0.45,
        "raster-contrast": 0.22,
        "raster-brightness-max": 0.6,
        "raster-brightness-min": 0.015,
        "raster-hue-rotate": 8,
        "raster-fade-duration": 0,
      },
    },
  ],
});

/**
 * The living map — the Generate page's entire background is a real MapLibre
 * globe (the product's own engine, so what you see IS what it makes):
 *
 *   · idle: the camera drifts slowly around the world; ambient flight arcs
 *     draw between world hubs with glowing particles riding them
 *   · typing: recognised places bloom as pulsing pins, the journey draws as
 *     bright arcs, and the camera eases to frame what the AI understood
 *   · hover (inspiration cards): that story's route previews in amber
 *   · generate: the camera dives toward the first destination — the animation
 *     begins before the editor even opens
 *   · a soft parallax follows the mouse; everything pauses when tab is hidden
 *
 * All overlay drawing happens on ONE canvas in a single rAF loop that projects
 * geo coordinates through the live map — no React re-renders per frame.
 */

/** A tap-to-preview restyle of the living map: raster grade + accent palette
 *  for arcs/pins. Lets the landing's style cards recolour the world LIVE. */
export type MapGrade = {
  tint: string;                       // wash colour drawn over the frame
  accents: [string, string, string];  // arc / pin / hub palette
  saturation?: number;                // raster-saturation (-1..1)
  brightness?: number;                // raster-brightness-max (0..1)
};

type Props = {
  stops: GeoStop[];
  hoverStops?: GeoStop[] | null;
  generating?: boolean;
  grade?: MapGrade | null;
};

/* Ambient world hubs — the idle "airline network" show. */
const HUBS: [number, number][] = [
  [-74.01, 40.71], [-0.13, 51.51], [2.35, 48.86], [28.98, 41.01], [55.27, 25.20],
  [139.69, 35.69], [103.85, 1.29], [151.21, -33.87], [-43.17, -22.91], [-99.13, 19.43],
  [18.42, -33.93], [77.10, 28.70], [-122.42, 37.77], [13.40, 52.52],
];
/** Ambient arc cycles: [fromHub, toHub, durationSec, phaseSec] */
const AMBIENT: [number, number, number, number][] = [
  [0, 1, 9, 0], [1, 4, 11, 2], [4, 5, 10, 4], [5, 7, 12, 1], [12, 5, 13, 6],
  [9, 8, 10, 3], [2, 3, 8, 5], [3, 11, 11, 7], [10, 8, 14, 2], [6, 7, 9, 8],
  [13, 2, 7, 4], [0, 12, 10, 9],
];

const IRIS = "#6E7BFF", CYAN = "#2FE0FF", VIOLET = "#B57BFF", AMBER = "#FFB86E";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const eio = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export const LiveStoryMap: React.FC<Props> = ({ stops, hoverStops, generating, grade }) => {
  const mapStyle = useMemo(
    () => satelliteNightStyle(typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );
  const mapRef = useRef<MapRef>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const par = useRef({ x: 0, y: 0 });
  const loadedRef = useRef(false);

  // Live refs so the rAF loop always sees fresh props without re-subscribing.
  const stopsRef = useRef(stops);
  const hoverRef = useRef(hoverStops);
  const genRef = useRef(!!generating);
  const gradeRef = useRef(grade);
  // Pin bloom: remember when each stop label first appeared, for the pop-in.
  const bornRef = useRef(new Map<string, number>());
  stopsRef.current = stops;
  hoverRef.current = hoverStops;
  genRef.current = !!generating;
  gradeRef.current = grade;

  /* Tap-to-restyle: regrade the satellite raster live (no style reload). */
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m || !loadedRef.current) return;
    try {
      m.setPaintProperty("sat", "raster-saturation", grade?.saturation ?? -0.45);
      m.setPaintProperty("sat", "raster-brightness-max", grade?.brightness ?? 0.6);
    } catch { /* style mid-load — cosmetic */ }
  }, [grade]);

  /* ── Camera choreography: react to stops / hover / generate ──────────────── */
  const camKey = useMemo(
    () => JSON.stringify([stops.map((s) => [s.lon, s.lat]), generating]),
    [stops, generating],
  );
  useEffect(() => {
    const m = mapRef.current?.getMap() as any;
    if (!m || !loadedRef.current) return;
    const t = setTimeout(() => {
      try {
        if (genRef.current && stopsRef.current.length) {
          // Generation begins: dive toward the opening destination.
          const s = stopsRef.current[0];
          m.flyTo({ center: [s.lon, s.lat], zoom: Math.min(s.z, 6.5), pitch: 34, bearing: 0, duration: 2600, essential: true });
        } else if (stopsRef.current.length === 1) {
          const s = stopsRef.current[0];
          m.easeTo({ center: [s.lon, s.lat], zoom: Math.min(s.z, 5.5), pitch: 0, duration: 1600 });
        } else if (stopsRef.current.length > 1) {
          let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999;
          for (const s of stopsRef.current) {
            minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon);
            minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
          }
          m.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
            padding: { top: 110, bottom: 230, left: 90, right: 90 },
            maxZoom: 5.2, duration: 1700,
          });
        } else {
          // Back to the drifting world view.
          m.easeTo({ center: [12, 26], zoom: 1.65, pitch: 0, duration: 1800 });
        }
      } catch { /* map mid-teardown */ }
    }, 420); // settle briefly so keystrokes don't thrash the camera
    return () => clearTimeout(t);
  }, [camKey]);

  /* ── Mouse parallax (desktop only) ────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(hover:hover)").matches) return;
    const fn = (e: MouseEvent) => {
      mouse.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", fn, { passive: true });
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  /* ── The one rAF loop: idle drift + canvas overlay + parallax ─────────────── */
  useEffect(() => {
    let raf = 0;
    let driftLon = 12;

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (typeof document !== "undefined" && document.hidden) return;
      const t = ts / 1000;
      const m = mapRef.current?.getMap() as any;
      const cv = canvasRef.current;
      if (!m || !cv || !loadedRef.current) return;

      // Idle world drift — only when nothing is recognised and not generating.
      if (!stopsRef.current.length && !hoverRef.current?.length && !genRef.current && !m.isMoving()) {
        driftLon = ((driftLon + 0.008 + 180) % 360) - 180;
        try { m.setCenter([driftLon, 26]); } catch {}
      }

      // Parallax — the whole stage leans gently toward the cursor.
      par.current.x += ((mouse.current.x - 0.5) * 18 - par.current.x) * 0.04;
      par.current.y += ((mouse.current.y - 0.5) * 12 - par.current.y) * 0.04;
      if (wrapRef.current) {
        wrapRef.current.style.transform =
          `scale(1.07) translate(${(-par.current.x).toFixed(2)}px, ${(-par.current.y).toFixed(2)}px)`;
      }

      // ── Canvas overlay ──
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const proj = (lon: number, lat: number): [number, number] | null => {
        try { const p = m.project([lon, lat]); return [p.x, p.y]; } catch { return null; }
      };
      const onScreen = (p: [number, number] | null): p is [number, number] =>
        !!p && p[0] > -220 && p[0] < W + 220 && p[1] > -220 && p[1] < H + 220;

      /** A lifted quadratic arc (control point = midpoint raised screen-up),
       *  with an optional glowing traveller dot at parametric position headT. */
      const drawArc = (
        a: [number, number], b: [number, number],
        color: string, width: number, alpha: number, headT: number | null, glow = true,
      ) => {
        const mx = (a[0] + b[0]) / 2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const lift = Math.min(160, len * 0.24);
        const cy = (a[1] + b[1]) / 2 - lift;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        ctx.shadowColor = glow ? color : "transparent";
        ctx.shadowBlur = glow ? 10 : 0;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(mx, cy, b[0], b[1]);
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (headT != null) {
          const u = 1 - headT, q = headT;
          const hx = u * u * a[0] + 2 * u * q * mx + q * q * b[0];
          const hy = u * u * a[1] + 2 * u * q * cy + q * q * b[1];
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#fff";
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.arc(hx, hy, width * 0.9 + 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      };

      const busy = !!(stopsRef.current.length || hoverRef.current?.length);
      // Accent palette — retinted live when a style card is tapped.
      const [AC1, AC2, AC3] = gradeRef.current?.accents ?? [IRIS, CYAN, VIOLET];

      // 1 · Ambient airline network — dimmed while a real story is on stage.
      const ambAlpha = busy ? 0.10 : 0.30;
      const colors = [AC1, AC2, AC3];
      AMBIENT.forEach(([fi, ti, dur, phase], i) => {
        const p = ((t + phase) % dur) / dur;
        const a = proj(HUBS[fi][0], HUBS[fi][1]);
        const b = proj(HUBS[ti][0], HUBS[ti][1]);
        if (!onScreen(a) || !onScreen(b)) return;
        const grow = eio(clamp(p / 0.55, 0, 1));
        const fade = 1 - eio(clamp((p - 0.72) / 0.28, 0, 1));
        drawArc(a, b, colors[i % 3], 1.6, ambAlpha * fade, p < 0.72 ? grow : null, false);
      });
      // Twinkling hub dots.
      HUBS.forEach(([lon, lat], i) => {
        const p = proj(lon, lat);
        if (!onScreen(p)) return;
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 2.1));
        ctx.globalAlpha = (busy ? 0.18 : 0.5) * tw;
        ctx.fillStyle = i % 3 ? AC1 : AC2;
        ctx.beginPath(); ctx.arc(p![0], p![1], 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });

      // 2 · Hover preview (inspiration cards) — warm amber sketch.
      const hs = hoverRef.current;
      if (hs?.length) {
        for (let i = 0; i < hs.length - 1; i++) {
          const a = proj(hs[i].lon, hs[i].lat), b = proj(hs[i + 1].lon, hs[i + 1].lat);
          if (onScreen(a) && onScreen(b)) {
            const shimmer = ((t * 0.55 + i * 0.21) % 1);
            drawArc(a, b, AMBER, 2.2, 0.85, shimmer);
          }
        }
        hs.forEach((s) => {
          const p = proj(s.lon, s.lat);
          if (!onScreen(p)) return;
          ctx.fillStyle = AMBER; ctx.shadowColor = AMBER; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(p![0], p![1], 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        });
      }

      // 3 · The user's recognised story — bright, alive, undeniable.
      const ss = stopsRef.current;
      if (ss.length) {
        const now = performance.now();
        for (let i = 0; i < ss.length - 1; i++) {
          const a = proj(ss[i].lon, ss[i].lat), b = proj(ss[i + 1].lon, ss[i + 1].lat);
          if (onScreen(a) && onScreen(b)) {
            const traveller = ((t * 0.45 + i * 0.33) % 1);
            drawArc(a, b, AC1, 2.6, 0.95, traveller);
          }
        }
        ss.forEach((s, i) => {
          const p = proj(s.lon, s.lat);
          if (!onScreen(p)) return;
          const key = `${s.label}:${s.lon.toFixed(2)}`;
          if (!bornRef.current.has(key)) bornRef.current.set(key, now);
          const age = (now - bornRef.current.get(key)!) / 1000;
          const pop = eio(clamp(age / 0.5, 0, 1));
          const [x, y] = p!;
          // breathing outer ring
          const ring = 9 + 4 * Math.sin(t * 2.2 + i * 1.4);
          ctx.globalAlpha = 0.5 * pop;
          ctx.strokeStyle = AC2; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(x, y, ring * pop, 0, Math.PI * 2); ctx.stroke();
          // core pin
          ctx.globalAlpha = pop;
          ctx.fillStyle = "#fff"; ctx.shadowColor = AC1; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(x, y, 4 * pop, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          // label chip
          if (pop > 0.6 && s.label) {
            ctx.font = "600 11px Inter, sans-serif";
            const w = ctx.measureText(s.label).width;
            ctx.globalAlpha = 0.88 * pop;
            ctx.fillStyle = "rgba(4,6,16,0.78)";
            const bx = x - w / 2 - 7, by = y - 30;
            ctx.beginPath();
            (ctx as any).roundRect ? (ctx as any).roundRect(bx, by, w + 14, 19, 6) : ctx.rect(bx, by, w + 14, 19);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fillText(s.label, x - w / 2, y - 16.5);
          }
          ctx.globalAlpha = 1;
        });
        // prune bloom memory for stops that left
        if (bornRef.current.size > 24) {
          const live = new Set(ss.map((s) => `${s.label}:${s.lon.toFixed(2)}`));
          for (const k of bornRef.current.keys()) if (!live.has(k)) bornRef.current.delete(k);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Map + parallax wrapper (slightly oversized so edges never show) */}
      <div ref={wrapRef} className="absolute inset-0 will-change-transform" style={{ transform: "scale(1.07)" }}>
        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: 12, latitude: 26, zoom: 1.65 }}
          mapStyle={mapStyle as any}
          interactive={false}
          attributionControl={false}
          onLoad={(e) => {
            loadedRef.current = true;
            try { (e.target as any).setMaxParallelImageRequests?.(48); } catch {}
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Cinematic grade — the satellite already carries the texture; these
          keep it a BACKDROP: cool tint wash, readability fades, firm vignette. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(6,9,22,0.38)" }} />
      {/* Style-card tint — the tap-to-preview wash, cross-fading between looks */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: grade ? 1 : 0,
          background: grade ? `linear-gradient(180deg, ${grade.tint}30 0%, transparent 38%, ${grade.tint}24 100%)` : "transparent",
          mixBlendMode: "soft-light" as any,
        }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(75% 55% at 50% 0%, rgba(110,123,255,0.10), transparent 62%)" }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(4,6,16,0.62) 0%, transparent 28%, transparent 58%, rgba(4,6,16,0.82) 100%)" }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 46%, transparent 40%, rgba(4,6,16,0.5) 100%)" }} />
    </div>
  );
};
