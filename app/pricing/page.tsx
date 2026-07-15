import Link from "next/link";
import { Check, Zap, ArrowLeft } from "lucide-react";
import { TIERS } from "@/lib/tiers";
import { PricingCheckoutButton } from "@/components/PricingCheckoutButton/PricingCheckoutButton";

export const metadata = { title: "Pricing — Mapanisy" };

const DISPLAY_ORDER = ["free", "creator", "pro"] as const;

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
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
          {DISPLAY_ORDER.map((key) => {
            const tier = TIERS[key];
            const isCreator = key === "creator";
            const isPro = key === "pro";
            const annualSave = tier.priceAnnualUSD
              ? Math.round((1 - tier.priceAnnualUSD / (tier.priceUSD * 12)) * 100)
              : 0;
            return (
              <div
                key={key}
                className={[
                  "relative rounded-xl border flex flex-col gap-5 p-6 transition-all duration-200",
                  isCreator
                    ? "border-amber/50 bg-gradient-to-b from-amber/8 to-transparent shadow-glow-amber-sm"
                    : isPro
                      ? "border-brand/40 bg-gradient-to-b from-brand/[0.06] to-transparent"
                      : "border-line/60 bg-paper-100 hover:border-line",
                ].join(" ")}
              >
                {isCreator && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Most popular
                  </div>
                )}
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-graphite px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Pay once · lifetime
                  </div>
                )}

                {/* Price block */}
                <div>
                  <div className="text-[9px] uppercase tracking-[0.35em] text-graphite/35 mb-3">{tier.label}</div>
                  {tier.billing === "free" ? (
                    <div className="flex items-baseline gap-1.5"><span className="text-4xl font-light">Free</span></div>
                  ) : tier.billing === "lifetime" ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-light">${tier.priceUSD}</span>
                        <span className="text-graphite/35 text-sm">once</span>
                      </div>
                      <div className="mt-1.5 text-[11px] font-semibold text-brand">Lifetime — pay once, yours forever</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-light">${tier.priceUSD}</span>
                        <span className="text-graphite/35 text-sm">/mo</span>
                      </div>
                      {tier.priceAnnualUSD != null && (
                        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                          <span className="text-graphite/55">or <span className="font-semibold text-graphite">${tier.priceAnnualUSD}/yr</span></span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">Save {annualSave}%</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-100 px-2.5 py-1 text-[11px] text-graphite/60">
                    <Zap size={10} className="text-amber" />
                    {tier.earlyAccess
                      ? "Everything + early access"
                      : tier.unlimited
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
                {tier.billing === "free" ? (
                  <Link
                    href="/sign-up"
                    className="block rounded-lg py-2.5 text-center text-xs font-semibold bg-paper-100 text-graphite hover:bg-paper-200 border border-line transition-colors"
                  >
                    Start for free
                  </Link>
                ) : (
                  <PricingCheckoutButton
                    priceId={tier.stripePriceId}
                    label={tier.billing === "lifetime" ? "Get lifetime access" : `Get ${tier.label}`}
                    highlighted={isCreator}
                  />
                )}
              </div>
            );
          })}
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
