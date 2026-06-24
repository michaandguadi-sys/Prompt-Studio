import Link from "next/link";
import { Check, Zap, ArrowLeft } from "lucide-react";
import { TIERS } from "@/lib/tiers";
import { PricingCheckoutButton } from "@/components/PricingCheckoutButton/PricingCheckoutButton";

export const metadata = { title: "Pricing — Mapanisy" };

const DISPLAY_ORDER = ["free", "creator", "teams", "custom"] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-paper-50 text-graphite">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-line/60 bg-paper-50/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 border border-amber/20">
            <span className="text-[9px] font-black tracking-tight text-amber">M</span>
          </div>
          <span className="text-[11px] font-bold tracking-[0.4em] text-amber">MAPANISY</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-graphite/40 hover:text-graphite/70 transition-colors">
            <ArrowLeft size={12} />
            Back
          </Link>
          <Link href="/sign-in"  className="text-xs text-graphite/50 hover:text-graphite transition-colors">Sign in</Link>
          <Link href="/sign-up" className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-colors shadow-glow-amber-sm">
            Start free
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 px-6 text-center">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[400px] w-[700px] rounded-full bg-amber/[0.05] blur-[120px]" />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <div className="text-[10px] uppercase tracking-[0.4em] text-amber mb-4">Pricing</div>
          <h1 className="text-5xl font-light mb-5 leading-tight">
            Unlimited 4K renders,<br />
            <span className="text-amber">on every paid plan</span>
          </h1>
          <p className="text-graphite/50 max-w-lg mx-auto leading-relaxed">
            Renders run on your machine, so we never meter them. Pay only to unlock
            4K, drop the watermark, and add pro features. Start free.
          </p>
        </div>
      </section>

      {/* ── Plans ───────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {DISPLAY_ORDER.map((key) => {
            const tier = TIERS[key];
            const isCreator = key === "creator";
            return (
              <div
                key={key}
                className={[
                  "relative rounded-xl border flex flex-col gap-5 p-6 transition-all duration-200",
                  isCreator
                    ? "border-amber/50 bg-gradient-to-b from-amber/8 to-transparent shadow-glow-amber-sm"
                    : "border-line/60 bg-paper-100 hover:border-line",
                ].join(" ")}
              >
                {isCreator && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Most popular
                  </div>
                )}

                {/* Price block */}
                <div>
                  <div className="text-[9px] uppercase tracking-[0.35em] text-graphite/35 mb-3">{tier.label}</div>
                  <div className="flex items-baseline gap-1.5">
                    {tier.priceUSD === 0 ? (
                      <span className="text-4xl font-light">Free</span>
                    ) : (
                      <>
                        <span className="text-4xl font-light">${tier.priceUSD}</span>
                        <span className="text-graphite/35 text-sm">/mo</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-100 px-2.5 py-1 text-[11px] text-graphite/60">
                    <Zap size={10} className="text-amber" />
                    {tier.unlimited
                      ? "Unlimited 4K renders"
                      : tier.maxRenders != null
                        ? `${tier.maxRenders} free animation${tier.maxRenders === 1 ? "" : "s"}`
                        : `${tier.minutesPerMonth} min/mo`}
                  </div>
                </div>

                {/* Feature list */}
                <ul className="space-y-2 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-graphite/60">
                      <Check size={12} className="text-amber mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {tier.priceUSD === 0 ? (
                  <Link
                    href="/sign-up"
                    className="block rounded-lg py-2.5 text-center text-xs font-semibold bg-paper-100 text-graphite hover:bg-paper-200 border border-line transition-colors"
                  >
                    Start for free
                  </Link>
                ) : (
                  <PricingCheckoutButton
                    priceId={tier.stripePriceId}
                    label={`Get ${tier.label}`}
                    highlighted={isCreator}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Enterprise strip */}
        <div className="mt-6 rounded-xl border border-line/60 bg-paper-100 p-7 flex flex-col md:flex-row items-center justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-graphite mb-1">Enterprise</div>
            <p className="text-xs text-graphite/45 max-w-md">
              Need team seats at scale, white-label, an API, or a custom production
              deal? We&apos;ll set up a plan that fits your pipeline.
            </p>
          </div>
          <a
            href="mailto:michaandguadi@gmail.com?subject=Mapanisy Enterprise Plan"
            className="shrink-0 rounded-lg border border-amber/30 bg-amber/8 px-5 py-2.5 text-xs font-semibold text-amber hover:bg-amber/15 transition-colors"
          >
            Contact us →
          </a>
        </div>
      </section>

      {/* ── FAQ / contact strip ─────────────────────────────────────────── */}
      <div className="border-t border-line/60 py-12 px-6 text-center text-xs text-graphite/30">
        Questions? Email{" "}
        <a href="mailto:michaandguadi@gmail.com" className="text-amber hover:underline">
          michaandguadi@gmail.com
        </a>
      </div>
    </div>
  );
}
