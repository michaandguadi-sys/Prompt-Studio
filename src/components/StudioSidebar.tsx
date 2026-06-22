"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, LayoutDashboard, Wand2 } from "lucide-react";
import { SidebarQuotaBar } from "@/components/SidebarQuotaBar/SidebarQuotaBar";
import { UserButton } from "@clerk/nextjs";

/**
 * The DIRECTOR rail — a slim dark-glass navigation column shared by every studio
 * page. Replaces the old white sidebar so the whole app reads as one cohesive
 * cinematic surface. Active route glows iris; everything else stays quiet.
 */
export const StudioSidebar: React.FC = () => {
  const path = usePathname() || "";
  const isActive = (href: string) => (href === "/home" ? path === "/home" : path.startsWith(href));

  return (
    <nav className="relative z-20 flex w-[66px] flex-col items-center gap-1 border-r border-line bg-white py-3.5">
      {/* Logo mark */}
      <Link href="/home" className="relative mb-3 flex items-center justify-center" title="Mapanisy">
        <span className="absolute inset-0 rounded-2xl opacity-70 blur-md" aria-hidden style={{ background: "linear-gradient(135deg,#6E7BFF,#2FE0FF)" }} />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 8px 24px -6px rgba(110,123,255,0.7)" }}>
          <span className="text-[15px] font-black tracking-tight">M</span>
        </span>
      </Link>

      <div className="flex w-full flex-col items-center gap-1 px-2">
        <NavItem href="/home" icon={<Home size={18} />} label="Home" active={isActive("/home")} />
        <NavItem href="/studio2" icon={<Wand2 size={18} />} label="Animate" active={isActive("/studio2")} />
        <NavItem href="/brand" icon={<Sparkles size={18} />} label="Brand" active={isActive("/brand")} />
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pb-1">
        <NavItem href="/dashboard" icon={<LayoutDashboard size={18} />} label="Usage" active={isActive("/dashboard")} />
        <SidebarQuotaBar />
        <div className="scale-90"><UserButton /></div>
      </div>
    </nav>
  );
};

const NavItem: React.FC<{ href: string; icon: React.ReactNode; label: string; active: boolean }> = ({ href, icon, label, active }) => (
  <Link
    href={href}
    title={label}
    className={[
      "group relative flex w-full flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition-all duration-200",
      active ? "text-iris" : "text-graphite/45 hover:text-graphite",
    ].join(" ")}
  >
    {/* Active pill */}
    {active && (
      <span className="absolute inset-0 rounded-xl border border-iris/25 bg-iris/[0.08]" aria-hidden />
    )}
    {/* Active left accent bar */}
    {active && <span className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#6E7BFF] to-[#2FE0FF]" aria-hidden />}
    <span className="relative transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-px">{icon}</span>
    <span className="relative text-[8px] font-semibold uppercase tracking-[0.16em] opacity-80">{label}</span>

    {/* Tooltip */}
    <span className="pointer-events-none absolute left-full z-50 ml-3 translate-x-1 whitespace-nowrap rounded-lg border border-graphite/20 bg-graphite px-2.5 py-1 text-[11px] text-white/90 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
      {label}
    </span>
  </Link>
);
