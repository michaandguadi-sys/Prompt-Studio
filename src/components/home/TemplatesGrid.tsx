"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Swords, Plane, Building2, Landmark, Ship, Loader2, Crown, Route } from "lucide-react";

/**
 * Templates = curated STARTING POINTS. Each ships a fully-authored, deterministic
 * PLAN (no LLM round-trip) that the generator resolves into real geography. The
 * plans are hand-composed so each tests a DIFFERENT feature and never spells the
 * same place name two or three times over — one clear text reference per piece.
 */
const TEMPLATES = [
  {
    id: "frontline", label: "Frontline", sub: "War-doc · red, 3D, grain", icon: <Swords size={18} />,
    plan: {
      title: "Frontline", durationSec: 9, aspect: "16:9", basemapStyle: "dark", focus: "Ukraine",
      mood: "conflict", motion: "zoom-out", palette: "Conflict Red", priority: "highlight", cameraPitch: 48,
      fontDisplay: "Oswald", fontBody: "Inter",
      look: { vignette: 0.62, letterbox: 0.12, grain: 0.28, texture: "noise", textureOpacity: 0.35, tintColor: "#1a0606", tintOpacity: 0.3, bgColor: "#0a0303" },
      layers: [
        { kind: "highlight", place: "Ukraine", fill: "solid", mood: "conflict",
          style: { extrude: 16, fillColor: "#7a1410", fillOpacity: 0.5, borderColor: "#ffffff", borderWidth: 3, borderDash: "dashed", glowColor: "#ff4030", glowWidth: 32, animation: "border-first", labelText: "EASTERN FRONT", labelSize: 52, labelColor: "#ffffff" } },
        { kind: "label", text: "KYIV", sub: "capital", place: "Kyiv", variant: "pin", style: { sizePx: 40, accent: "#ff4030" } },
        { kind: "title", text: "FRONTLINE", sub: "2014 — present", template: "impact", position: "bottom" },
      ],
    },
  },
  {
    id: "voyage", label: "The Grand Voyage", sub: "Vintage paper flight", icon: <Plane size={18} />,
    plan: {
      title: "The Grand Voyage", durationSec: 10, aspect: "16:9", basemapStyle: "light", focus: "Istanbul",
      mood: "historical", motion: "fly-in", palette: "Vox Editorial", priority: "route",
      fontDisplay: "Georgia", fontBody: "Georgia",
      look: { vignette: 0.5, letterbox: 0.08, grain: 0.12, texture: "paper", textureOpacity: 0.78, tintColor: "#6b4a1f", tintOpacity: 0.34, bgColor: "#1a1206" },
      layers: [
        { kind: "route", from: "Paris", to: "Istanbul", transport: "aircraft", icon: "plane", cameraMode: "chase",
          style: { color: "#c89b3c", width: 6, glow: 0.85, dashStyle: "dotted", reveal: "draw", smoothness: 0.3, drawFraction: 0.82 } },
        { kind: "title", text: "THE GRAND VOYAGE", sub: "By air", template: "classic", position: "bottom" },
      ],
    },
  },
  {
    id: "city", label: "City Lights", sub: "3D satellite + pins", icon: <Building2 size={18} />,
    plan: {
      title: "City Lights", durationSec: 8, aspect: "16:9", basemapStyle: "satellite", focus: "Tokyo",
      palette: "Arctic Cold", motion: "push-in", terrain: true, buildings3d: true, cameraPitch: 62,
      fontDisplay: "Helvetica Now", fontBody: "Inter",
      look: { vignette: 0.32, grain: 0.05, texture: "none", tintColor: "#08131f", tintOpacity: 0.14, bgColor: "#000000" },
      layers: [
        { kind: "label", text: "TOKYO", sub: "東京 · 37M", place: "Tokyo", variant: "pin", style: { sizePx: 62, color: "#ffffff", accent: "#4ab8ff" } },
        { kind: "label", text: "SHIBUYA", place: "Shibuya, Tokyo", variant: "pin", style: { sizePx: 34, accent: "#4ab8ff" } },
        { kind: "label", text: "SHINJUKU", place: "Shinjuku, Tokyo", variant: "pin", style: { sizePx: 34, accent: "#4ab8ff" } },
      ],
    },
  },
  {
    id: "empire", label: "Imperivm", sub: "Hatched 3D · serif", icon: <Landmark size={18} />,
    plan: {
      title: "Imperivm", durationSec: 9, aspect: "16:9", basemapStyle: "dark", focus: "Rome",
      mood: "empire", motion: "orbit", palette: "Classic Mono", priority: "highlight", cameraPitch: 50,
      fontDisplay: "Times", fontBody: "Times",
      look: { vignette: 0.56, letterbox: 0.1, grain: 0.18, texture: "paper", textureOpacity: 0.6, tintColor: "#3a2a12", tintOpacity: 0.26, bgColor: "#0f0a05" },
      layers: [
        { kind: "highlight", place: "Italy", fill: "hatch", mood: "empire",
          style: { extrude: 22, fillColor: "#caa24a", fillOpacity: 0.42, borderColor: "#e8d5a0", borderWidth: 2.5, glowColor: "#caa24a", glowWidth: 26, animation: "sweep" } },
        { kind: "title", text: "IMPERIVM ROMANVM", sub: "117 AD · greatest extent", template: "impact", position: "bottom" },
      ],
    },
  },
  {
    id: "trade", label: "Trade Winds", sub: "Sea routes · grid look", icon: <Ship size={18} />,
    plan: {
      title: "Trade Winds", durationSec: 11, aspect: "16:9", basemapStyle: "dark", focus: "Singapore",
      mood: "trade", motion: "fly-in", palette: "Trade Green", priority: "route",
      fontDisplay: "Courier New", fontBody: "Courier New",
      look: { vignette: 0.42, grain: 0.1, texture: "grid", textureOpacity: 0.4, tintColor: "#04201a", tintOpacity: 0.2, bgColor: "#03100c" },
      layers: [
        { kind: "route", from: "Shanghai", to: "Singapore", transport: "boat", icon: "ship", cameraMode: "frame",
          style: { color: "#2ec4b6", width: 5, glow: 0.65, dashStyle: "dashed", reveal: "draw", smoothness: 0.4 } },
        { kind: "route", from: "Singapore", to: "Mumbai", transport: "boat", icon: "none", cameraMode: "frame",
          style: { color: "#2ec4b6", width: 5, glow: 0.5, dashStyle: "dashed", reveal: "draw", smoothness: 0.4 } },
        { kind: "title", text: "TRADE WINDS", sub: "Maritime routes", template: "kicker", position: "bottom" },
      ],
    },
  },
  {
    id: "rise", label: "The Rise", sub: "Empire grows · gold", icon: <Crown size={18} />,
    plan: {
      title: "The Rise", durationSec: 10, aspect: "16:9", basemapStyle: "dark", focus: "Mongolia",
      mood: "empire", motion: "zoom-out", palette: "Classic Mono", priority: "highlight", cameraPitch: 38,
      fontDisplay: "Times", fontBody: "Times",
      look: { vignette: 0.5, letterbox: 0.1, grain: 0.16, texture: "paper", textureOpacity: 0.5, tintColor: "#2a2008", tintOpacity: 0.22, bgColor: "#0d0a04" },
      layers: [
        { kind: "highlight", place: "Mongolia", fill: "solid", mood: "empire",
          style: { fillColor: "#d8b24a", fillOpacity: 0.45, borderColor: "#f0dca0", borderWidth: 2.5, glowColor: "#d8b24a", glowWidth: 26, animation: "grow", labelText: "THE MONGOL EMPIRE", labelSize: 48, labelColor: "#ffffff" } },
        { kind: "title", text: "THE RISE", sub: "1206 — 1294", template: "impact", position: "bottom" },
      ],
    },
  },
  {
    id: "silk", label: "Silk Road", sub: "Overland trade · sepia", icon: <Route size={18} />,
    plan: {
      title: "Silk Road", durationSec: 11, aspect: "16:9", basemapStyle: "light", focus: "Samarkand",
      mood: "historical", motion: "fly-in", palette: "Vox Editorial", priority: "route",
      fontDisplay: "Georgia", fontBody: "Georgia",
      look: { vignette: 0.48, letterbox: 0.08, grain: 0.12, texture: "paper", textureOpacity: 0.7, tintColor: "#6b4a1f", tintOpacity: 0.3, bgColor: "#191205" },
      layers: [
        { kind: "route", from: "Xi'an", to: "Venice", transport: "driving", icon: "none", cameraMode: "chase",
          style: { color: "#b8863a", width: 5, glow: 0.7, dashStyle: "dotted", reveal: "draw", smoothness: 0.35, drawFraction: 0.85 } },
        { kind: "title", text: "THE SILK ROAD", sub: "Chang'an → Venice", template: "classic", position: "bottom" },
      ],
    },
  },
] as const;

