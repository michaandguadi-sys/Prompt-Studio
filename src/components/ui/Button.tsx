"use client";

import React from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white font-semibold " +
    "shadow-glow-iris hover:shadow-glow-amber-lg " +
    "border border-white/10 btn-shimmer",
  secondary:
    "bg-ink-800/70 text-white hover:bg-ink-700/80 " +
    "border border-white/10 hover:border-white/20 " +
    "backdrop-blur-sm shadow-inner-glow",
  ghost:
    "bg-transparent text-white/70 hover:text-white hover:bg-white/5",
  danger:
    "bg-red-600/80 text-white hover:bg-red-500 border border-red-500/30",
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
> = ({ variant = "secondary", size = "md", className, children, ...props }) => {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl font-medium",
        "transition-all duration-150 ease-smooth",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none",
        "focus-visible:ring-2 focus-visible:ring-amber/50 focus-visible:outline-none",
        "active:scale-[0.975]",
        "relative overflow-hidden",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};
