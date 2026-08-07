"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Sparkles, Upload, Loader2 } from "lucide-react";
import { useEditor } from "@/v2/store/editor";
import { parseTrackFile, buildTrackProject } from "@/v2/track";
import { interpret } from "@/lib/parse";
import type { Interpretation } from "@/lib/parse/intent";
import { AiIdeaBox } from "./AiIdeaBox";
import { StoryLens } from "./StoryLens";
import { InspirationRail } from "./InspirationRail";
import { LiveStoryMap, flavorForPrompt } from "./LiveStoryMap";
import { coordsFor, geocodeStop, cachedStop, isLikelyPlaceName, type GeoStop } from "./worldCoords";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/** Style add-on chips — one click folds craft into the prompt, no menus. */
const SUGGESTIONS = [
  "cinematic zooms", "flight animation", "documentary style", "smooth camera movement",
  "vintage atlas", "satellite map", "National Geographic style", "minimal design", "golden hour mood",
];

/**
 * The Generate experience — an immersive creative canvas with ONE job:
 * “Tell us your story, we’ll animate it.”
 *
 *   · a real MapLibre world fills the screen, alive with drifting flights
 *   · the glass prompt floats center stage, cursor already blinking
 *   · every keystroke runs the intent engine: places bloom on the map, the
 *     journey chains up in the StoryLens, richness dots fill toward Cinematic
 *   · suggestion chips fold style words into the prompt in place
 *   · the inspiration rail sketches routes on hover, fills the prompt on click
 *   · drop a GPX/KML/GeoJSON anywhere on the page — instant flythrough import
 *   · hitting Generate dives the camera toward the first destination while the
 *     director takes over — creation starts before the editor opens
 */
