import React from "react";
import type { RouteIconPreset } from "@/lib/types";

/**
 * Vehicle icons — simple geometric shapes matching the Lucide aesthetic.
 * Each preset is a centered 24×24 SVG. The colored circle behind the icon
 * provides a strong contrast disk so the icon reads against any basemap.
 */
export const RouteIcon: React.FC<{
  preset: RouteIconPreset;
  customUrl?: string;
  size: number;
  color: string;
  casing: string;
}> = ({ preset, customUrl, size, color, casing }) => {
  if (preset === "custom" && customUrl) {
    return (
      <img
        src={customUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  const disk = (
    <>
      <circle cx="12" cy="12" r="11" fill={color} />
      <circle cx="12" cy="12" r="11" fill="none" stroke={casing} strokeWidth="0.6" opacity="0.5" />
    </>
  );

  // Icon path color on top of the colored disk = the casing (dark)
  const fg = casing;
  const sw = 1.6;
  const common = { fill: "none", stroke: fg, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (preset) {
    case "car":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          {/* Lucide: car */}
          <path {...common} d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
          <circle cx="6.5" cy="16.5" r="2" {...common} />
          <circle cx="16.5" cy="16.5" r="2" {...common} />
        </svg>
      );
    case "bike":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          {/* Lucide: bike */}
          <circle cx="6.5" cy="17" r="2.5" {...common} />
          <circle cx="17.5" cy="17" r="2.5" {...common} />
          <path {...common} d="M6.5 17l3-5h5l3 5M14.5 12l-2-4h-2M14.5 8l1.5 0" />
        </svg>
      );
    case "walking":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          {/* Lucide-inspired: person */}
          <circle cx="13" cy="5" r="1.7" fill={fg} />
          <path {...common} d="M9 20l3-6 2 2 1 4M9 14l3-6 3 4" />
        </svg>
      );
    case "boat":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          {/* Lucide: ship */}
          <path {...common} d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" />
          <path {...common} d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76" />
          <path {...common} d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6M12 10v3M12 2v3" />
        </svg>
      );
    case "aircraft":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          {/* Lucide: plane (rotated 0 = pointing up) */}
          <path
            d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
            fill={fg}
            stroke={fg}
            strokeWidth="0.4"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {disk}
          <circle cx="12" cy="12" r="4" fill={fg} />
        </svg>
      );
  }
};
