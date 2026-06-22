"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { STYLE_PACKAGES, matchStylePackage, type StylePackage } from "@/lib/presets/packages";
import type { MapSceneSpec } from "@/lib/types";
import { Check, Sparkles } from "lucide-react";

/**
 * Curated style-package picker (#3). Sits at the TOP of the editor so the
 * first decision a user makes is "what's the overall vibe" — then everything
 * downstream (palette, fonts, map, easing, route) is pre-tuned. Picking a
 * package is non-destructive to the user's content (waypoints, labels text,
 * highlights) — it only swaps the look.
 */
export const StylePackagePicker: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const patchStyle = useStudio((s) => s.patchStyle);
  const patchScene = useStudio((s) => s.patchScene);

  const activeId = matchStylePackage(spec.style.name);
  const isMap = spec.kind === "map";

  const apply = (pkg: StylePackage) => {
    // 1. Always apply the full visual style (palette/fonts/typography/letterbox).
    patchStyle(pkg.style);

    // 2. Map-specific look: base style, camera feel, terrain, and — if a route
    //    already exists — restyle its line to match the package.
    if (isMap) {
      const scene = spec.scene as MapSceneSpec;
      const patch: Partial<MapSceneSpec> = {
        mapStyleUrl: pkg.mapStyleUrl,
        easing: pkg.easing,
        smoothCameraPath: pkg.smoothCameraPath,
        terrain: pkg.terrain,
      };
      if (scene.route) {
        patch.route = {
          ...scene.route,
          style: { ...scene.route.style, ...pkg.routeStyle },
        };
      }
      patchScene(patch);
    }
  };

  return (
    <div className="border-b border-ink-700 bg-ink-900/40 px-5 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={12} className="text-amber" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          Style package
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {STYLE_PACKAGES.map((pkg) => {
          const active = activeId === pkg.id;
          return (
            <button
              key={pkg.id}
              onClick={() => apply(pkg)}
              className={`group flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                active
                  ? "border-amber bg-amber/10"
                  : "border-ink-700 bg-ink-900 hover:border-amber/40"
              }`}
            >
              <span
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-white/20"
                style={{ background: pkg.accent }}
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold ${active ? "text-amber" : "text-white"}`}>
                    {pkg.name}
                  </span>
                  {active && <Check size={11} className="text-amber" />}
                </span>
                <span className="block text-[10px] leading-snug text-white/45 mt-0.5">
                  {pkg.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/35 mt-2 leading-snug">
        Sets palette, fonts, map style, camera feel & route style at once. Tweak anything below afterward.
      </p>
    </div>
  );
};
