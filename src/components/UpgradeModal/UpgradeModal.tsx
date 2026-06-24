"use client";

import React from "react";
import { X, Zap, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { TIERS } from "@/lib/tiers";

export const UpgradeModal: React.FC<{
  open: boolean;
  onClose: () => void;
  usedMinutes?: number;
  limitMinutes?: number;
  usedRenders?: number;
  maxRenders?: number | null;
  unit?: "animation" | "minute";
  tier?: string;
}> = ({ open, onClose, usedMinutes, limitMinutes, usedRenders, maxRenders, unit, tier }) => {
  if (!open) return null;
  const tierCfg = tier && tier in TIERS ? TIERS[tier as keyof typeof TIERS] : null;
  const isCount = unit === "animation";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-amber/30 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
          <div className="flex items-center gap-2 text-amber">
            <Zap size={16} />
            <span className="text-sm font-semibold uppercase tracking-wider">Quota reached</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-white/70 text-sm">
            {isCount ? (
              <>
                You&apos;ve used your{" "}
                <span className="text-white font-semibold">
                  {maxRenders ?? "—"} free animation{maxRenders === 1 ? "" : "s"}
                </span>{" "}
                on the {tierCfg ? tierCfg.label : "Free"} plan.
              </>
            ) : (
              <>
                You&apos;ve used{" "}
                <span className="text-white font-semibold">
                  {usedMinutes !== undefined ? `${usedMinutes.toFixed(1)} min` : "—"}
                </span>{" "}
                of your{" "}
                <span className="text-white font-semibold">
                  {limitMinutes !== undefined ? `${limitMinutes} min` : "—"}
                </span>{" "}
                {tierCfg ? `${tierCfg.label} plan` : "plan"} allowance this month.
              </>
            )}
          </p>
          <p className="text-white/50 text-sm">
            Upgrade to keep rendering. Your scenes and settings are saved — pick up right where you left off.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {(["creator", "teams", "custom"] as const).map((t) => {
              const tc = TIERS[t];
              return (
                <div key={t} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-amber mb-1">{tc.label}</div>
                  <div className="text-sm font-semibold text-white">{tc.unlimited ? "Unlimited" : `${tc.minutesPerMonth} min`}</div>
                  <div className="text-[10px] text-white/40">${tc.priceUSD}/mo</div>
                </div>
              );
            })}
          </div>

          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-amber/90 transition"
            onClick={onClose}
          >
            View plans &amp; upgrade
            <ArrowUpRight size={14} />
          </Link>
          <button
            onClick={onClose}
            className="w-full text-xs text-white/40 hover:text-white/70 transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
