"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wand2, Clapperboard, Sparkles, Gauge } from "lucide-react";
import { SidebarQuotaBar } from "@/components/SidebarQuotaBar/SidebarQuotaBar";
import { UserButton } from "@clerk/nextjs";

/**
 * Studio rail — dark cinematic, matching the landing. Slim icon column:
 * Create · Animate · Projects · Brand up top, Account at the bottom. The legacy
 * per-kind builders are gone — everything flows through the AI map editor.
 */
export const StudioSidebar: React.FC = () => {
  const path = usePathname() || "";
  const isActive = (href: string) =>
    href === "/home" ? path === "/home" : path.startsWith(href);

  return (
    <nav className="relative z-20 flex w-[72px] flex-col items-center gap-1 border-r border-line bg-paper-50 py-3.5">
      {/* Logo */}
      <Link href="/home" className="relative mb-3 flex items-center justify-center" title="Mapanisy">
        <span className="absolute inset-0 rounded-2xl opacity-70 blur-md" aria-hidden style={{ background: "linear-gradient(135deg,#6E7BFF,#2FE0FF)" }} />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 8px 24px -6px rgba(110,123,255,0.7)" }}>
          <span className="text-[15px] font-black tracking-tight">M</span>
        </span>
      </Link>

      {/* Primary nav */}
      <div className="flex w-full flex-col items-center gap-0.5 px-2">
        <NavItem href="/home" icon={<Home size={17} />} label="Create" active={isActive("/home")} />
        <NavItem href="/studio2" icon={<Wand2 size={17} />} label="Animate" active={isActive("/studio2")} />
        <NavItem href="/projects" icon={<Clapperboard size={17} />} label="Films" active={isActive("/projects")} />
        <NavItem href="/brand" icon={<Sparkles size={17} />} label="Brand" active={isActive("/brand")} />
      </div>

      {/* Bottom */}
      <div className="mt-auto flex flex-col items-center gap-3 pb-1">
        <NavItem href="/dashboard" icon={<Gauge size={17} />} label="Account" active={isActive("/dashboard")} />
        <SidebarQuotaBar />
        <div className="scale-90">
          <UserButton />
        </div>
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
      active ? "text-iris" : "text-graphite-muted hover:text-graphite",
    ].join(" ")}
  >
    {active && <span className="absolute inset-0 rounded-xl border border-iris/25 bg-iris/[0.10]" aria-hidden />}
    {active && <span className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#6E7BFF] to-[#2FE0FF]" aria-hidden />}
    <span className="relative transition-transform duration-200 group-hover:-translate-y-px group-hover:scale-110">{icon}</span>
    <span className="relative text-[8px] font-semibold uppercase tracking-[0.16em] opacity-90">{label}</span>
    <span className="pointer-events-none absolute left-full z-50 ml-3 translate-x-1 whitespace-nowrap rounded-lg border border-white/12 bg-[#1a2036] px-2.5 py-1 text-[11px] text-white/90 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
      {label}
    </span>
  </Link>
);
