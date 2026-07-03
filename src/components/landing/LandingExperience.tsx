"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Map, { type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_STYLE = "mapbox://styles/michaandguadi/cmn4izmw2000201sl57y7aw5p";

const CAM_START = { lng: 80,    lat: 42,   zoom: 2.1, pitch:  0, bearing:  0 };
const CAM_END   = { lng: 126.6, lat: 45.8, zoom: 11,  pitch: 62, bearing: 26 };

// ─── palette ─────────────────────────────────────────────────────────────────
const GOLD    = "#f59e0b";
const BG      = "#0a0906";
const CARD_BG = "#111008";
const CREAM   = "#fef3c7";
const BORDER  = "rgba(245,158,11,0.10)";
const BLIGHT  = "rgba(245,158,11,0.38)";
const SANS    = "'Hanken Grotesk', system-ui, sans-serif";
const HEAD    = "'Montserrat', system-ui, sans-serif";

// ─── math ─────────────────────────────────────────────────────────────────────
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease  = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ─── data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: "🗺", title: "Map Studio",    desc: "Fly-to routes, city zooms, region highlights, cinematic pushes — driven by a live Mapbox map. Any geography on Earth, animated in seconds." },
  { icon: "📊", title: "Data Viz",      desc: "Animated choropleth maps, bubble charts, and weighted flow lines. The kind of overlays you see in NYT and Vox explainers — no code required." },
  { icon: "🎨", title: "Brand Presets", desc: "Set your colors, fonts, and map style once. Every scene you generate automatically inherits your brand with zero extra work." },
  { icon: "🎞", title: "4K Export",     desc: "Renders to broadcast-quality MP4 via Remotion. FCPXML for Final Cut Pro, DaVinci Resolve-compatible, or share a public live-preview link." },
  { icon: "▶",  title: "Live Preview",  desc: "Scrub the timeline, tweak camera angles, and adjust overlays — all in real time before you commit to a render. What you see is what you export." },
  { icon: "✨", title: "Free to Start", desc: "Every feature is unlocked on the free plan. Exported videos carry a small watermark — upgrade to remove it and unlock cloud rendering." },
];

type BillingPeriod = "monthly" | "yearly" | "lifetime";
const PRO_PRICE: Record<BillingPeriod, { price: string; suffix: string; note?: string }> = {
  monthly:  { price: "€9",   suffix: "/month" },
  yearly:   { price: "€79",  suffix: "/year",   note: "Save 27% vs monthly" },
  lifetime: { price: "€149", suffix: " once",   note: "Pay once. Use forever. No subscriptions." },
};

const FAQ_DATA: { q: string; a: string }[] = [
  {
    q: "How do I animate a map for YouTube?",
    a: "With Prompt Studio, describe your story or paste a script and the AI Director builds camera moves, route animations, and timing automatically. Animate a route between any two cities, fly into a location cinematically, or highlight an entire country — then export 4K MP4 ready for your YouTube edit. No After Effects needed.",
  },
  {
    q: "What is the best free map animation tool for YouTube creators?",
    a: "Prompt Studio's free plan unlocks every feature — animate routes, fly to cities, highlight regions, and export MP4. The free plan adds a small 'Made with Prompt Studio' watermark that you can remove by upgrading. It's the most fully-featured free documentary map animation tool available.",
  },
  {
    q: "Can I make Vox-style or Johnny Harris-style map animations without After Effects?",
    a: "Yes — that's exactly what Prompt Studio is built for. You get the cinematic fly-throughs, smooth city zooms, country highlight fills, and animated routes that define the Vox and Johnny Harris aesthetic, without touching After Effects, plugins, or motion design software.",
  },
  {
    q: "How do documentary makers animate maps?",
    a: "Traditionally, teams used After Effects with expensive plugins — a process that took hours per map shot. Prompt Studio replaces that entirely: describe your story, choose a camera style, and export 4K footage in minutes. The AI Director handles camera timing, route drawing, and geographic framing automatically.",
  },
  {
    q: "What is a Johnny Harris-style map animation?",
    a: "It's the signature look of documentary YouTube — smooth fly-throughs of real-world satellite imagery, animated route lines, dramatic country reveals, and a dark cinematic grade. Prompt Studio is specifically designed to produce this look, powered by live Mapbox maps and Remotion rendering.",
  },
  {
    q: "Can I animate maps for travel video content?",
    a: "Absolutely. Import a GPX track from your hike, cycle, or road trip and watch it animate on a cinematic map. Or describe a travel route in plain text — 'from Vienna to Istanbul by train' — and the AI Director builds the animation. Export in any aspect ratio for YouTube, Shorts, or Reels.",
  },
  {
    q: "What video formats does Prompt Studio export to?",
    a: "Prompt Studio exports to 4K MP4 (H.264) via Remotion, FCPXML for Final Cut Pro, and DaVinci Resolve-compatible formats. You can also export animated GIFs or share a public live-preview link. Cloud rendering is available on pay-as-you-go and Pro plans.",
  },
  {
    q: "How long does it take to make a map animation?",
    a: "Most animations are ready to preview in under 60 seconds. Rendering to 4K MP4 takes 1–4 minutes depending on length. Compare that to the 2–4 hours a motion designer spends in After Effects for the same result.",
  },
];

