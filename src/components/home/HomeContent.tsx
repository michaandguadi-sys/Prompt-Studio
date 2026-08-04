"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, Layers, MapPin, Clapperboard, Palette, Route, ArrowRight } from "lucide-react";
import { ProjectsGrid } from "@/components/home/ProjectsGrid";
import { ImportTrackBox } from "@/components/home/ImportTrackBox";
import { GenerateExperience } from "@/components/home/GenerateExperience";
import { Showcase } from "@/components/home/Showcase";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/** Answers the visitor's real objection — "why not just use the free tools?" —
 *  with the honest contrast against the two things they'd actually consider. */
const COMPARE: { row: string; ges: boolean | string; ae: boolean | string; us: boolean | string }[] = [
  { row: "Direct a film from one sentence", ges: false, ae: false, us: true },
  { row: "In the browser — nothing to install", ges: true, ae: false, us: true },
  { row: "Time to your first film", ges: "Hours", ae: "Days", us: "~2 min" },
  { row: "Data maps · GPS flythroughs · live Earth", ges: false, ae: "Manual", us: true },
  { row: "Unlimited 4K render", ges: "Frames → AE", ae: "Yes", us: true },
  { row: "Cost", ges: "Free", ae: "~$60 + AE $23/mo", us: "Free · $7.99/mo" },
];
const CmpCell: React.FC<{ v: boolean | string; us?: boolean }> = ({ v, us }) =>
  v === true ? <span className={us ? "text-emerald-300" : "text-emerald-400/70"}>✓</span>
  : v === false ? <span className="text-white/20">—</span>
  : <span className={us ? "font-medium text-white/90" : "text-white/50"}>{v}</span>;

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
              href="/studio2?blank=1"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-[#aab4ff]"
            >
              <Layers size={12} /> Blank map
            </Link>
          </div>
          <ProjectsGrid />
        </div>

        {/* Showcase — finished, polished films to open & play in one click */}
        <div className="mx-auto max-w-6xl px-6 pt-16">
          <div className="mb-5">
            <h2 className="text-[20px] font-medium text-white/90" style={{ fontFamily: SERIF }}>
              Start from a finished story
            </h2>
            <p className="text-[12px] text-white/40">Real films across styles — open one to play, then make it yours.</p>
          </div>
          <Showcase />
        </div>

        {/* Feature highlights — what makes it premium, in one calm row */}
        <div className="mx-auto max-w-5xl px-6 pt-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: <Clapperboard size={15} />, title: "Directed, not templated", body: "The AI plans the story, camera and timing like a documentary editor — one continuous cinematic take." },
              { icon: <Palette size={15} />, title: "23 professional map styles", body: "From Earth Documentary to Vintage Atlas — balanced palettes and cinematic grades, one click each." },
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

        {/* How we compare — answers "why not just use the free tools?" */}
        <div className="mx-auto max-w-5xl px-6 pt-16">
          <div className="mb-5">
            <h2 className="text-[20px] font-medium text-white/90" style={{ fontFamily: SERIF }}>
              Why not just use the free tools?
            </h2>
            <p className="text-[12px] text-white/40">The same cinematic map moves the pros make in After Effects — directed by AI, in your browser, from one sentence.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
            <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3 font-medium text-white/40">Google Earth Studio</th>
                  <th className="px-4 py-3 font-medium text-white/40">After Effects + GeoLayers</th>
                  <th className="px-4 py-3 font-semibold text-[#aab4ff]">Mapanisy</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((c) => (
                  <tr key={c.row} className="border-t border-white/[0.06]">
                    <td className="px-4 py-2.5 text-white/65">{c.row}</td>
                    <td className="px-4 py-2.5 tabular-nums"><CmpCell v={c.ges} /></td>
                    <td className="px-4 py-2.5 tabular-nums"><CmpCell v={c.ae} /></td>
                    <td className="px-4 py-2.5 bg-iris/[0.06] tabular-nums"><CmpCell v={c.us} us /></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
