import React from "react";
import { AbsoluteFill } from "remotion";
import type { TimestampLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { LV, kfOpacityMul, useTheme, displayFont } from "./renderHelpers";

/**
 * Timestamp — the documentary ticker. A date (or day counter) that advances
 * across the layer's visible window: "SEP 1939 → MAY 1945", "DAY 1 → DAY 100".
 * Everything derives from the frame number, so preview and render agree.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const POS: Record<TimestampLayer["position"], React.CSSProperties> = {
  "top-left":      { top: "4.5%", left: "3.2%" },
  "top-center":    { top: "4.5%", left: "50%", transform: "translateX(-50%)" },
  "top-right":     { top: "4.5%", right: "3.2%" },
  "bottom-left":   { bottom: "5%", left: "3.2%" },
  "bottom-center": { bottom: "5%", left: "50%", transform: "translateX(-50%)" },
  "bottom-right":  { bottom: "5%", right: "3.2%" },
};

function parseISO(s: string): number {
  const t = Date.parse(s + "T12:00:00Z"); // noon UTC — immune to TZ day-shifts
  return Number.isFinite(t) ? t : Date.parse("2020-01-01T12:00:00Z");
}

function formatDate(ms: number, format: TimestampLayer["format"]): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions =
    format === "year" ? { year: "numeric", timeZone: "UTC" }
    : format === "full" ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
    : { month: "short", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-GB", opts).format(d).toUpperCase();
}

export const TimestampView: React.FC<LV<TimestampLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;

  // The ticker advances across the layer's VISIBLE window (in → out or end).
  const tSec = frame / fps;
  const from = l.timing.inSec;
  const to = l.timing.outSec ?? totalFrames / fps;
  const p = clamp01(to > from ? (tSec - from) / (to - from) : 1);

  let text: string;
  let subText = "";
  if (l.mode === "fixed") {
    text = l.fixedText || formatDate(parseISO(l.startDate), l.format);
  } else if (l.mode === "day-counter") {
    const day = Math.round(l.dayStart + (l.dayEnd - l.dayStart) * p);
    text = `${l.prefix ? l.prefix + " " : ""}${day}`;
  } else {
    const t0 = parseISO(l.startDate), t1 = parseISO(l.endDate);
    text = formatDate(t0 + (t1 - t0) * p, l.format);
    subText = ""; // the moving date IS the story; keep the chip clean
  }

  const fs = `${l.sizeVh}vh`;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 7 }}>
      <div style={{ position: "absolute", ...POS[l.position], opacity: tr.opacity, transform: `${POS[l.position].transform ?? ""} translateY(${tr.translateY}px) scale(${tr.scale})`.trim() }}>
        {l.style === "chip" ? (
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.7vh",
              background: "rgba(6,8,14,0.72)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "0.7vh", padding: "0.55vh 1.2vh", backdropFilter: "blur(8px)",
            }}
          >
            <span style={{ width: "0.75vh", height: "0.75vh", borderRadius: "50%", background: l.accent, boxShadow: `0 0 8px ${l.accent}` }} />
            <span style={{ fontSize: fs, fontWeight: 700, letterSpacing: "0.08em", color: l.color, fontFamily: displayFont(theme), fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
              {text}
            </span>
            {subText && <span style={{ fontSize: `calc(${fs} * 0.6)`, color: "rgba(255,255,255,0.5)" }}>{subText}</span>}
          </div>
        ) : (
          <span
            style={{
              fontSize: fs, fontWeight: 800, letterSpacing: "0.1em", color: l.color,
              fontFamily: displayFont(theme),
              fontVariantNumeric: "tabular-nums",
              textShadow: "0 2px 14px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)",
            }}
          >
            {text}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