// ─── main component ───────────────────────────────────────────────────────────

export function LandingExperience({ signedIn = false }: { signedIn?: boolean }) {
  const mapRef      = useRef<MapRef>(null);
  const heroRef     = useRef<HTMLElement>(null);
  const rafRef      = useRef<number | null>(null);
  const progressRef = useRef(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [billing, setBilling] = useState<BillingPeriod>("lifetime");

  const applyCamera = useCallback((progress: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const e = ease(progress);
    map.jumpTo({
      center:  [lerp(CAM_START.lng, CAM_END.lng, e), lerp(CAM_START.lat, CAM_END.lat, e)],
      zoom:    lerp(CAM_START.zoom, CAM_END.zoom, e),
      pitch:   lerp(CAM_START.pitch, CAM_END.pitch, e),
      bearing: lerp(CAM_START.bearing, CAM_END.bearing, e),
    });
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const hero = heroRef.current;
      if (!hero) return;
      const total = hero.offsetHeight - window.innerHeight;
      progressRef.current = clamp(total > 0 ? window.scrollY / total : 0);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = progressRef.current;
        setScrollProgress(p);
        applyCamera(p);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyCamera]);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      (map as any).setFog({
        color: "rgb(18,13,8)", "high-color": "rgb(55,36,8)",
        "horizon-blend": 0.04, "space-color": "rgb(5,3,1)", "star-intensity": 0.38,
      });
    } catch { /* style may not support fog */ }
    const hero = heroRef.current;
    if (hero) {
      const total = hero.offsetHeight - window.innerHeight;
      applyCamera(clamp(total > 0 ? window.scrollY / total : 0));
    }
  }, [applyCamera]);

  const textOpacity  = clamp((scrollProgress - 0.52) / 0.38);
  const scrollHintOp = clamp(1 - scrollProgress / 0.18);

  return (
    <div style={{ background: BG, color: CREAM, minHeight: "100vh", fontFamily: SANS }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 40px",
        background: "rgba(10,9,6,0.82)", backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)", borderBottom: "1px solid rgba(245,158,11,0.10)",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: CREAM }}>Prompt Studio</div>
        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {[["Features","#features"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l,h]) => (
            <a key={l} href={h} style={{ fontSize: 13, color: "rgba(254,243,199,0.42)", textDecoration: "none" }}
              aria-label={`Navigate to ${l} section`}>{l}</a>
          ))}
          {signedIn ? (
            <Link href="/home"
              style={{ fontSize: 13, fontWeight: 700, color: "#1a0c00", textDecoration: "none", padding: "9px 20px", background: GOLD }}
              aria-label="Open the studio">
              Open studio →
            </Link>
          ) : (
            <>
              <Link href="/sign-in" style={{ fontSize: 13, color: "rgba(254,243,199,0.42)", textDecoration: "none" }}>Sign in</Link>
              <Link href="/sign-up"
                style={{ fontSize: 13, fontWeight: 700, color: "#1a0c00", textDecoration: "none", padding: "9px 20px", background: GOLD }}
                aria-label="Start free account">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ── Hero — 300vh sticky scroll-driven fly-through ─────────────────────── */}
      <section ref={heroRef} aria-label="Hero map animation" style={{ height: "300vh", position: "relative" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
          <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={MAPBOX_STYLE}
            projection={{ name: "globe" } as any}
            antialias
            initialViewState={{ longitude: CAM_START.lng, latitude: CAM_START.lat, zoom: CAM_START.zoom, pitch: CAM_START.pitch, bearing: CAM_START.bearing }}
            style={{ width: "100%", height: "100%" }}
            scrollZoom={false} dragPan={false} dragRotate={false}
            doubleClickZoom={false} touchZoomRotate={false} keyboard={false}
            attributionControl={false} onLoad={handleMapLoad}
          />
          {/* Warm vignette */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(130% 95% at 50% 38%, rgba(10,9,6,0.04) 20%, rgba(10,9,6,0.72) 100%)" }} />
          <div style={{ position: "absolute", inset: "auto 0 0 0", height: 130, pointerEvents: "none", background: `linear-gradient(to bottom, transparent, ${BG})` }} />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(120,70,8,0.10), transparent 70%)" }} />

          {/* Scroll hint */}
          {scrollHintOp > 0.01 && (
            <div style={{ position: "absolute", bottom: 52, left: "50%", transform: "translateX(-50%)", opacity: scrollHintOp, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(245,158,11,0.72)" }}>Scroll to explore</span>
              <svg width="16" height="24" viewBox="0 0 16 24" fill="none" aria-hidden style={{ animation: "nudge 1.6s ease-in-out infinite" }}>
                <path d="M8 4v16M8 20l-4-4M8 20l4-4" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
              </svg>
              <style>{`@keyframes nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}`}</style>
            </div>
          )}

          {/* Headline — fades in with scroll */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px",
            pointerEvents: textOpacity > 0.5 ? "auto" : "none",
            opacity: textOpacity, transform: `translateY(${lerp(20, 0, textOpacity)}px)`,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.38em", textTransform: "uppercase", color: GOLD, marginBottom: 22, textShadow: "0 0 30px rgba(245,158,11,0.55)" }}>
              Documentary-grade map animations
            </p>
            <h1 style={{ fontSize: "clamp(2.5rem,6vw,5rem)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.03em", margin: "0 0 18px", maxWidth: 860, color: CREAM, fontFamily: HEAD, textShadow: "0 2px 60px rgba(0,0,0,0.95)" }}>
              Make documentary-quality<br />map animations. No After Effects.
            </h1>
            <p style={{ fontSize: "clamp(1rem,1.8vw,1.15rem)", color: "rgba(254,243,199,0.58)", fontWeight: 400, margin: "0 0 44px", maxWidth: 440, textShadow: "0 1px 20px rgba(0,0,0,0.95)" }}>
              Used by travel YouTubers, journalists, and documentary makers.
            </p>
            <Link href="/sign-up" aria-label="Start free — no credit card required"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, background: GOLD, color: "#1a0c00", textDecoration: "none", padding: "17px 40px", fontSize: 15, fontWeight: 800, letterSpacing: "0.01em", boxShadow: "0 0 48px rgba(245,158,11,0.45), 0 8px 32px rgba(0,0,0,0.55)" }}>
              Start free — no credit card <span style={{ fontSize: 18, lineHeight: 1 }}>→</span>
            </Link>
          </div>
          <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: "rgba(254,243,199,0.20)", pointerEvents: "none" }}>
            © Mapbox © OpenStreetMap
          </div>
        </div>
      </section>

      {/* ── Social proof bar ─────────────────────────────────────────────────── */}
      <section aria-label="Compatibility" style={{ borderTop: "1px solid rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.08)", padding: "18px 40px", background: CARD_BG }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(20px,4vw,56px)", flexWrap: "wrap" }}>
          {[
            { icon: "🎬", label: "Renders via Remotion" },
            { icon: "🎞", label: "Final Cut Pro ready" },
            { icon: "🎥", label: "DaVinci Resolve compatible" },
            { icon: "📺", label: "4K MP4 export" },
            { icon: "🌍", label: "Real Mapbox satellite" },
          ].map(({ icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(254,243,199,0.38)", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem / Solution ────────────────────────────────────────────────── */}
      <section aria-labelledby="problem-solution-heading" style={{ padding: "100px 48px", background: BG }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.36em", textTransform: "uppercase", color: GOLD, textAlign: "center", marginBottom: 14 }}>Why Prompt Studio</p>
          <h2 id="problem-solution-heading" style={{ fontSize: "clamp(1.9rem,3.5vw,2.9rem)", fontWeight: 800, textAlign: "center", letterSpacing: "-0.03em", marginBottom: 64, fontFamily: HEAD, lineHeight: 1.1, color: CREAM }}>
            The old way takes days.<br />Ours takes minutes.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* OLD WAY */}
            <div style={{ background: CARD_BG, border: BORDER, borderColor: "rgba(255,255,255,0.06)", padding: "40px 36px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(254,243,199,0.28)", marginBottom: 20 }}>The old way — After Effects</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "2–4 hours per map animation",
                  "Motion Bro, Video Copilot, and plugin soup",
                  "Expensive software subscription (~$60/month)",
                  "Motion design skills required",
                  "Re-export everything to change one color",
                  "No live preview — render to see result",
                ].map((t) => (
                  <li key={t} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "rgba(254,243,199,0.40)", lineHeight: 1.5 }}>
                    <span style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }}>✗</span>{t}
                  </li>
                ))}
              </ul>
            </div>
            {/* NEW WAY */}
            <div style={{ background: CARD_BG, border: `1px solid ${BLIGHT}`, padding: "40px 36px", boxShadow: "0 0 48px rgba(245,158,11,0.06)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 20 }}>The Prompt Studio way</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Animation ready in under 60 seconds",
                  "Describe your story in plain language",
                  "Free to start, no software to install",
                  "Zero motion design experience required",
                  "Live preview — tweak before you render",
                  "4K MP4, FCPXML, DaVinci export",
                ].map((t) => (
                  <li key={t} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "rgba(254,243,199,0.70)", lineHeight: 1.5 }}>
                    <span style={{ color: GOLD, flexShrink: 0, marginTop: 1 }}>✓</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section id="features" aria-labelledby="features-heading" style={{ background: CARD_BG, padding: "100px 48px 96px", borderTop: "1px solid rgba(245,158,11,0.08)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.36em", textTransform: "uppercase", color: GOLD, textAlign: "center", marginBottom: 14 }}>Capabilities</p>
          <h2 id="features-heading" style={{ fontSize: "clamp(1.9rem,3.5vw,2.9rem)", fontWeight: 800, textAlign: "center", letterSpacing: "-0.03em", marginBottom: 64, fontFamily: HEAD, lineHeight: 1.1, color: CREAM }}>
            Everything a motion designer does.<br />Without the learning curve.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────────── */}
      <section id="pricing" aria-labelledby="pricing-heading" style={{ background: BG, padding: "100px 48px 96px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.36em", textTransform: "uppercase", color: GOLD, textAlign: "center", marginBottom: 14 }}>Pricing</p>
          <h2 id="pricing-heading" style={{ fontSize: "clamp(1.9rem,3.5vw,2.9rem)", fontWeight: 800, textAlign: "center", letterSpacing: "-0.03em", marginBottom: 12, fontFamily: HEAD, lineHeight: 1.1, color: CREAM }}>
            Simple, honest pricing.
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(254,243,199,0.42)", marginBottom: 44 }}>
            Start free, pay only when you need more.
          </p>

          {/* Billing toggle */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 52 }}>
            <div style={{ display: "flex", background: CARD_BG, border: BORDER, padding: 4, gap: 0 }} role="group" aria-label="Select billing period">
              {(["monthly","yearly","lifetime"] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)} aria-pressed={billing === b}
                  style={{ padding: "9px 22px", fontSize: 13, fontWeight: 600, background: billing === b ? GOLD : "transparent", color: billing === b ? "#1a0c00" : "rgba(254,243,199,0.45)", border: "none", cursor: "pointer", transition: "background 0.15s, color 0.15s", fontFamily: SANS }}>
                  {b === "monthly" ? "Monthly" : b === "yearly" ? "Yearly" : "Lifetime"}
                  {b === "yearly" && billing === "yearly" && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.75 }}>−27%</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>

            {/* Free */}
            <div style={{ background: CARD_BG, border: BORDER, padding: "36px 32px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(254,243,199,0.38)", marginBottom: 16 }}>Free</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: "2.8rem", fontWeight: 800, color: CREAM, fontFamily: HEAD, lineHeight: 1 }}>€0</span>
                <span style={{ fontSize: 14, color: "rgba(254,243,199,0.38)" }}>/month</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", marginBottom: 28, lineHeight: 1.5 }}>All features unlocked. Watermark on exports.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {["All animation types", "Local Remotion rendering", "Live preview", "Public share links", "Community support"].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(254,243,199,0.58)" }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
                <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(254,243,199,0.30)" }}>
                  <span style={{ color: "rgba(254,243,199,0.22)", flexShrink: 0 }}>✗</span>Watermark on exported video
                </li>
              </ul>
              <p style={{ fontSize: 11, color: "rgba(254,243,199,0.25)", marginBottom: 20, lineHeight: 1.5 }}>Watermark reads "Made with Prompt Studio" — upgrade anytime to remove.</p>
              <Link href="/sign-up" style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(245,158,11,0.22)", color: "rgba(254,243,199,0.65)", textDecoration: "none", padding: "13px 24px", fontSize: 14, fontWeight: 700, transition: "border-color 0.15s" }}>
                Start free
              </Link>
            </div>

            {/* Pay as you go */}
            <div style={{ background: CARD_BG, border: BORDER, padding: "36px 32px", display: "flex", flexDirection: "column", position: "relative" }}>
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: CARD_BG, border: "1px solid rgba(245,158,11,0.30)", padding: "4px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, whiteSpace: "nowrap" }}>
                Most flexible
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(254,243,199,0.38)", marginBottom: 16 }}>Pay as you go</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: "2.8rem", fontWeight: 800, color: CREAM, fontFamily: HEAD, lineHeight: 1 }}>€0</span>
                <span style={{ fontSize: 14, color: "rgba(254,243,199,0.38)" }}>monthly fee</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", marginBottom: 28, lineHeight: 1.5 }}>~€0.10–0.50 per render · no subscription.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {["No watermark", "Cloud rendering (Remotion Lambda)", "4K MP4 + FCPXML + DaVinci export", "Download immediately", "Email support"].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(254,243,199,0.58)" }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 11, color: "rgba(254,243,199,0.25)", marginBottom: 20, lineHeight: 1.5 }}>Render cost: actual Remotion Lambda cost + 5× margin. Estimated €0.10–0.50 for a 60-second 4K animation.</p>
              <Link href="/sign-up" style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(245,158,11,0.22)", color: "rgba(254,243,199,0.65)", textDecoration: "none", padding: "13px 24px", fontSize: 14, fontWeight: 700 }}>
                Add credits
              </Link>
            </div>

            {/* Pro */}
            <div style={{ background: CARD_BG, border: `1px solid ${BLIGHT}`, padding: "36px 32px", display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 0 64px rgba(245,158,11,0.10), 0 0 0 1px rgba(245,158,11,0.18)" }}>
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: GOLD, padding: "4px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1a0c00", whiteSpace: "nowrap" }}>
                Best value
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 16 }}>Pro</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: "2.8rem", fontWeight: 800, color: CREAM, fontFamily: HEAD, lineHeight: 1 }}>
                  {PRO_PRICE[billing].price}
                </span>
                <span style={{ fontSize: 14, color: "rgba(254,243,199,0.38)" }}>{PRO_PRICE[billing].suffix}</span>
              </div>
              {PRO_PRICE[billing].note && (
                <p style={{ fontSize: 12, color: GOLD, marginBottom: 12, fontWeight: 600 }}>{PRO_PRICE[billing].note}</p>
              )}
              <p style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", marginBottom: 28, lineHeight: 1.5 }}>Everything unlocked, forever.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {[
                  "Everything in Pay as you go",
                  "Unlimited cloud renders (fair use)",
                  "Priority rendering queue",
                  "All future features included",
                  billing === "lifetime" ? "Lifetime updates — pay once" : "Updates included",
                  "Discord community access",
                  "Priority email support",
                ].map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(254,243,199,0.70)" }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GOLD, color: "#1a0c00", textDecoration: "none", padding: "14px 24px", fontSize: 14, fontWeight: 800, boxShadow: "0 0 32px rgba(245,158,11,0.35)" }}>
                Get Pro <span style={{ fontSize: 16 }}>→</span>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" aria-labelledby="faq-heading" style={{ background: CARD_BG, padding: "100px 48px 96px", borderTop: "1px solid rgba(245,158,11,0.08)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.36em", textTransform: "uppercase", color: GOLD, textAlign: "center", marginBottom: 14 }}>FAQ</p>
          <h2 id="faq-heading" style={{ fontSize: "clamp(1.9rem,3.5vw,2.6rem)", fontWeight: 800, textAlign: "center", letterSpacing: "-0.03em", marginBottom: 64, fontFamily: HEAD, lineHeight: 1.1, color: CREAM }}>
            Common questions about<br />map animation for YouTube
          </h2>
          <FAQList items={FAQ_DATA} />
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section aria-labelledby="final-cta-heading" style={{ padding: "100px 48px 108px", textAlign: "center", background: BG, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(245,158,11,0.08), transparent)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, pointerEvents: "none", background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.30), transparent)" }} />
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.36em", textTransform: "uppercase", color: GOLD, marginBottom: 18 }}>Get started</p>
        <h2 id="final-cta-heading" style={{ fontSize: "clamp(2rem,4.5vw,3.5rem)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 44, fontFamily: HEAD, lineHeight: 1.08, color: CREAM }}>
          Start making your first<br />map animation today.
        </h2>
        <Link href="/sign-up" aria-label="Start making map animations for free"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, background: GOLD, color: "#1a0c00", textDecoration: "none", padding: "18px 46px", fontSize: 16, fontWeight: 800, letterSpacing: "0.01em", boxShadow: "0 0 56px rgba(245,158,11,0.50), 0 10px 40px rgba(0,0,0,0.55)" }}>
          Start free — no credit card <span style={{ fontSize: 19, lineHeight: 1 }}>→</span>
        </Link>
        <p style={{ marginTop: 22, fontSize: 13, color: "rgba(254,243,199,0.28)" }}>
          Free plan includes all features. No credit card required.
        </p>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(245,158,11,0.08)", background: BG }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 48px 36px", display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "48px", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(254,243,199,0.65)", letterSpacing: "-0.01em", marginBottom: 8 }}>Prompt Studio</div>
            <p style={{ fontSize: 13, color: "rgba(254,243,199,0.28)", lineHeight: 1.6, maxWidth: 240 }}>
              The map animation tool for YouTube creators, journalists, and documentary makers.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(254,243,199,0.25)", marginBottom: 14 }}>Product</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Features","#features"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l,h]) => (
                <a key={l} href={h} style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", textDecoration: "none" }}>{l}</a>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(254,243,199,0.25)", marginBottom: 14 }}>Account</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href="/sign-in" style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", textDecoration: "none" }}>Sign in</Link>
              <Link href="/sign-up" style={{ fontSize: 13, color: "rgba(254,243,199,0.38)", textDecoration: "none" }}>Start free</Link>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(254,243,199,0.25)", marginBottom: 14 }}>Export to</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["MP4 · 4K", "FCPXML", "DaVinci Resolve", "GIF"].map((t) => (
                <span key={t} style={{ fontSize: 13, color: "rgba(254,243,199,0.28)" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(245,158,11,0.06)", padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "rgba(254,243,199,0.20)" }}>© 2025 Prompt Studio</span>
          <span style={{ fontSize: 12, color: "rgba(254,243,199,0.18)" }}>Map data © Mapbox · © OpenStreetMap contributors</span>
        </div>
      </footer>

    </div>
  );
}

