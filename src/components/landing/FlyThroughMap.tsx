"use client";

/**
 * FlyThroughMap v5 — flawless, cinematic, newspaper-documentary grade.
 *
 * Anti-flicker arsenal:
 *  · Tiles proxied through /api/sat/{z}/{x}/{y} — server-cached, proper CORS.
 *  · Pre-warm: during load spinner, camera visits the Nepal z=6 position so those
 *    tiles are in-cache before the scroll reaches the reveal.
 *  · Map opacity fades to 0 during the rapid zoom-out (p=0.61–0.73) — tiles load
 *    invisibly; the camera cuts to black then reveals Nepal pristine.
 *  · Canvas always scaled ≥ 1.08 — edges never bleed through on banking.
 *  · raster-fade-duration: 0 — no cross-fade artifacts between tile loads.
 *
 * Visuals:
 *  · Raster: saturation -0.82, contrast 0.44 — punchy blacks, crisp terrain.
 *  · 9-layer colour-grade stack — noir foundation → filmic S-curve → editorial red
 *    on Nepal → golden-hour amber for CTA.
 *  · Nepal: diagonal-hatch fill-pattern (registered on map load) + screen-projected
 *    "NEPAL" title card that follows the camera precisely.
 *  · Deep inky vignette — edges nearly black, eye locked to centre.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Sparkles, Film, Globe, ArrowRight, ChevronDown } from "lucide-react";

// ─── math ────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const eio   = (t: number) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
const eo    = (t: number) => 1 - (1-t)*(1-t);

function tent(p: number, center: number, halfWin: number) {
  const d = Math.abs(p - center);
  return d >= halfWin ? 0 : eio(1 - d / halfWin);
}

// ─── camera keyframes ────────────────────────────────────────────────────────

type CamFrame = { t: number; lng: number; lat: number; zoom: number; pitch: number; bearing: number };

const FRAMES: CamFrame[] = [
  // Establish
  { t:0.00, lng:83.920, lat:28.510, zoom: 9.4, pitch:  4, bearing:  0 },
  { t:0.07, lng:83.955, lat:28.450, zoom:10.3, pitch: 26, bearing:176 },
  { t:0.14, lng:83.973, lat:28.436, zoom:11.1, pitch: 48, bearing:170 },
  // Route follow — max zoom 12.0, max pitch 66°
  { t:0.22, lng:83.970, lat:28.447, zoom:11.7, pitch: 63, bearing:351 },
  { t:0.31, lng:83.952, lat:28.464, zoom:12.0, pitch: 66, bearing:346 },
  { t:0.40, lng:83.928, lat:28.487, zoom:11.9, pitch: 65, bearing:337 },
  { t:0.50, lng:83.902, lat:28.510, zoom:11.6, pitch: 61, bearing:320 },
  { t:0.58, lng:83.882, lat:28.530, zoom:11.2, pitch: 55, bearing:308 },
  // Ascent — tiles fade invisible while these frames load new zoom levels
  { t:0.64, lng:83.880, lat:28.540, zoom:10.2, pitch: 38, bearing:280 },
  { t:0.70, lng:83.980, lat:28.480, zoom: 8.2, pitch: 22, bearing:240 },
  { t:0.77, lng:84.100, lat:28.280, zoom: 7.0, pitch: 14, bearing:210 },
  { t:0.83, lng:84.150, lat:28.100, zoom: 6.2, pitch:  8, bearing:200 }, // FULL NEPAL
  // Return & CTA
  { t:0.90, lng:83.960, lat:28.420, zoom: 7.8, pitch: 18, bearing:215 },
  { t:0.96, lng:83.930, lat:28.490, zoom: 9.2, pitch: 22, bearing:210 },
  { t:1.00, lng:83.918, lat:28.508, zoom: 9.5, pitch: 10, bearing:200 },
];

// Nepal centre for label projection
const NEPAL_CENTER: [number, number] = [84.10, 28.22];

function getCam(p: number): CamFrame {
  p = clamp(p);
  if (p <= FRAMES[0].t) return FRAMES[0];
  const last = FRAMES[FRAMES.length - 1];
  if (p >= last.t) return last;
  for (let i = 0; i < FRAMES.length - 1; i++) {
    const a = FRAMES[i], b = FRAMES[i + 1];
    if (p < b.t) {
      const t = eio((p - a.t) / (b.t - a.t));
      let db = b.bearing - a.bearing;
      if (db >  180) db -= 360;
      if (db < -180) db += 360;
      return {
        t: p,
        lng:     lerp(a.lng, b.lng, t),
        lat:     lerp(a.lat, b.lat, t),
        zoom:    lerp(a.zoom, b.zoom, t),
        pitch:   lerp(a.pitch, b.pitch, t),
        bearing: a.bearing + db * t,
      };
    }
  }
  return last;
}

// ─── route ───────────────────────────────────────────────────────────────────

const ROUTE: [number, number][] = [
  [83.978,28.397],[83.971,28.413],[83.963,28.427],[83.954,28.440],
  [83.944,28.452],[83.933,28.463],[83.922,28.474],[83.911,28.485],
  [83.900,28.496],[83.889,28.507],[83.879,28.517],[83.869,28.527],
  [83.859,28.537],[83.849,28.546],[83.839,28.554],[83.829,28.562],
  [83.820,28.569],[83.812,28.576],[83.810,28.586],[83.809,28.598],
];

function sliceRoute(pts: [number,number][], t: number): [number,number][] {
  if (t <= 0) return [pts[0], pts[0]];
  if (t >= 1) return pts;
  let total = 0;
  const d = pts.slice(1).map((b, i) => { const dd = Math.hypot(b[0]-pts[i][0], b[1]-pts[i][1]); total += dd; return dd; });
  const out: [number,number][] = [pts[0]];
  let rem = total * t;
  for (let i = 0; i < d.length; i++) {
    if (rem <= d[i]) { const f = d[i] > 0 ? rem/d[i] : 0; out.push([lerp(pts[i][0], pts[i+1][0], f), lerp(pts[i][1], pts[i+1][1], f)]); return out; }
    out.push(pts[i+1]); rem -= d[i];
  }
  return pts;
}

// ─── Nepal polygon ────────────────────────────────────────────────────────────

const NEPAL_COORDS: [number, number][] = [
  [80.06,28.83],[80.14,29.14],[80.49,29.64],[81.12,30.09],[81.44,30.42],
  [81.86,30.35],[82.11,30.22],[82.40,30.11],[82.63,29.97],[83.20,29.63],
  [83.68,29.74],[83.98,29.79],[84.11,29.31],[84.63,28.57],[85.18,28.33],
  [85.73,28.20],[86.21,28.07],[86.71,27.97],[87.20,27.82],[87.45,27.83],
  [87.71,27.83],[88.14,27.86],[88.18,27.47],[88.10,26.91],[87.64,26.72],
  [87.23,26.40],[86.74,26.49],[85.84,26.39],[84.67,27.05],[83.73,27.36],
  [82.74,27.49],[82.27,27.68],[81.33,27.95],[80.65,28.17],[80.23,28.21],
  [80.06,28.83],
];
const NEPAL_GJ = { type:"Feature" as const, properties:{}, geometry:{ type:"Polygon" as const, coordinates:[NEPAL_COORDS] } };

// ─── Map style — satellite + 3D terrain, paper-terrain grade ─────────────────
// Both tile types proxied through our server for reliable CORS + 30-day cache.

function buildMapStyle(origin: string): Record<string, unknown> {
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      sat: {
        type: "raster",
        tiles: [`${origin}/api/sat/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© Esri, Maxar, Earthstar Geographics",
      },
      dem: {
        type: "raster-dem",
        // Proxied: AWS terrarium tiles have no CORS header — must go through our server.
        tiles: [`${origin}/api/dem/{z}/{x}/{y}`],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
      },
    },
    layers: [{
      id: "sat", type: "raster", source: "sat",
      paint: {
        // Paper-terrain treatment: natural colours, warm parchment cast.
        // Minimal processing so the map is clearly readable.
        "raster-saturation":    -0.15,
        "raster-contrast":       0.08,
        "raster-brightness-max": 0.92,
        "raster-brightness-min": 0.04,
        "raster-hue-rotate":     22,    // warm parchment/paper cast
        "raster-fade-duration":  0,
      },
    }],
    // 3D terrain mesh from DEM tiles
    terrain: { source: "dem", exaggeration: 1.15 },
  } as any;
}

// ─── story beats ─────────────────────────────────────────────────────────────

type Beat = { center:number; win:number; kicker:string; headline:string[]; body:string; side?:"left"|"right"; bottom?:string; cta?:boolean };

const BEATS: Beat[] = [
  {
    center:0.12, win:0.10,
    kicker:"the idea",
    headline:["A story is waiting","to be told."],
    body:"Every journalist, educator and creator has moments that a map explains in seconds. Now you can make that map — no designer needed.",
    bottom:"22%",
  },
  {
    center:0.27, win:0.11, side:"left",
    kicker:"ai director",
    headline:["Describe it in","plain language."],
    body:"The AI Director reads your idea, researches the geography, plans the camera, and times every beat — before you finish your coffee.",
    bottom:"20%",
  },
  {
    center:0.41, win:0.11, side:"right",
    kicker:"route animation",
    headline:["The route draws","itself."],
    body:"Any two places on Earth. Upload a GPX track or type a city pair. Animated, timed, cinematic — in under ten seconds.",
    bottom:"22%",
  },
  {
    center:0.55, win:0.10,
    kicker:"3d terrain",
    headline:["Cinematic camera.","Real terrain."],
    body:"Real satellite imagery. Real elevation. The camera banks through mountains like a film crew with a helicopter.",
    bottom:"24%",
  },
  {
    center:0.80, win:0.09, side:"left",
    kicker:"country highlight",
    headline:["Highlight entire","countries in one click."],
    body:"OSM boundaries, animated border draw, country-scale fill with your brand colours — any geography, flawlessly.",
    bottom:"18%",
  },
  {
    center:0.93, win:0.09,
    kicker:"make it today",
    headline:["Your audience stops","scrolling."],
    body:"Export 4K MP4 in minutes. Share a live public link. The kind of visual your readers remember.",
    bottom:"20%",
    cta: true,
  },
];

// ─── particles ───────────────────────────────────────────────────────────────

const MOTES = [
  {l:7,t:24,d:11.2,dl:0.0,sz:2.4,c:"#6E7BFF"},{l:14,t:57,d:8.8,dl:1.7,sz:1.6,c:"#E8A04A"},
  {l:23,t:16,d:13.1,dl:0.5,sz:3.5,c:"#6E7BFF"},{l:32,t:73,d:8.3,dl:2.8,sz:1.8,c:"#E8A04A"},
  {l:40,t:38,d:10.4,dl:1.2,sz:2.6,c:"#6E7BFF"},{l:49,t:11,d:11.9,dl:0.2,sz:3.8,c:"#2fe0ff"},
  {l:57,t:62,d:9.1,dl:2.0,sz:2.0,c:"#6E7BFF"},{l:65,t:31,d:13.7,dl:0.8,sz:3.0,c:"#E8A04A"},
  {l:73,t:49,d:10.8,dl:3.2,sz:2.4,c:"#6E7BFF"},{l:81,t:22,d:8.6,dl:0.4,sz:1.6,c:"#2fe0ff"},
  {l:88,t:66,d:10.2,dl:1.5,sz:2.8,c:"#6E7BFF"},{l:11,t:82,d:11.6,dl:2.3,sz:1.8,c:"#E8A04A"},
  {l:46,t:87,d:9.4,dl:0.1,sz:3.2,c:"#6E7BFF"},{l:68,t:79,d:10.9,dl:0.9,sz:2.2,c:"#2fe0ff"},
  {l:30,t:6, d:10.0,dl:3.6,sz:1.6,c:"#6E7BFF"},{l:55,t:45,d:12.8,dl:0.7,sz:2.8,c:"#E8A04A"},
  {l:77,t:8, d:8.9,dl:2.2,sz:2.0,c:"#6E7BFF"},{l:21,t:43,d:11.3,dl:1.4,sz:2.6,c:"#2fe0ff"},
];

// ─── typography ───────────────────────────────────────────────────────────────

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const MONO  = "'SF Mono', 'Fira Code', Menlo, monospace";

// ─── CaptionCard ──────────────────────────────────────────────────────────────

const CaptionCard: React.FC<{ beat: Beat; p: number }> = ({ beat, p }) => {
  const raw = tent(p, beat.center, beat.win);
  const o   = eio(clamp(raw / 0.52));
  if (o < 0.01) return null;
  const after = p > beat.center;
  const away  = 1 - o;
  const tx = beat.side === "left" ? lerp(-28, 0, o) : beat.side === "right" ? lerp(28, 0, o) : 0;
  const ty = beat.side ? lerp(0, after ? -10 : 0, away) : after ? lerp(0, -18, away) : lerp(16, 0, o);

  const pos: React.CSSProperties = beat.side === "left"
    ? { left:"5%",  maxWidth:"min(340px,36vw)", transform:`translate(${tx}px,${ty}px)`, textAlign:"left" }
    : beat.side === "right"
    ? { right:"5%", maxWidth:"min(340px,36vw)", transform:`translate(${tx}px,${ty}px)`, textAlign:"left" }
    : { left:"50%",  maxWidth:"min(580px,80vw)", transform:`translate(-50%,${ty}px)`,    textAlign:"center" };

  return (
    <div className="pointer-events-none absolute z-20"
      style={{ bottom: beat.bottom ?? "20%", opacity: o, willChange:"opacity,transform", ...pos }}>
      <div style={{
        padding: beat.side ? "20px 22px" : "28px 36px",
        borderRadius: 22,
        background: "rgba(1,2,8,0.88)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 0 90px rgba(60,80,200,0.12), 0 8px 80px rgba(0,0,0,0.92), inset 0 0 0 0.5px rgba(255,255,255,0.04)",
      }}>
        <div style={{
          fontSize:9, fontWeight:700, letterSpacing:"0.36em", textTransform:"uppercase",
          color:"rgba(47,224,255,0.68)", marginBottom:12,
          display:"flex", alignItems:"center", gap:8,
          justifyContent: !beat.side ? "center" : "flex-start",
        }}>
          <span style={{ width:20, height:1, background:"rgba(47,224,255,0.36)", display:"inline-block" }} />
          {beat.kicker}
          <span style={{ width:20, height:1, background:"rgba(47,224,255,0.36)", display:"inline-block" }} />
        </div>
        <div style={{ marginBottom:14 }}>
          {beat.headline.map((line, i) => (
            <div key={i} style={{
              fontFamily:SERIF, fontWeight:500,
              fontSize: beat.side ? "clamp(18px,2.8vw,30px)" : "clamp(28px,4.6vw,52px)",
              lineHeight:1.02, letterSpacing:"-0.016em", color:"#fff",
              textShadow:"0 2px 30px rgba(0,0,0,0.98), 0 0 60px rgba(30,90,200,0.20)",
            }}>{line}</div>
          ))}
        </div>
        <div style={{
          fontSize: beat.side ? 12.5 : 14.5,
          lineHeight:1.70, color:"rgba(180,208,240,0.58)",
          marginBottom: beat.cta ? 24 : 0,
        }}>{beat.body}</div>
        {beat.cta && (
          <div style={{ display:"flex", justifyContent:"center" }}>
            <div className="pointer-events-auto" style={{
              display:"inline-flex", alignItems:"center", gap:8, padding:"14px 26px", borderRadius:14,
              background:"linear-gradient(108deg,#6E7BFF,#2fe0ff)",
              fontSize:14, fontWeight:700, color:"#fff", cursor:"pointer",
              boxShadow:"0 0 44px rgba(110,123,255,0.60), 0 6px 28px rgba(0,0,0,0.56)",
              letterSpacing:"-0.01em",
            }}>
              Start for free <ArrowRight size={15} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── HUD panels ──────────────────────────────────────────────────────────────

const PromptPanel: React.FC<{ o: number }> = ({ o }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n=>n+1), 460); return ()=>clearInterval(t); }, []);
  const FULL = "A journalist follows the winter migration route through Nepal's Annapurna region, from village to base camp";
  const shown = Math.min(FULL.length, Math.floor(tick * 3.1));
  if (o < 0.01) return null;
  return (
    <div className="pointer-events-none absolute right-[5%] top-[14%] z-20 w-72"
      style={{ opacity:o, transform:`translateX(${(1-o)*26}px)`, willChange:"opacity,transform" }}>
      <div style={{ borderRadius:18, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(1,2,8,0.92)", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", boxShadow:"0 0 60px rgba(110,123,255,0.18), 0 10px 56px rgba(0,0,0,0.88)", overflow:"hidden" }}>
        <div style={{ padding:"10px 14px 8px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:7 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#6E7BFF", boxShadow:"0 0 10px #6E7BFF", animation:"hud-pulse 1.9s ease-in-out infinite" }} />
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.28em", textTransform:"uppercase", color:"rgba(255,255,255,0.36)" }}>AI Director</span>
          <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(255,255,255,0.20)" }}>new project</span>
        </div>
        <div style={{ padding:"13px 14px", minHeight:78 }}>
          <span style={{ fontFamily:MONO, fontSize:11, lineHeight:1.65, color:"rgba(200,224,255,0.80)" }}>
            {FULL.slice(0, shown)}
            {shown < FULL.length && <span style={{ borderRight:"2px solid #6E7BFF", marginLeft:1 }}>&nbsp;</span>}
          </span>
        </div>
        <div style={{ padding:"8px 14px 12px", display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
          <span style={{ fontSize:9.5, color:"rgba(255,255,255,0.24)" }}>Annapurna · terrain 3D</span>
          <div style={{ padding:"5px 12px", borderRadius:8, background:"rgba(110,123,255,0.90)", fontSize:10, fontWeight:700, color:"#fff", boxShadow:"0 0 14px rgba(110,123,255,0.55)" }}>Generate →</div>
        </div>
      </div>
    </div>
  );
};

const DirectorPanel: React.FC<{ o: number }> = ({ o }) => {
  if (o < 0.01) return null;
  return (
    <div className="pointer-events-none absolute left-[5%] top-[13%] z-20 w-56"
      style={{ opacity:o, transform:`translateX(${(1-o)*-24}px)`, willChange:"opacity,transform" }}>
      <div style={{ borderRadius:18, border:"1px solid rgba(110,123,255,0.22)", background:"rgba(1,2,8,0.92)", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", boxShadow:"0 0 60px rgba(110,123,255,0.18), 0 10px 56px rgba(0,0,0,0.88)", padding:"15px 17px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#6E7BFF", boxShadow:"0 0 10px #6E7BFF", animation:"hud-pulse 1.9s ease-in-out infinite" }} />
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(255,255,255,0.36)" }}>Planning</span>
        </div>
        {[{s:"Researching the route",ok:true},{s:"Designing story beats",ok:true},{s:"Timing the camera",ok:false}].map(step => (
          <div key={step.s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", flexShrink:0, background:step.ok?"#6E7BFF":"rgba(255,255,255,0.10)", boxShadow:step.ok?"0 0 8px #6E7BFF":"none" }} />
            <span style={{ fontSize:10, color:step.ok?"rgba(255,255,255,0.74)":"rgba(255,255,255,0.26)" }}>{step.s}</span>
            {step.ok && <span style={{ marginLeft:"auto", fontSize:9, color:"#6E7BFF", fontWeight:700 }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

const BeatCard: React.FC<{ o: number }> = ({ o }) => {
  if (o < 0.01) return null;
  return (
    <div className="pointer-events-none absolute right-[5%] top-[12%] z-20 w-52"
      style={{ opacity:o, transform:`translateX(${(1-o)*24}px)`, willChange:"opacity,transform" }}>
      <div style={{ borderRadius:18, border:"1px solid rgba(47,224,255,0.18)", background:"rgba(1,2,8,0.92)", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", boxShadow:"0 0 52px rgba(47,224,255,0.12), 0 10px 56px rgba(0,0,0,0.88)", padding:"15px 17px" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(255,255,255,0.34)", marginBottom:12 }}>Story beats</div>
        {[{n:"01",l:"Establish",e:"calm",ec:"#38bdf8",cam:"Wide aerial",dur:"3.8s"},{n:"02",l:"Journey",e:"building",ec:"#fb923c",cam:"Terrain follow",dur:"4.2s"},{n:"03",l:"Close-up",e:"tension",ec:"#f87171",cam:"Push-in",dur:"3.4s"}].map(b => (
          <div key={b.n} style={{ padding:"9px 11px", borderRadius:11, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.055)", marginBottom:7 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
              <span style={{ fontSize:8.5, fontWeight:800, color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em" }}>BEAT {b.n}</span>
              <span style={{ fontSize:7.5, fontWeight:700, padding:"1.5px 6px", borderRadius:99, background:`${b.ec}1e`, color:b.ec }}>{b.e}</span>
              <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(255,255,255,0.28)" }}>{b.dur}</span>
            </div>
            <div style={{ fontSize:10.5, fontWeight:600, color:"rgba(255,255,255,0.78)", marginBottom:2 }}>{b.l}</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.32)" }}>{b.cam}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExportPanel: React.FC<{ o: number }> = ({ o }) => {
  if (o < 0.01) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[10%] z-20 -translate-x-1/2"
      style={{ opacity:o, willChange:"opacity" }}>
      <div style={{ borderRadius:18, border:"1px solid rgba(181,123,255,0.22)", background:"rgba(1,2,8,0.92)", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", boxShadow:"0 0 64px rgba(181,123,255,0.20), 0 10px 56px rgba(0,0,0,0.88)", padding:"17px 28px", textAlign:"center", minWidth:248 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(255,255,255,0.34)", marginBottom:12 }}>Export ready</div>
        <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:14 }}>
          {[{l:"4K MP4",on:true},{l:"GIF",on:false},{l:"Share link",on:false}].map(f=>(
            <div key={f.l} style={{ padding:"6px 13px", borderRadius:9, background:f.on?"#B57BFF":"rgba(255,255,255,0.04)", fontSize:10, fontWeight:700, color:f.on?"#fff":"rgba(255,255,255,0.30)", boxShadow:f.on?"0 0 20px rgba(181,123,255,0.55)":"none" }}>{f.l}</div>
          ))}
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.80)", fontWeight:600, marginBottom:4 }}>Animation.mp4 · 3840 × 2160</div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.32)" }}>Rendered in 1 min 24 sec</div>
      </div>
    </div>
  );
};

const OpeningTitle: React.FC<{ o: number }> = ({ o }) => {
  if (o < 0.01) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center"
      style={{ opacity:o, transform:`scale(${lerp(1.06,1,o)})`, willChange:"opacity,transform" }}>
      <div className="absolute h-[52vmin] w-[52vmin] rounded-full" style={{ background:"radial-gradient(circle,rgba(1,2,8,0.95),transparent 70%)" }} />
      <div className="absolute h-[36vmin] w-[36vmin] rounded-full" style={{ border:"1px solid rgba(110,123,255,0.13)", boxShadow:"0 0 140px rgba(110,123,255,0.08),inset 0 0 140px rgba(110,123,255,0.04)" }} />
      <div className="relative mb-4 flex items-center gap-3">
        <span style={{ width:28, height:1, background:"rgba(110,123,255,0.36)", display:"inline-block" }} />
        <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.44em", textTransform:"uppercase", color:"rgba(110,123,255,0.76)" }}>Mapanisy Studio</span>
        <span style={{ width:28, height:1, background:"rgba(110,123,255,0.36)", display:"inline-block" }} />
      </div>
      <h2 className="relative" style={{
        fontFamily:SERIF, fontWeight:500,
        fontSize:"clamp(2.8rem,8vw,6.2rem)", lineHeight:1.01,
        letterSpacing:"-0.020em", color:"#fff",
        textShadow:"0 2px 80px rgba(0,0,0,0.99),0 0 120px rgba(70,110,210,0.28)",
      }}>
        Turn any story into<br />
        a{" "}
        <span style={{
          background:"linear-gradient(108deg,#9CA6FF 20%,#2fe0ff 80%)",
          WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent",
          filter:"drop-shadow(0 0 36px rgba(110,123,255,0.56))",
        }}>map animation</span>
      </h2>
      <p className="relative mx-auto mt-5 max-w-xs" style={{ fontSize:12, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.36em", color:"rgba(255,255,255,0.46)", textShadow:"0 1px 20px rgba(0,0,0,0.99)" }}>
        Describe · compose · share in minutes
      </p>
      <div className="relative mt-7 flex items-center gap-3" style={{ fontSize:11, color:"rgba(255,255,255,0.26)" }}>
        <Sparkles size={11} style={{ color:"rgba(110,123,255,0.62)" }} /><span>AI Director</span>
        <span style={{ opacity:.35 }}>·</span>
        <Globe size={11} style={{ color:"rgba(47,224,255,0.62)" }} /><span>Real 3D maps</span>
        <span style={{ opacity:.35 }}>·</span>
        <Film size={11} style={{ color:"rgba(181,123,255,0.62)" }} /><span>4K export</span>
      </div>
      <div className="relative mt-10 flex flex-col items-center">
        {[0,1,2].map(i => (
          <ChevronDown key={i} size={24} style={{ color:"rgba(47,224,255,0.44)", marginTop:i?-12:0, filter:"drop-shadow(0 0 9px #2fe0ff)", animation:`chevron-fade 1.9s ease-in-out ${i*0.22}s infinite` }} />
        ))}
      </div>
    </div>
  );
};

// ─── Nepal country label (DOM-updated each frame, no React re-render) ─────────

const NepalLabel = React.forwardRef<HTMLDivElement>((_, ref) => (
  <div
    ref={ref}
    className="pointer-events-none absolute z-20"
    style={{ display:"none", opacity:0, transform:"translate(-50%, -50%)" }}
  >
    <div style={{
      padding:"16px 28px 14px",
      borderRadius:18,
      background:"rgba(1,2,8,0.90)",
      backdropFilter:"blur(26px)",
      WebkitBackdropFilter:"blur(26px)",
      border:"1px solid rgba(255,50,70,0.32)",
      boxShadow:"0 0 80px rgba(200,20,40,0.28), 0 8px 64px rgba(0,0,0,0.92)",
      textAlign:"center",
      minWidth:180,
    }}>
      {/* Flag strip */}
      <div style={{ display:"flex", justifyContent:"center", gap:4, marginBottom:10 }}>
        {/* Nepal flag colours: blue border, red field, white crescent */}
        <div style={{ width:14, height:14, borderRadius:2, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ height:"55%", background:"#003778" }} />
          <div style={{ height:"45%", background:"#003778" }} />
        </div>
        <span style={{ fontSize:16 }}>🇳🇵</span>
      </div>
      <div style={{
        fontFamily:SERIF, fontSize:28, fontWeight:500,
        letterSpacing:"0.22em", color:"#fff",
        textShadow:"0 2px 24px rgba(0,0,0,0.96), 0 0 50px rgba(220,30,50,0.30)",
        marginBottom:4,
      }}>NEPAL</div>
      <div style={{ fontSize:9.5, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(255,80,96,0.72)", fontWeight:600 }}>
        South Asia · 147,181 km²
      </div>
    </div>
  </div>
));
NepalLabel.displayName = "NepalLabel";

