"use client";

import React from "react";
import { useStudio } from "@/store/studio";
import { MAP_BASE_STYLES, matchBaseStyle } from "@/lib/mapbox";
import { Section } from "@/components/ui/Field";
import { Moon, Sun, Satellite, Mountain, Map as MapIcon } from "lucide-react";
import type { MapSceneSpec } from "@/lib/types";

const TONE_ICONS = {
  dark: <Moon size={14} />,
  light: <Sun size={14} />,
  satellite: <Satellite size={14} />,
  outdoors: <Mountain size={14} />,
} as const;

export const MapStylePicker: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const patchScene = useStudio((s) => s.patchScene);
  const scene = spec.scene as MapSceneSpec;
  const activeId = matchBaseStyle(scene.mapStyleUrl);

  return (
    <Section title="Base map style">
      <div className="grid grid-cols-3 gap-1.5">
        {MAP_BASE_STYLES.map((p) => {
          const active = activeId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => patchScene({ mapStyleUrl: p.url })}
              className={`flex flex-col items-center gap-1 rounded-md px-2 py-2.5 text-[11px] transition border ${
                active
                  ? "bg-amber/15 border-amber text-white"
                  : "bg-ink-900 border-ink-700 text-white/60 hover:border-amber/40"
              }`}
            >
              <span className={active ? "text-amber" : "text-white/40"}>
                {TONE_ICONS[p.tone] ?? <MapIcon size={14} />}
              </span>
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Layer toggles — apply to whatever base style is selected */}
      <div className="space-y-1.5 pt-1">
        <Toggle
          label="Show streets / roads"
          checked={scene.showStreets !== false}
          onChange={(v) => patchScene({ showStreets: v })}
        />
        <Toggle
          label="Show labels (city / country names, POIs)"
          checked={scene.showLabels !== false}
          onChange={(v) => patchScene({ showLabels: v })}
        />
        {/* B5: 3D buildings */}
        <Toggle
          label="3D buildings (city zoom only — needs streets layer)"
          checked={!!scene.show3dBuildings}
          onChange={(v) => patchScene({ show3dBuildings: v })}
        />
        {/* B5: 3D terrain */}
        <Toggle
          label="3D terrain (elevation from DEM)"
          checked={scene.terrain?.enabled ?? false}
          onChange={(v) =>
            patchScene({
              terrain: { enabled: v, exaggeration: scene.terrain?.exaggeration ?? 1.5 },
            })
          }
        />
        {scene.terrain?.enabled && (
          <div className="pl-5">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-wider text-white/50">
                Terrain exaggeration
              </div>
              <div className="text-[10px] font-mono text-amber">
                {scene.terrain.exaggeration.toFixed(1)}×
              </div>
            </div>
            <input
              type="range" min={0.5} max={3} step={0.1}
              value={scene.terrain.exaggeration}
              onChange={(e) =>
                patchScene({
                  terrain: { enabled: true, exaggeration: parseFloat(e.target.value) },
                })
              }
              className="w-full accent-amber"
            />
            <div className="text-[10px] text-white/40">
              1.0 = real · 1.5 = cinematic · 2.5+ = dramatic mountains
            </div>
          </div>
        )}
      </div>
    </Section>
  );
};

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-amber"
    />
    {label}
  </label>
);
