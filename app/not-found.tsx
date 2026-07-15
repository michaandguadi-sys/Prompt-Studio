import Link from "next/link";
import { Compass, MapPin, ArrowLeft } from "lucide-react";

export const metadata = { title: "Off the map — Mapanisy" };

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/**
 * Branded 404. Renders inside the root layout (ClerkProvider + html/body), so it
 * inherits the app fonts + globals.css. Matches the landing's night-satellite
 * identity: #04060f, iris glow, Newsreader serif — a lost page should still feel
 * like Mapanisy, not a dead end.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#04060f] px-6 text-center text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 45% at 50% 32%, rgba(110,123,255,0.15), transparent 65%)" }} />
      {/* faint graticule — a map with no destination */}
      <svg aria-hidden viewBox="0 0 800 450" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.6]" preserveAspectRatio="xMidYMid slice">
        {[70, 150, 230, 310, 390].map((y) => (
          <path key={`la${y}`} d={`M0 ${y} Q 400 ${y - 20}, 800 ${y}`} fill="none" stroke="#6E7BFF" strokeOpacity="0.08" strokeWidth="1" />
        ))}
        {[120, 260, 400, 540, 680].map((x) => (
          <path key={`lo${x}`} d={`M${x} 0 Q ${x + 12} 225, ${x} 450`} fill="none" stroke="#6E7BFF" strokeOpacity="0.08" strokeWidth="1" />
        ))}
      </svg>

      <div className="relative">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-iris/30 bg-white/[0.05] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[#aab4ff] backdrop-blur">
          <Compass size={12} /> 404 — off the map
        </div>
        <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.02em]" style={{ fontFamily: SERIF }}>
          This route isn’t
          <br />
          <span style={{ background: "linear-gradient(108deg,#9CA6FF 6%,#2FE0FF 56%,#B57BFF 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            on the map.
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-white/50">
          The page you’re looking for wandered off. Let’s get you back to familiar territory.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-3 text-[14px] font-bold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
            <ArrowLeft size={15} /> Back to home
          </Link>
          <Link href="/home" className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-3 text-[14px] font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/[0.09]">
            <MapPin size={15} /> Open the studio
          </Link>
        </div>
      </div>
    </main>
  );
}