export const TemplatesGrid: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (t: (typeof TEMPLATES)[number]) => {
    if (busy) return;
    setBusy(t.id);
    try {
      const res = await fetch("/api/v2/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: t.plan }),
      });
      const data = await res.json();
      if (data?.project) {
        load(data.project);
        router.push("/studio2");
        return;
      }
    } catch {
      /* fall through */
    }
    // Fallback: just open a blank editor.
    setBusy(null);
    router.push("/studio2");
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {TEMPLATES.map((t) => {
        // A preview thumbnail of the ACTUAL look — gradient built from the plan's
        // palette + its lead accent, so the grid reads like a gallery of styles.
        const lk = (t.plan as any).look ?? {};
        const accent = (t.plan as any).layers?.find((l: any) => l?.style)?.style?.glowColor
          || (t.plan as any).layers?.find((l: any) => l?.style)?.style?.accent || "#6E7BFF";
        const bg = lk.bgColor || "#0a0e1a";
        const tint = lk.tintColor || accent;
        return (
          <button
            key={t.id}
            onClick={() => open(t)}
            disabled={!!busy}
            className="group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl card-light p-3 text-left transition-all hover:-translate-y-1 hover:shadow-floaty disabled:opacity-60"
          >
            <div className="relative h-16 w-full overflow-hidden rounded-xl border border-black/10" style={{ background: `linear-gradient(135deg, ${bg}, ${tint} 55%, ${accent})` }}>
              {/* faint texture/grain hint + glow on hover */}
              <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 0.5px, transparent 0.5px)", backgroundSize: "5px 5px" }} />
              <div className="absolute inset-0 flex items-center justify-center text-white transition-transform group-hover:scale-110" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))" }}>
                {busy === t.id ? <Loader2 size={20} className="animate-spin" /> : t.icon}
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: `inset 0 0 34px ${accent}77` }} />
            </div>
            <div>
              <div className="text-sm font-medium text-graphite">{t.label}</div>
              <div className="text-[11px] text-graphite/35">{t.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
