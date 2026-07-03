"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, Layers, MapPin, Clapperboard, Palette, Route, ArrowRight } from "lucide-react";
import { ProjectsGrid } from "@/components/home/ProjectsGrid";
import { ImportTrackBox } from "@/components/home/ImportTrackBox";
import { GenerateExperience } from "@/components/home/GenerateExperience";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/**
 * Homepage — ONE continuous dark cinematic canvas. The immersive GENERATE
 * EXPERIENCE fills the first viewport (a living MapLibre world reacting to
 * every keystroke, the glass prompt at center stage); the content below
 * continues on the same night surface: your films, the GPX pro path, feature
 * highlights, pricing CTA, footer. No white band — the mood never breaks.
 */
export const HomeContent: React.FC = () => {
  return (
    <div className="bg-[#070a14] text-white">
      {/* ── THE GENERATE EXPERIENCE — one immersive viewport ── */}
      <GenerateExperience />

      {/* ── CONTENT (same night canvas) ── */}
      <div className="pb-16">
        {/* GPX import — the Pro capability */}
        <div className="mx-auto max-w-3xl px-6 pt-10">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/35">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="inline-flex items-center gap-2">
              or start from a GPS route
              <span className="rounded-full bg-iris/20 px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] text-[#aab4ff]">PRO</span>
            </span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>
          <div className="dark-import">
            <ImportTrackBox />
          </div>
        </div>

        {/* Your films */}
        <div className="mx-auto max-w-5xl px-6 pt-14">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="text-[20px] font-medium text-white/90" style={{ fontFamily: SERIF }}>
                Your films
              </h2>
              <p className="text-[12px] text-white/40">Pick up where you left off.</p>
            </div>
            <Link
              href="/studio2"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-[#aab4ff]"
            >
              <Layers size={12} /> Blank map
            </Link>
          </div>
          <ProjectsGrid />
        </div>

        {/* Feature highlights — what makes it premium, in one calm row */}
        <div className="mx-auto max-w-5xl px-6 pt-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: <Clapperboard size={15} />, title: "Directed, not templated", body: "The AI plans the story, camera and timing like a documentary editor — one continuous cinematic take." },
              { icon: <Palette size={15} />, title: "17 professional map styles", body: "From Earth Documentary to Vintage Atlas — balanced palettes and cinematic grades, one click each." },
              { icon: <Route size={15} />, title: "One-click 4K render", body: "Render in the cloud or on your machine, with live progress and a queue — landscape, vertical or square." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-sm">
                <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-iris/15 text-[#aab4ff]">{f.icon}</div>
                <div className="text-[13.5px] font-semibold text-white/85">{f.title}</div>
                <p className="mt-1 text-[12px] leading-relaxed text-white/40">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing CTA band */}
        <div className="mx-auto max-w-5xl px-6 pt-12">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-iris/25 bg-gradient-to-r from-iris/[0.10] to-transparent p-6 sm:flex-row sm:items-center">
            <div>
              <div className="text-[15px] font-semibold text-white/90" style={{ fontFamily: SERIF }}>
                Ready for watermark-free 4K?
              </div>
              <p className="mt-0.5 text-[12px] text-white/40">Start free, upgrade when your story deserves the full frame.</p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-iris px-5 py-2.5 text-[12.5px] font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5"
            >
              See pricing <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer className="mx-auto max-w-5xl px-6 pt-14">
          <div className="border-t border-white/[0.08] pt-6">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-iris">
                  <MapPin size={9} strokeWidth={2.5} color="white" />
                </div>
                <span className="text-[12px] font-semibold text-white/85">Mapanisy</span>
                <span className="text-[11px] text-white/35">— cinematic map animations from words.</span>
              </div>
              <nav className="flex items-center gap-5 text-[11.5px] text-white/45">
                <Link href="/pricing" className="transition-colors hover:text-[#aab4ff]">Pricing</Link>
                <Link href="/studio2" className="transition-colors hover:text-[#aab4ff]">Editor</Link>
                <Link href="/brand" className="inline-flex items-center gap-1 transition-colors hover:text-[#aab4ff]"><Sparkles size={10} /> Brand kit</Link>
                <Link href="/dashboard" className="transition-colors hover:text-[#aab4ff]">Dashboard</Link>
              </nav>
            </div>
            <div className="mt-4 pb-2 text-[10.5px] text-white/28">
              © {new Date().getFullYear()} Mapanisy · 4K export · landscape, vertical or square
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
