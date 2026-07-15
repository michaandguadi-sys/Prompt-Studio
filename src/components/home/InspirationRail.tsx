"use client";

import React from "react";
import { coordsFor, type GeoStop } from "./worldCoords";

/**
 * Infinite inspiration carousel — living story ideas instead of static
 * templates. HOVER one and its route sketches itself in amber on the map
 * behind; CLICK and the prompt fills, ready to generate or remix.
 */

type Card = { emoji: string; title: string; prompt: string; places: string[] };

/** The premium showcase suite — every card is a flagship capability demo
 *  (terrain flythrough, water-hugging sea voyage, orbital reveal, Pacific
 *  arc, historical vectors, data bubbles). Prompts are phrased so the intent
 *  parser resolves the right stops: destinations sit in the from→to chain and
 *  style words ride after a comma (parser-verified). Same element vocabulary
 *  the editor renders — routes, highlights, tracks, bubbles, orbits. */
const CARDS: Card[] = [
  { emoji: "🥾", title: "Mont Blanc terrain flythrough", prompt: "A terrain-hugging 3D flythrough over Mont Blanc, golden dawn light, documentary style", places: ["Mont Blanc"] },
  { emoji: "⛵", title: "Mediterranean sea voyage", prompt: "Sailing from Barcelona to Athens, serene dawn light, minimal design", places: ["Barcelona", "Athens"] },
  { emoji: "🛫", title: "New York → Cook Islands", prompt: "Flight from New York to the Cook Islands, dramatic Pacific arc, cold blue mood", places: ["New York", "Cook Islands"] },
  { emoji: "⛪", title: "Barcelona cathedral orbit", prompt: "A slow 360 orbit around the cathedral of Barcelona at sunrise, cinematic reveal", places: ["Barcelona"] },
  { emoji: "🧭", title: "Viking migrations", prompt: "The Viking migrations from Norway to Iceland to Greenland, historical parchment style", places: ["Norway", "Iceland", "Greenland"] },
  { emoji: "📊", title: "US population bubbles", prompt: "Every American city above 5 million people as glowing population bubbles, data documentary", places: ["United States"] },
  { emoji: "✈️", title: "Around the world in 90 seconds", prompt: "A cinematic flight around the world: New York → London → Dubai → Tokyo → Sydney, smooth camera moves, documentary style", places: ["New York", "London", "Dubai", "Tokyo", "Sydney"] },
  { emoji: "🚂", title: "The Orient Express", prompt: "The legendary Orient Express from Paris via Vienna to Istanbul by train, luxury vintage style, elegant slow camera", places: ["Paris", "Vienna", "Istanbul"] },
  { emoji: "🎥", title: "Documentary opening", prompt: "The fall of the Berlin Wall, November 1989 — show the divided city, then the moment it crumbled, archival documentary mood", places: ["Berlin"] },
  { emoji: "🌍", title: "Countries I've visited", prompt: "Highlight every country I've visited one by one: France, Italy, Japan, Brazil and Morocco — playful, colorful, energetic", places: ["France", "Italy", "Japan", "Brazil", "Morocco"] },
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