export const GenerateExperience: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const [prompt, setPrompt] = useState("");
  // Home is film-first: every idea becomes a cinematic map animation. Extracting
  // a high-res still is a one-button action inside the editor (the "Snapshot"
  // button), so the home page stays a single, focused "describe your film" flow.
  const [hoverStops, setHoverStops] = useState<GeoStop[] | null>(null);
  const [generating, setGenerating] = useState(false);
  /* ARRIVAL — the once-per-session "yes, I'm in" reveal right after sign-in:
     glowing prompt first, then the map blooms in with a 3D fly-down, then the
     rest of the page rises staggered. useLayoutEffect flips the flag BEFORE
     first paint, so there's no flash and no SSR hydration mismatch. */
  const [arrival, setArrival] = useState(false);
  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem("mapanisy-arrival") !== "1") {
        sessionStorage.setItem("mapanisy-arrival", "1");
        setArrival(true);
      }
    } catch { /* private mode — skip the choreography */ }
  }, []);
  const [dragOver, setDragOver] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  // Re-entrancy guard for the page-wide drop. `dropBusy` state can't be read
  // inside the drop closure (it captures the first-render value), so a ref is
  // the source of truth that a second drop mid-parse can't race past.
  const dropBusyRef = useRef(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [geoTick, setGeoTick] = useState(0); // re-render when async geocodes land

  /* ── Live understanding: the intent engine on every keystroke ────────────── */
  const it: Interpretation | null = useMemo(() => {
    const t = prompt.trim();
    if (t.length < 2) return null;
    try { return interpret(t); } catch { return null; }
  }, [prompt]);

  /** Names in story order (route beats bag-of-locations) — VERIFIED only:
   *  known gazetteer places pass straight through; anything else must read as
   *  a proper noun in the prompt ("Reykjavik", not "playful") to even be
   *  considered, and then must geocode to a real geographic type. */
  const placeNames = useMemo(() => {
    if (!it) return [] as string[];
    const raw = it.route ? [it.route.from, ...it.route.via, it.route.to] : it.locations.slice(0, 6);
    return raw.filter((n) => coordsFor(n) || isLikelyPlaceName(n, prompt));
  }, [it, prompt]);

  /* Resolve to coords: instant table first, async geocode for the unknown. */
  const stops = useMemo(() => {
    void geoTick; // re-resolve when a geocode result lands
    return placeNames
      .map((n) => coordsFor(n) ?? cachedStop(n) ?? null)
      .filter(Boolean) as GeoStop[];
  }, [placeNames, geoTick]);

  /* Preview flavor — same engine as the landing hero, so "highlight France"
     fills the real country and "sailing to Athens" hugs the water here too. */
  const flavor = useMemo(() => flavorForPrompt(prompt, it?.action), [prompt, it]);

  useEffect(() => {
    const missing = placeNames.filter((n) => !coordsFor(n) && cachedStop(n) === undefined).slice(0, 2);
    if (!missing.length) return;
    const t = setTimeout(() => {
      Promise.all(missing.map((n) => geocodeStop(n))).then((rs) => {
        if (rs.some(Boolean)) setGeoTick((n) => n + 1);
      });
    }, 700); // wait for the word to be finished
    return () => clearTimeout(t);
  }, [placeNames]);

  /* ── Suggestion chips: fold craft into the prompt in place ───────────────── */
  const addSuggestion = (s: string) => {
    const base = prompt.trim().replace(/[,.\s]+$/, "");
    const next = base ? `${base}, ${s}` : `${s[0].toUpperCase()}${s.slice(1)}: `;
    window.dispatchEvent(new CustomEvent("mapanisy-seed", { detail: next }));
  };
  const pickInspiration = (p: string) => {
    window.dispatchEvent(new CustomEvent("mapanisy-seed", { detail: p }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Page-wide smart drop: GPX / TCX / KML / GeoJSON → instant flythrough ── */
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++; setDragOver(true);
    };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragOver(false); };
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const TRACK_EXT = ["gpx", "tcx", "kml", "kmz", "geojson", "json", "fit"];
    const failDrop = (msg: string) => {
      setDropError(msg);
      setTimeout(() => setDropError(null), 5000);
    };
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      depth = 0; setDragOver(false);
      if (dropBusyRef.current) return;          // already parsing a file
      const f = e.dataTransfer.files[0];
      // Fail fast on the wrong file BEFORE reading it into memory — a dropped
      // video/photo would otherwise decode entirely and freeze the tab behind
      // the "Reading your route…" modal with no way out.
      const ext = f.name.toLowerCase().split(".").pop() ?? "";
      if (!TRACK_EXT.includes(ext)) { failDrop("That's not a route file — GPX, TCX, KML, KMZ or GeoJSON work best."); return; }
      if (f.size > 25 * 1024 * 1024) { failDrop("That file is too large — GPS routes are usually well under 25 MB."); return; }
      dropBusyRef.current = true;
      setDropBusy(true); setDropError(null);
      try {
        const { track } = await parseTrackFile(f);
        const proj = buildTrackProject(track, f.name, "overview-draw", "vox-dark");
        load(proj);
        router.push("/studio2");            // navigating away — leave the lock set
      } catch (err: any) {
        dropBusyRef.current = false;
        setDropBusy(false);
        failDrop(err?.message || "Couldn't read that file — GPX, TCX, KML or GeoJSON work best.");
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [load, router]);

  return (
    <div className="relative overflow-hidden bg-[#04060f]" style={{ minHeight: "100svh" }}>
      <style>{`
        @keyframes genRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        /* Users who ask for no motion get the final composition instantly — the
           inline entrance/reveal animations are neutralised (they leave the
           element in its settled, fully-visible state). */
        @media (prefers-reduced-motion: reduce) { .rm-anim { animation: none !important; } }
        /* ── ARRIVAL — the once-per-session "yes, I'm in" reveal ──────────
           1. the glowing prompt blooms out of the dark
           2. the living 3D map fades up behind it, flying down to the world
           3. the rest of the page rises in, staggered                      */
        @keyframes arrPrompt {
          0%   { opacity: 0; transform: translateY(26px) scale(0.94); box-shadow: 0 0 0 1px rgba(110,123,255,0), 0 0 0 rgba(110,123,255,0); }
          45%  { opacity: 1; transform: translateY(0) scale(1.015); box-shadow: 0 0 0 1px rgba(110,123,255,0.55), 0 0 120px rgba(110,123,255,0.5), 0 24px 80px rgba(0,0,0,0.6); }
          100% { opacity: 1; transform: none; box-shadow: 0 0 0 1px rgba(110,123,255,0.22), 0 0 48px rgba(110,123,255,0.16), 0 24px 80px rgba(0,0,0,0.6); }
        }
        @keyframes arrMap { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* ── The living map — on arrival it blooms in behind the prompt while
             the camera flies down from a tilted 3D close-up to the world ── */}
      <div className="rm-anim" style={arrival ? { animation: "arrMap 1.8s ease 0.9s both" } : undefined}>
        <LiveStoryMap stops={stops} hoverStops={hoverStops} generating={generating} flavor={flavor} introFly={arrival} />
      </div>

      {/* ── Top nav (over the map) ── */}
      <header className="rm-anim relative z-20 mx-auto flex max-w-5xl items-center justify-between px-6 pt-6" style={{ animation: "genRise 0.6s ease both", animationDelay: arrival ? "2.1s" : "0s" }}>
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-iris shadow-[0_0_12px_rgba(110,123,255,0.6)]">
            <MapPin size={10} strokeWidth={2.5} color="white" />
          </div>
          <span className="text-[13px] font-semibold text-white/90">Mapanisy</span>
          <span className="ml-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Studio</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/studio2?blank=1" className="text-[12px] font-medium text-white/45 transition-colors hover:text-white/85">Blank map</Link>
          <Link href="/brand" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/60 backdrop-blur transition-all hover:border-iris/50 hover:text-white">
            <Sparkles size={11} className="text-iris" /> Brand kit
          </Link>
        </div>
      </header>

      {/* ── Center stage ── */}
      <div className="relative z-20 mx-auto flex max-w-3xl flex-col justify-center px-6 pb-8 pt-[7vh]" style={{ minHeight: "calc(100svh - 180px)" }}>
        {/* Kicker + headline — quiet, the prompt is the hero */}
        <div className="rm-anim mb-6 text-center" style={{ animation: "genRise 0.7s ease both", animationDelay: arrival ? "1.75s" : "80ms" }}>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-iris/30 bg-white/[0.05] px-4 py-1.5 backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-iris opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-iris" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#aab4ff]">AI Map Animation Studio</span>
          </div>
          <h1 className="text-[clamp(1.9rem,4.2vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.02em] text-white" style={{ fontFamily: SERIF }}>
            Tell us your story.{" "}
            <span
              style={{
                background: "linear-gradient(108deg, #9CA6FF 10%, #2FE0FF 55%, #B57BFF 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 0 28px rgba(110,123,255,0.4))",
              }}
            >
              We&rsquo;ll animate it.
            </span>
          </h1>
        </div>

        {/* The floating glass prompt — the FIRST thing to appear on arrival,
            blooming with a glow before the map even fades in */}
        <div className="rm-anim rounded-2xl" style={arrival
          ? { animation: "arrPrompt 1.4s cubic-bezier(.3,1.1,.4,1) 0.25s both" }
          : { animation: "genRise 0.8s ease both", animationDelay: "160ms" }}>
          <AiIdeaBox
            darkMode
            onPromptChange={setPrompt}
            onGenerateStart={() => setGenerating(true)}
            onGenerateEnd={() => setGenerating(false)}
          />
        </div>

        {/* Live understanding: journey + richness (the map reacts behind) */}
        <StoryLens text={prompt} it={it} journey={placeNames} />

        {/* Suggestion chips — style, no settings menus */}
        <div className="rm-anim mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-1.5" style={{ animation: "genRise 0.8s ease both", animationDelay: "280ms" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => addSuggestion(s)}
              className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-white/45 backdrop-blur transition-all hover:border-iris/50 hover:bg-iris/10 hover:text-white/85"
              title={`Add “${s}” to your prompt`}
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Inspiration rail — pinned to the lower edge ── */}
      <div className="rm-anim relative z-20 mx-auto max-w-6xl px-6 pb-6" style={{ animation: "genRise 0.9s ease both", animationDelay: "380ms" }}>
        <div className="mb-2 flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.3em] text-white/30">
          <span className="h-px w-8 bg-white/15" /> Need a spark? Hover to preview
        </div>
        <InspirationRail onHover={setHoverStops} onPick={pickInspiration} />
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10.5px] text-white/28">
          <Upload size={11} /> or drop a GPX · KML · GeoJSON anywhere on this page
        </div>
      </div>

      {/* Settle into the content surface below — one continuous dark canvas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16" style={{ background: "linear-gradient(to bottom, transparent, #070a14)" }} />

      {/* ── Drag & drop overlay ── */}
      {(dragOver || dropBusy) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(4,6,16,0.72)", backdropFilter: "blur(10px)" }}>
          <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-iris/60 bg-white/[0.05] px-14 py-12 text-center" style={{ animation: "genRise 0.3s ease both", boxShadow: "0 0 90px rgba(110,123,255,0.3)" }}>
            {dropBusy
              ? <Loader2 size={34} className="animate-spin text-iris" />
              : <Upload size={34} className="text-iris" style={{ filter: "drop-shadow(0 0 14px rgba(110,123,255,0.7))" }} />}
            <div>
              <div className="text-[17px] font-semibold text-white" style={{ fontFamily: SERIF }}>
                {dropBusy ? "Reading your route…" : "Drop it — I'll animate the route"}
              </div>
              <div className="mt-1 text-[12px] text-white/45">GPX · TCX · KML · GeoJSON — parsed on your device, straight into a flythrough</div>
            </div>
          </div>
        </div>
      )}
      {dropError && (
        <div className="fixed bottom-6 left-1/2 z-[210] -translate-x-1/2 rounded-xl border border-red-400/30 bg-[#1a0b10]/95 px-4 py-2.5 text-[12px] text-red-300 backdrop-blur" style={{ animation: "genRise 0.3s ease both" }}>
          {dropError}
        </div>
      )}
    </div>
  );
};