// ─── FeatureCard ──────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}
      onMouseEnter={() => { if (ref.current) ref.current.style.borderColor = BLIGHT; }}
      onMouseLeave={() => { if (ref.current) ref.current.style.borderColor = BORDER; }}
      style={{ background: BG, border: `1px solid ${BORDER}`, padding: "36px 32px", transition: "border-color 0.2s" }}>
      <div style={{ fontSize: 28, marginBottom: 20, lineHeight: 1 }} aria-hidden>{icon}</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10, color: CREAM, fontFamily: HEAD }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.72, color: "rgba(254,243,199,0.44)" }}>{desc}</p>
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

function FAQList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="list">
      {items.map(({ q, a }, i) => (
        <FAQItem key={i} q={q} a={a} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} />
      ))}
    </div>
  );
}

function FAQItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: BG, border: `1px solid ${isOpen ? BLIGHT : BORDER}`, transition: "border-color 0.2s" }} role="listitem">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left", fontFamily: SANS }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: CREAM, lineHeight: 1.4 }}>{q}</span>
        <span style={{ color: GOLD, fontSize: 18, flexShrink: 0, display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease", lineHeight: 1 }} aria-hidden>▾</span>
      </button>
      {isOpen && (
        <div style={{ padding: "0 24px 22px" }}>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(254,243,199,0.52)", margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}
