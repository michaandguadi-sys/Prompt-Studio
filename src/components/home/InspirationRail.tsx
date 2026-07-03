"use client";

import React from "react";
import { coordsFor, type GeoStop } from "./worldCoords";

/**
 * Infinite inspiration carousel — living story ideas instead of static
 * templates. HOVER one and its route sketches itself in amber on the map
 * behind; CLICK and the prompt fills, ready to generate or remix.
 */

type Card = { emoji: string; title: string; prompt: string; places: string[] };

const CARDS: Card[] = [
  { emoji: "✈️", title: "Around the world in 90 seconds", prompt: "A cinematic flight around the world: New York → London → Dubai → Tokyo → Sydney, smooth camera moves, documentary style", places: ["New York", "London", "Dubai", "Tokyo", "Sydney"] },
  { emoji: "🏔", title: "Epic hiking adventure", prompt: "Documentary intro of a trek through the Himalayas from Kathmandu to Mount Everest base camp, golden hour, slow aerial camera", places: ["Kathmandu", "Mount Everest"] },
  { emoji: "🚗", title: "Road trip across America", prompt: "A vintage Route 66 road trip from Chicago to Los Angeles by car, warm nostalgic mood, vintage atlas style", places: ["Chicago", "Los Angeles"] },
  { emoji: "🎥", title: "Documentary opening", prompt: "The fall of the Berlin Wall, November 1989 — show the divided city, then the moment it crumbled, archival documentary mood", places: ["Berlin"] },
  { emoji: "🛰", title: "Satellite flyover", prompt: "Satellite flyover of the Amazon from the Andes to the Atlantic, slow drifting camera, National Geographic style", places: ["Andes", "Amazon"] },
  { emoji: "🌍", title: "Countries I've visited", prompt: "Highlight every country I've visited one by one: France, Italy, Japan, Brazil and Morocco — playful, colorful, energetic", places: ["France", "Italy", "Japan", "Brazil", "Morocco"] },
  { emoji: "⛵", title: "Mediterranean sailing", prompt: "A sailing journey from Barcelona to Athens across the Mediterranean by boat, serene dawn light, minimal design", places: ["Barcelona", "Athens"] },
  { emoji: "🚂", title: "The Orient Express", prompt: "The legendary Orient Express from Paris via Vienna to Istanbul by train, luxury vintage style, elegant slow camera", places: ["Paris", "Vienna", "Istanbul"] },
  { emoji: "🌋", title: "Volcano expedition", prompt: "My volcano expedition in Guatemala — fly into Guatemala City, then trek to the crater at dawn, dramatic mood", places: ["Guatemala City"] },
  { emoji: "🚁", title: "New York to Iceland", prompt: "Fly from New York to Iceland with smooth cinematic camera moves, cold blue mood, aerial documentary style", places: ["New York", "Reykjavik"] },
];

export const InspirationRail: React.FC<{
  onHover: (stops: GeoStop[] | null) => void;
  onPick: (prompt: string) => void;
}> = ({ onHover, onPick }) => {
  const stopsOf = (c: Card): GeoStop[] =>
    c.places.map((p) => coordsFor(p)).filter(Boolean) as GeoStop[];

  return (
    <div className="group/rail relative w-full overflow-hidden" aria-label="Story inspiration">
      <style>{`
        @keyframes railScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .rail-track { animation: railScroll 64s linear infinite; }
        .group\\/rail:hover .rail-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .rail-track { animation: none; } }
      `}</style>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20" style={{ background: "linear-gradient(to right, rgba(4,6,16,0.9), transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20" style={{ background: "linear-gradient(to left, rgba(4,6,16,0.9), transparent)" }} />

      <div className="rail-track flex w-max gap-2.5 py-1">
        {[...CARDS, ...CARDS].map((c, i) => (
          <button
            key={`${c.title}-${i}`}
            onMouseEnter={() => onHover(stopsOf(c))}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(stopsOf(c))}
            onBlur={() => onHover(null)}
            onClick={() => { onPick(c.prompt); onHover(null); }}
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3.5 py-2.5 text-left backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[#FFB86E]/45 hover:bg-white/[0.09]"
            title={c.prompt}
          >
            <span className="text-[17px] leading-none">{c.emoji}</span>
            <span className="max-w-[190px]">
              <span className="block truncate text-[12px] font-semibold text-white/80">{c.title}</span>
              <span className="block truncate text-[10px] text-white/32">{c.places.join(" → ")}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
