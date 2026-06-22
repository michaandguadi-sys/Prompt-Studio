import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Sparkles, Route, Video, Share2, Wand2, MountainSnow, ArrowRight, Check,
  ShieldCheck, Clapperboard, MousePointer2,
} from "lucide-react";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";
const GRATICULE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(20,28,55,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(20,28,55,0.04) 1px, transparent 1px)",
  backgroundSize: "46px 46px",
};

/**
 * Public marketing landing — bright editorial. Signed-in users skip to the app;
 * everything else lives behind auth (see middleware).
 */
export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/home");

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper-50 text-graphite antialiased">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-line/70 bg-paper-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 6px 18px -6px rgba(110,123,255,0.6)" }}>
              <span className="text-[14px] font-black tracking-tight">M</span>
            </div>
            <span className="text-[17px] font-medium tracking-tight text-graphite" style={{ fontFamily: SERIF }}>Mapanisy</span>
          </div>
          <nav className="hidden items-center gap-7 text-[13px] text-graphite/55 md:flex">
            <a href="#features" className="transition-colors hover:text-graphite">Features</a>
            <a href="#how" className="transition-colors hover:text-graphite">How it works</a>
            <Link href="/pricing" className="transition-colors hover:text-graphite">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="text-[13px] text-graphite/60 transition-colors hover:text-graphite">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-20 pb-24 text-center">
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ ...GRATICULE, maskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 75%)", WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 75%)" }} />
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(80% 50% at 50% -5%, rgba(110,123,255,0.10), transparent 60%)" }} />
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[11px] font-medium text-graphite/65 shadow-sm">
            <Sparkles size={12} className="text-iris" /> The AI Story-Map Editor
          </div>
          <h1 className="mb-5 text-[clamp(2.5rem,6vw,4.4rem)] font-medium leading-[1.04] tracking-[-0.01em] text-graphite" style={{ fontFamily: SERIF }}>
            Turn any story — or any GPS track —<br className="hidden sm:block" /> into a <span className="text-iris">cinematic 4K map</span>
          </h1>
          <p className="mx-auto mb-9 max-w-xl text-[16px] leading-relaxed text-graphite/55">
            Describe it in a sentence or drop in a route. A director researches the facts, asks a few smart questions, and builds a broadcast-ready animation — then you fine-tune everything with sliders, or just by asking. No motion-design skills needed.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
              Start free <ArrowRight size={16} />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-6 py-3 text-sm font-semibold text-graphite/75 shadow-sm transition-colors hover:border-graphite/25">
              See what it does
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-graphite/50">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-iris" /> Fact-checked, journalist-grade</span>
            <span className="inline-flex items-center gap-1.5"><Clapperboard size={13} className="text-iris" /> True 4K · 24fps</span>
            <span className="inline-flex items-center gap-1.5"><Wand2 size={13} className="text-iris" /> No design skills required</span>
          </div>
        </div>
      </section>

      {/* ── Feature grid ────────────────────────────────────────────────── */}
      <section id="features" className="relative border-t border-line px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-[clamp(1.8rem,3.6vw,2.6rem)] font-medium tracking-tight text-graphite" style={{ fontFamily: SERIF }}>Everything a motion designer does — <span className="text-iris">in minutes</span></h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] text-graphite/55">From a single prompt to a finished, on-brand map animation, with full control whenever you want it.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-line bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-floaty">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-iris/[0.08] text-iris ring-1 ring-iris/15">
                  <f.icon size={20} />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-graphite">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-graphite/55">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="relative border-t border-line bg-paper-100 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-[clamp(1.8rem,3.6vw,2.6rem)] font-medium tracking-tight text-graphite" style={{ fontFamily: SERIF }}>Three steps to a finished map</h2>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-glow-iris">{i + 1}</div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-graphite">{s.title}</h3>
                <p className="text-[13px] leading-relaxed text-graphite/55">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-line px-6 py-24 text-center">
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(110,123,255,0.10), transparent 70%)" }} />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="mb-4 text-[clamp(2rem,4.5vw,3.2rem)] font-medium leading-tight tracking-tight text-graphite" style={{ fontFamily: SERIF }}>Build your first map<br /><span className="text-iris">in the next five minutes</span></h2>
          <p className="mx-auto mb-8 max-w-md text-[15px] text-graphite/55">Free to start. Your projects, your library, your share links — all in one studio.</p>
          <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
            Start free <ArrowRight size={16} />
          </Link>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-graphite/50">
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-iris" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-iris" /> Export in 4K</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-iris" /> Edit by asking</span>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[12px] text-graphite/45 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)" }}><span className="text-[10px] font-black">M</span></div>
            <span className="font-medium text-graphite/65" style={{ fontFamily: SERIF }}>Mapanisy</span>
            <span>· The AI Story-Map Editor</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-graphite/70">Pricing</Link>
            <Link href="/sign-in" className="hover:text-graphite/70">Sign in</Link>
            <Link href="/sign-up" className="hover:text-graphite/70">Start free</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: Sparkles, title: "Tell it once, answer a few questions", body: "Describe your idea and the director asks the 3–4 questions that matter — tone, camera energy, the angle — then builds the best version. One prompt, a few taps, done." },
  { icon: Route, title: "Drop in a GPS track", body: "Import a run, hike, flight or drive (GPX, TCX, KML, GeoJSON) and it becomes an animated flythrough — pick a camera and a look, the route does the rest." },
  { icon: Video, title: "Cinematic camera, no keyframes", body: "Choose a move — fly in, orbit, push in, pull back — and tune it with sliders. The opening framing is set for you; switchbacks and tilts stay buttery." },
  { icon: MountainSnow, title: "Looks that grade themselves", body: "Documentary noir, topographic, satellite, minimal — every style locks a cohesive palette, type, grade and basemap so each result looks designed." },
  { icon: MousePointer2, title: "Edit by asking — or on the canvas", body: "Click anything in the preview to drag, scale and rotate it, nudge with arrow keys, or just type what to change. Every control is a slider, not a manual." },
  { icon: Share2, title: "Share a link, export true 4K", body: "Send a read-only viewer link to anyone, or render a broadcast-ready 4K · 24fps clip — landscape, vertical or square." },
];

const STEPS = [
  { title: "Describe it or drop a track", body: "A sentence — “the expansion of Rome” — or a GPX file. That's the whole input." },
  { title: "Answer a few quick questions", body: "Tone, camera energy, the angle, length. Accept the smart defaults in one click, or tweak." },
  { title: "Fine-tune and export", body: "Adjust with sliders or by asking, then export in 4K or share a link. No motion-design skills needed." },
];
