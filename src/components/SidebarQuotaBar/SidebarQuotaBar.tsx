"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { QuotaResult } from "@/lib/quota";

export const SidebarQuotaBar: React.FC = () => {
  const [quota, setQuota] = useState<QuotaResult | null>(null);

  useEffect(() => {
    fetch("/api/quota")
      .then(async (r) => {
        if (!r.ok) throw new Error("quota failed");
        return r.json();
      })
      .then(setQuota)
      .catch(() => null);
  }, []);

  if (!quota) return null;

  const pct = Math.round(quota.fraction * 100);
  const isNear = pct >= 80;
  const title = quota.unit === "animation"
    ? `${quota.usedRenders} / ${quota.maxRenders} free animation${quota.maxRenders === 1 ? "" : "s"} used`
    : `${quota.usedMinutes.toFixed(1)} / ${quota.limitMinutes} min used`;

  return (
    <Link
      href="/dashboard"
      title={title}
      className="w-10 flex flex-col items-center gap-1 group"
    >
      {/* Mini vertical progress bar */}
      <div className="relative w-1.5 h-8 rounded-full bg-ink-700 overflow-hidden">
        <div
          className={`absolute bottom-0 left-0 right-0 rounded-full transition-all ${
            isNear ? "bg-red-500" : "bg-amber/60"
          }`}
          style={{ height: `${Math.max(4, pct)}%` }}
        />
      </div>
      <span className={`text-[8px] font-mono ${isNear ? "text-red-400" : "text-graphite/40"} group-hover:text-amber transition-colors`}>
        {pct}%
      </span>
    </Link>
  );
};
