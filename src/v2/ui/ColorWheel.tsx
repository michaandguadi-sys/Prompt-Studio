"use client";

import React, { useRef } from "react";

/**
 * A grading colour wheel — drag the knob to push a tonal band toward a hue.
 * Angle = hue, distance from centre = saturation. Centre = neutral (no push).
 * Outputs a hex; empty string means "untouched" (knob sits dead-centre).
 * This is the control a colourist reaches for — three of them (shadows / mids /
 * highlights) give a full 3-way grade.
 */

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export const ColorWheel: React.FC<{
  label: string;
  value: string;            // current hex, "" = neutral
  onChange: (hex: string) => void;
  onClear?: () => void;
  size?: number;
}> = ({ label, value, onChange, onClear, size = 78 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const R = size / 2;
  const hsl = value ? hexToHsl(value) : null;
  // knob position from hue/sat (lightness fixed at the grade tone)
  const ang = hsl ? (hsl.h * Math.PI) / 180 : 0;
  const sat = hsl ? Math.min(1, hsl.s) : 0;
  const kx = R + Math.cos(ang) * sat * (R - 6);
  const ky = R + Math.sin(ang) * sat * (R - 6);

  const pick = (clientX: number, clientY: number) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + R), dy = clientY - (rect.top + R);
    const dist = Math.hypot(dx, dy);
    const s = Math.min(1, dist / (R - 6));
    if (s < 0.06) { onClear ? onClear() : onChange(""); return; } // dead-centre = neutral
    let h = (Math.atan2(dy, dx) * 180) / Math.PI; if (h < 0) h += 360;
    onChange(hslToHex(h, s, 0.55));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pick(e.clientX, e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    pick(e.clientX, e.clientY);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onDoubleClick={() => (onClear ? onClear() : onChange(""))}
        title={`${label} — drag to tint, double-click to reset`}
        className="relative cursor-crosshair touch-none rounded-full"
        style={{
          width: size, height: size,
          background: "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        {/* saturation falloff to white centre */}
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at center, #ffffff 0%, rgba(255,255,255,0) 62%)" }} />
        {/* knob */}
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white"
          style={{ left: kx, top: ky, width: 12, height: 12, transform: "translate(-50%,-50%)", background: value || "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
        />
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-graphite/40">{label}</span>
    </div>
  );
};