// ─── Main component ───────────────────────────────────────────────────────────

export const FlyThroughMap: React.FC = () => {
  const sectionRef   = useRef<HTMLElement>(null);
  const mapRef       = useRef<MapRef>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const nepalLabelRef = useRef<HTMLDivElement>(null);

  const targetP  = useRef(0);
  const smoothP  = useRef(0);
  const prevT    = useRef(0);
  const velP     = useRef(0);
  const bankAng  = useRef(0);
  const lastBrg  = useRef(0);
  const lastTs   = useRef(0);

  const [p, setP]         = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [pingCycle, setPingCycle] = useState(0);

  // Stable map style — recomputed only if origin changes (never in practice)
  const origin   = typeof window !== "undefined" ? window.location.origin : "";
  const mapStyle = useMemo(() => buildMapStyle(origin) as any, [origin]);

  // ── Register Nepal hatch pattern on map load ──────────────────────────────
  const registerPattern = useCallback((map: any) => {
    if (!map || map._nepalHatchRegistered) return;
    map._nepalHatchRegistered = true;
    try {
      const size = 20;
      const canvas = document.createElement("canvas");
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(255,40,58,0.58)";
      ctx.lineWidth   = 1.6;
      ctx.beginPath();
      // Three parallel diagonals so the pattern tiles seamlessly
      ctx.moveTo(0, size); ctx.lineTo(size, 0);
      ctx.moveTo(-size, size); ctx.lineTo(size, -size);
      ctx.moveTo(size, 2*size); ctx.lineTo(2*size, size);
      ctx.stroke();
      const { data, width, height } = ctx.getImageData(0, 0, size, size);
      map.addImage("np-hatch", { width, height, data: new Uint8Array(data.buffer) });
    } catch {}
  }, []);

  // ── Pre-warm tiles + reveal map ───────────────────────────────────────────
  const onLoad = useCallback((e: any) => {
    const map = e.target as any;
    try { map.setMaxTileCacheSize?.(8192); } catch {}
    // 64 parallel tile fetches — default is 16; dramatically speeds up pre-warm
    try { map.setMaxParallelImageRequests?.(64); } catch {}
    registerPattern(map);

    // Poll until areTilesLoaded() OR deadline — whichever comes first.
    const waitTiles = (maxMs: number) => new Promise<void>(r => {
      const deadline = Date.now() + maxMs;
      const check = () => {
        if (map.areTilesLoaded?.() || Date.now() >= deadline) r();
        else setTimeout(check, 60);
      };
      check();
    });

    const prewarm = async () => {
      // Visit EVERY keyframe in animation order at its actual pitch + bearing.
      // This forces MapLibre to load the tiles visible from each viewing angle,
      // including the horizon background tiles that appear when pitch is 60°+.
      for (const frame of FRAMES) {
        try {
          map.jumpTo({
            center:  [frame.lng, frame.lat] as [number, number],
            zoom:    frame.zoom,
            pitch:   frame.pitch,
            bearing: frame.bearing,
          });
        } catch {}
        // High-zoom frames have the most tiles; give them more time.
        const ms = frame.zoom >= 11 ? 500 : frame.zoom >= 9 ? 380 : 280;
        await waitTiles(ms);
      }

      // Second pass: revisit the steepest-pitch / highest-zoom frames.
      // At pitch 60–66° the horizon tiles are a different z-level; a second
      // visit ensures those background tiles are fully cached.
      for (const frame of FRAMES.filter(f => f.zoom >= 11.5)) {
        try {
          map.jumpTo({
            center:  [frame.lng, frame.lat] as [number, number],
            zoom:    frame.zoom,
            pitch:   frame.pitch,
            bearing: frame.bearing,
          });
        } catch {}
        await waitTiles(500);
      }

      // Return to the animation start position and wait for it to settle
      try {
        map.jumpTo({
          center:  [FRAMES[0].lng, FRAMES[0].lat],
          zoom:    FRAMES[0].zoom,
          pitch:   FRAMES[0].pitch,
          bearing: FRAMES[0].bearing,
        });
      } catch {}
      await waitTiles(400);

      setLoaded(true);
    };

    let done = false;
    const start = () => { if (!done) { done = true; prewarm(); } };
    try { map.once("idle", start); } catch {}
    let n = 0;
    const poll = () => { if (done) return; n++; if (n > 60 || map.areTilesLoaded?.()) start(); else setTimeout(poll, 150); };
    poll();
  }, [registerPattern]);

  // ── Scroll tracking ───────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      const el = sectionRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      targetP.current = total > 0 ? clamp(Math.min(Math.max(-r.top, 0), total) / total) : 0;
    };
    window.addEventListener("scroll", fn, { passive:true });
    window.addEventListener("resize", fn, { passive:true });
    fn();
    return () => { window.removeEventListener("scroll", fn); window.removeEventListener("resize", fn); };
  }, []);

  // ── Route tip pulse ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setPingCycle(n => (n+1) % 60), 50);
    return () => clearInterval(t);
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    const tick = (ts: number) => {
      const dt = Math.min((ts - (lastTs.current || ts)) / 1000, 0.05);
      lastTs.current = ts;

      velP.current = velP.current * 0.82 + Math.abs(targetP.current - prevT.current) * 0.18;
      prevT.current = targetP.current;

      // Heavy adaptive damping — camera has real mass
      const rate = lerp(2.5, 4.5, clamp(velP.current / 0.007));
      smoothP.current += (targetP.current - smoothP.current) * (1 - Math.exp(-rate * dt));

      const cur = smoothP.current;
      setP(cur);

      const cam = getCam(cur);
      const m = mapRef.current?.getMap() as any;
      if (m) {
        try { m.jumpTo({ center:[cam.lng, cam.lat], zoom:cam.zoom, pitch:cam.pitch, bearing:cam.bearing }); } catch {}

        // Canvas banking
        let db = cam.bearing - lastBrg.current;
        if (db >  180) db -= 360;
        if (db < -180) db += 360;
        lastBrg.current = cam.bearing;
        const velBoost = clamp(velP.current / 0.007);
        bankAng.current += (clamp(db * 2.2 + velBoost * 2.2, -4, 4) - bankAng.current) * 0.07;

        // Map canvas opacity: fade OUT during zoom-out transition so loading tiles
        // are invisible; then fade back IN when the Nepal view is ready.
        const mapOp = cur < 0.61 ? 1
          : cur < 0.67 ? 1 - eio((cur - 0.61) / 0.06)
          : cur < 0.75 ? 0
          : cur < 0.83 ? eio((cur - 0.75) / 0.08)
          : 1;

        // Scale: minimum 1.08 so canvas edges NEVER show through during banking
        const bankScale = 1.08 + Math.abs(bankAng.current) / 4 * 0.09;
        if (wrapRef.current) {
          wrapRef.current.style.transform = `rotate(${bankAng.current.toFixed(3)}deg) scale(${bankScale.toFixed(3)})`;
          wrapRef.current.style.opacity   = mapOp.toFixed(3);
        }

        // Nepal label — project centre to screen, update DOM directly (no React render)
        const nIn  = eio(clamp((cur - 0.72) / 0.11));
        const nOut = eio(clamp(1 - (cur - 0.86) / 0.07));
        const nO   = nIn * nOut;
        const lbl  = nepalLabelRef.current;
        if (lbl) {
          if (nO > 0.01) {
            try {
              const pt = m.project(NEPAL_CENTER);
              lbl.style.display   = "block";
              lbl.style.opacity   = nO.toFixed(3);
              lbl.style.left      = `${pt.x}px`;
              lbl.style.top       = `${pt.y}px`;
            } catch { lbl.style.display = "none"; }
          } else {
            lbl.style.display = "none";
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  // ── Derived values ────────────────────────────────────────────────────────

  const titleO   = eio(clamp(1 - p / 0.065));
  const dissolve = clamp((p - 0.968) / 0.032);
  const barVh    = eo(clamp(p / 0.04)) * 4.5;

  // Route
  const routeT  = eio(clamp((p - 0.22) / 0.42));
  const routeOp = clamp(1 - (p - 0.60) / 0.10);
  const drawnPts = useMemo(() => sliceRoute(ROUTE, routeT), [routeT]);
  const routeGJ  = useMemo(() => ({ type:"FeatureCollection", features:[{type:"Feature", properties:{}, geometry:{type:"LineString", coordinates:drawnPts}}] } as any), [drawnPts]);

  const tipVisible = routeT > 0.02 && routeT < 0.97 && routeOp > 0.08;
  const tipPt      = drawnPts[drawnPts.length - 1] || ROUTE[0];
  const pingScale  = 1 + Math.sin((pingCycle / 60) * Math.PI * 2) * 0.55;

  // Nepal fill + glow — fade in as camera settles on full Nepal view
  const nepalIn  = eio(clamp((p - 0.76) / 0.08));
  const nepalOut = eio(clamp(1 - (p - 0.87) / 0.07));
  const nepalO   = nepalIn * nepalOut;

  // Nepal-red grade zone — small ambient tint during country reveal
  const gradeRed  = eio(clamp((p - 0.73) / 0.09)) * eio(clamp(1 - (p - 0.86) / 0.06));

  // HUD opacities
  const hudPrompt   = eio(clamp(tent(p, 0.14, 0.10) / 0.55));
  const hudDirector = eio(clamp(tent(p, 0.27, 0.11) / 0.55));
  const hudBeat     = eio(clamp(tent(p, 0.41, 0.10) / 0.55));
  const hudExport   = eio(clamp(tent(p, 0.91, 0.10) / 0.55));

  return (
    <section ref={sectionRef} id="how" style={{ height:"1000vh", position:"relative" }}>
      <style>{`
        @keyframes float-mote  { 0%,100%{transform:translateY(0) translateX(0);opacity:.16} 40%{opacity:.72} 50%{transform:translateY(-22px) translateX(8px)} }
        @keyframes chevron-fade{ 0%,100%{opacity:.14;transform:translateY(0)} 50%{opacity:.68;transform:translateY(7px)} }
        @keyframes hud-pulse   { 0%,100%{opacity:.40;box-shadow:0 0 6px #6E7BFF} 50%{opacity:1;box-shadow:0 0 18px #6E7BFF} }
      `}</style>

      <div className="sticky top-0 h-screen overflow-hidden bg-[#010208]">

        {/* ── Map canvas ────────────────────────────────────────────────── */}
        {/* overflow:hidden + extra size ensure banking never reveals background */}
        <div style={{ position:"absolute", inset:"-8%", overflow:"hidden" }}>
          <div ref={wrapRef} style={{ position:"absolute", inset:0, transformOrigin:"center center", willChange:"transform,opacity", backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden" }}>
            <Map
              ref={mapRef}
              initialViewState={{ longitude:FRAMES[0].lng, latitude:FRAMES[0].lat, zoom:FRAMES[0].zoom, pitch:FRAMES[0].pitch, bearing:FRAMES[0].bearing }}
              mapStyle={mapStyle}
              interactive={false}
              attributionControl={false}
              maxPitch={85}
              onLoad={onLoad}
              onError={() => {}}
              // Increase tile fetch concurrency at the renderer level (default 16)
              maxParallelImageRequests={64}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
            >
              {/* Route — triple glow stack */}
              {routeOp > 0.01 && (
                <Source id="route" type="geojson" data={routeGJ}>
                  <Layer id="route-halo"  type="line" paint={{"line-color":"#2fe0ff","line-width":52,"line-opacity":0.11*routeOp,"line-blur":34}} layout={{"line-cap":"round","line-join":"round"}} />
                  <Layer id="route-glow"  type="line" paint={{"line-color":"#6E7BFF","line-width":20,"line-opacity":0.40*routeOp,"line-blur":12}} layout={{"line-cap":"round","line-join":"round"}} />
                  <Layer id="route-body"  type="line" paint={{"line-color":"#aff5ff","line-width":4.5,"line-opacity":routeOp}} layout={{"line-cap":"round","line-join":"round"}} />
                  <Layer id="route-core"  type="line" paint={{"line-color":"#ffffff","line-width":1.4,"line-opacity":0.72*routeOp}} layout={{"line-cap":"round","line-join":"round"}} />
                </Source>
              )}

              {/* Route tip pulse */}
              {tipVisible && (
                <Marker longitude={tipPt[0]} latitude={tipPt[1]} anchor="center">
                  <div style={{ position:"relative", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ position:"absolute", width:26*pingScale, height:26*pingScale, borderRadius:"50%", border:"1.5px solid rgba(47,224,255,0.58)", opacity:1-(pingCycle/60) }} />
                    <div style={{ width:9, height:9, borderRadius:"50%", background:"#fff", boxShadow:"0 0 14px #2fe0ff, 0 0 30px rgba(47,224,255,0.55)" }} />
                  </div>
                </Marker>
              )}

              {/* Nepal country highlight — hatch pattern + glow + crisp border */}
              {nepalO > 0.005 && (
                <Source id="nepal" type="geojson" data={NEPAL_GJ}>
                  {/* Wide outer glow */}
                  <Layer id="nepal-glow-wide" type="line"
                    paint={{"line-color":"#c8001e","line-width":lerp(0,24,nepalIn),"line-blur":28,"line-opacity":0.38*nepalO}}
                    layout={{"line-cap":"round","line-join":"round"}} />
                  {/* Diagonal-hatch fill (registered in onLoad) */}
                  <Layer id="nepal-fill-hatch" type="fill"
                    paint={{"fill-pattern":"np-hatch","fill-opacity":0.62*nepalO}} />
                  {/* Solid tint underneath hatch for depth */}
                  <Layer id="nepal-fill-solid" type="fill"
                    paint={{"fill-color":"#6e0010","fill-opacity":0.28*nepalO}} />
                  {/* Inner glow line */}
                  <Layer id="nepal-glow-tight" type="line"
                    paint={{"line-color":"#ff1a32","line-width":lerp(0,8,nepalIn),"line-blur":6,"line-opacity":0.55*nepalO}}
                    layout={{"line-cap":"round","line-join":"round"}} />
                  {/* Sharp border */}
                  <Layer id="nepal-border" type="line"
                    paint={{"line-color":"#ff3448","line-width":lerp(0,2.8,nepalIn),"line-opacity":nepalO}}
                    layout={{"line-cap":"round","line-join":"round"}} />
                </Source>
              )}
            </Map>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            COLOUR GRADE — light paper-terrain treatment, 4 gentle layers.
            The map must stay clearly readable. No overlay/color blend modes.
        ══════════════════════════════════════════════════════════════════ */}

        {/* 1. Top fade — subtle sky gradient, dark only at the very top edge */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background:"linear-gradient(to bottom,rgba(8,14,56,0.38) 0%,rgba(5,10,28,0.08) 18%,transparent 36%)" }} />

        {/* 2. Bottom fade — gentle shadow so UI text at bottom stays legible */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background:"linear-gradient(to top,rgba(1,2,8,0.55) 0%,rgba(1,2,8,0.20) 18%,transparent 40%)" }} />

        {/* 3. Nepal red accent — fades in only during country reveal */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background:"radial-gradient(60% 50% at 50% 46%,rgba(200,10,28,0.10),transparent 70%)", opacity: gradeRed * 0.6 }} />

        {/* 4. Vignette — very light, just darkens the four corners slightly */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background:"radial-gradient(110% 95% at 50% 44%,transparent 38%,rgba(1,2,8,0.18) 62%,rgba(1,2,8,0.32) 100%)" }} />

        {/* Film grain */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.038] mix-blend-overlay" aria-hidden>
          <filter id="fg5"><feTurbulence type="fractalNoise" baseFrequency="0.90" numOctaves="2" stitchTiles="stitch"/></filter>
          <rect width="100%" height="100%" filter="url(#fg5)"/>
        </svg>

        {/* ── Orbital depth rings ── */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full z-[5]" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none">
          <ellipse cx="50%" cy="53%" rx="19%" ry="5.2%" fill="none" stroke="#6E7BFF" strokeWidth="0.060" strokeOpacity="0.22" strokeDasharray="1.8 4.5"/>
          <ellipse cx="50%" cy="51%" rx="31%" ry="8.0%" fill="none" stroke="#2fe0ff" strokeWidth="0.048" strokeOpacity="0.18" strokeDasharray="1.5 5.5"/>
          <ellipse cx="50%" cy="55%" rx="43%" ry="10.8%" fill="none" stroke="#B57BFF" strokeWidth="0.038" strokeOpacity="0.14" strokeDasharray="1.2 6.5"/>
        </svg>

        {/* ── Particles ── */}
        <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
          {MOTES.map((m,i) => (
            <span key={i} className="absolute rounded-full"
              style={{ left:`${m.l}%`, top:`${m.t}%`, width:m.sz, height:m.sz, background:m.c, boxShadow:`0 0 ${m.sz*2.5}px ${m.c}`, animation:`float-mote ${m.d}s ease-in-out ${m.dl}s infinite` }} />
          ))}
        </div>

        {/* ── Letterbox bars ── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-[#010208]" style={{ height:`${barVh}vh` }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[#010208]" style={{ height:`${barVh}vh` }} />

        {/* ── End dissolve ── */}
        <div className="pointer-events-none absolute inset-0 z-30 bg-[#010208]" style={{ opacity:dissolve }} />

        {/* ── Story content ── */}
        <OpeningTitle o={titleO} />
        {BEATS.map((beat,i) => <CaptionCard key={i} beat={beat} p={p} />)}
        <PromptPanel   o={hudPrompt}   />
        <DirectorPanel o={hudDirector} />
        <BeatCard      o={hudBeat}     />
        <ExportPanel   o={hudExport}   />

        {/* Nepal label — position updated via DOM ref in rAF loop */}
        <NepalLabel ref={nepalLabelRef} />

        {/* ── Progress bar ── */}
        <div className="pointer-events-none absolute bottom-[3.8vh] left-1/2 z-20 -translate-x-1/2 overflow-hidden rounded-full"
          style={{ width:140, height:1.5, background:"rgba(255,255,255,0.06)" }}>
          <div style={{ height:"100%", width:`${p*100}%`, background:"linear-gradient(90deg,#6E7BFF,#2fe0ff)", boxShadow:"0 0 12px rgba(110,123,255,0.60)", borderRadius:9999 }} />
        </div>

        {/* ── Loading screen ── */}
        {!loaded && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#010208]">
            <div className="h-5 w-5 rounded-full border-2 border-white/8 border-t-iris animate-spin" />
            <span style={{ fontSize:9, letterSpacing:"0.34em", textTransform:"uppercase", color:"rgba(255,255,255,0.22)" }}>Preparing terrain…</span>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2 right-3 z-10" style={{ fontSize:8.5, color:"rgba(255,255,255,0.18)" }}>
          © Esri, Maxar · Terrain © AWS
        </div>
      </div>
    </section>
  );
};
