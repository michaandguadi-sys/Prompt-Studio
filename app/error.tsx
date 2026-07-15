"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, Home, AlertTriangle } from "lucide-react";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/**
 * Branded route-level error boundary. Catches render/runtime errors in the page
 * tree (the root layout stays mounted, so this inherits fonts + globals.css).
 * `reset()` re-attempts the failed render — most transient errors (a flaky map
 * tile, a slow API) recover on retry without a full reload.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the digest in the console for debugging; no PII, no network call.
    console.error("[mapanisy] route error:", error?.digest ?? error?.message ?? error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#04060f] px-6 text-center text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 45% at 50% 32%, rgba(255,90,110,0.12), transparent 65%)" }} />
      <div className="relative">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-[#ffb3bd]">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-[clamp(1.9rem,5vw,3rem)] font-medium leading-tight tracking-[-0.02em]" style={{ fontFamily: SERIF }}>
          Something went off-course.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-white/50">
          An unexpected error interrupted the render. It’s usually temporary — try again, or head back home.
        </p>
        {error?.digest && (
          <p className="mt-3 font-mono text-[11px] text-white/25">ref: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => reset()} className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-3 text-[14px] font-bold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5">
            <RotateCcw size={15} /> Try again
          </button>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-3 text-[14px] font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/[0.09]">
            <Home size={15} /> Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
