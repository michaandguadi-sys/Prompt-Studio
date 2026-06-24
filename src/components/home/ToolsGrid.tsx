"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Map,
  BarChart3,
  Type,
  Users,
  Quote,
  Upload,
  Sparkles,
  ArrowRight,
} from "lucide-react";

/**
 * TOOLS GRID — a prominent bento-style grid of all creative tools. Each card
 * is a direct entry point into a builder, with a clear icon, title, and one-line
 * description. The AI Director gets a hero-width card; the manual tools form a
 * 2x3 grid below it.
 */

type Tool = {
  id: string; label: string; sub: string; href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string; accentBg: string; accentBorder: string; accentText: string;
  featured?: boolean;
};

const TOOLS: Tool[] = [
  {
    id: "animate",
    label: "AI Animation",
    sub: "Describe a story — the director builds a cinematic 4K map animation.",
    href: "/studio2",
    icon: Wand2,
    accent: "from-[#6E7BFF] to-[#B57BFF]",
    accentBg: "bg-[#6E7BFF]/10",
    accentBorder: "border-[#6E7BFF]/20",
    accentText: "text-[#6E7BFF]",
    featured: true,
  },
  {
    id: "map",
    label: "Map Animation",
    sub: "Full manual control — camera, layers, basemap, style.",
    href: "/studio/map",
    icon: Map,
    accent: "from-blue-500 to-blue-400",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/20",
    accentText: "text-blue-500",
  },
  {
    id: "dataviz",
    label: "Data Viz",
    sub: "Animated bar charts, pie charts, and data overlays.",
    href: "/studio/dataviz",
    icon: BarChart3,
    accent: "from-emerald-500 to-emerald-400",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/20",
    accentText: "text-emerald-500",
  },
  {
    id: "title",
    label: "Title Card",
    sub: "Full-screen animated titles with custom typography.",
    href: "/studio/title",
    icon: Type,
    accent: "from-[#6E7BFF] to-[#4F59E0]",
    accentBg: "bg-[#6E7BFF]/10",
    accentBorder: "border-[#6E7BFF]/20",
    accentText: "text-[#6E7BFF]",
  },
  {
    id: "lowerthird",
    label: "Lower Third",
    sub: "Broadcast-style name/title overlays — animated.",
    href: "/studio/lowerthird",
    icon: Users,
    accent: "from-purple-500 to-purple-400",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/20",
    accentText: "text-purple-500",
  },
  {
    id: "quote",
    label: "Quote Card",
    sub: "Animated quote overlays with attribution.",
    href: "/studio/quote",
    icon: Quote,
    accent: "from-rose-500 to-rose-400",
    accentBg: "bg-rose-500/10",
    accentBorder: "border-rose-500/20",
    accentText: "text-rose-500",
  },
] as const;

export const ToolsGrid: React.FC = () => {
  const router = useRouter();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => router.push(t.href)}
          className={[
            "group relative flex flex-col gap-3 overflow-hidden rounded-2xl card-light p-5 text-left transition-all duration-200",
            "hover:-translate-y-1 hover:shadow-floaty",
            t.featured ? "sm:col-span-3 sm:flex-row sm:items-center sm:gap-5" : "",
          ].join(" ")}
        >
          {/* Hover glow */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: t.featured
                ? "linear-gradient(135deg, rgba(110,123,255,0.08) 0%, rgba(181,123,255,0.06) 100%)"
                : "linear-gradient(135deg, rgba(110,123,255,0.06) 0%, transparent 60%)",
            }}
          />

          {/* Icon */}
          <div
            className={[
              "relative flex items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-110",
              t.accentBg,
              t.accentBorder,
              t.featured ? "h-12 w-12" : "h-10 w-10",
            ].join(" ")}
          >
            <t.icon size={t.featured ? 22 : 18} className={t.accentText} />
          </div>

          {/* Text */}
          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-graphite ${t.featured ? "text-[16px]" : "text-[14px]"}`}>
                {t.label}
              </span>
              {t.featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#6E7BFF] to-[#B57BFF] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  <Sparkles size={9} /> AI
                </span>
              )}
            </div>
            <p className={`mt-0.5 text-graphite/50 ${t.featured ? "text-[13px]" : "text-[11px]"}`}>
              {t.sub}
            </p>
          </div>

          {/* Arrow on hover */}
          <div className="relative flex shrink-0 items-center opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2">
            <ArrowRight size={t.featured ? 18 : 14} className="text-graphite/40" />
          </div>
        </button>
      ))}
    </div>
  );
};
