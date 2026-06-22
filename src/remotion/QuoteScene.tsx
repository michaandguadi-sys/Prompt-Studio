"use client";

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneSpec, QuoteSceneSpec } from "@/lib/types";

export const QuoteScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const s = spec.scene as QuoteSceneSpec;
  const { palette, fonts, labelTypography, letterboxHeight } = spec.style;
  const fontFamily = `'${fonts.primary.family}', 'Georgia', serif`;

  const animation = s.animation ?? "fade-up";
  const accent = s.accentColor ?? palette.borderColor;
  const fontScale = s.fontScale ?? 1;
  const maxWidthPct = s.maxWidthPct ?? 0.8;

  const op = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 12, s.reveal.outFrame - 18, s.reveal.outFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const liftRaw = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 24],
    [30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scaleRaw = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 24],
    [0.92, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const lift = animation === "fade-up" ? liftRaw : 0;
  const scale = animation === "scale" ? scaleRaw : 1;

  const bg =
    s.background === "transparent"
      ? "transparent"
      : s.background === "gradient"
        ? `radial-gradient(ellipse at center, ${palette.fillColor}55 0%, #06080f 75%)`
        : "#06080f";

  const align: React.CSSProperties = s.variant === "left"
    ? { textAlign: "left", paddingLeft: Math.round(spec.width * 0.1), alignItems: "flex-start" }
    : { textAlign: "center", alignItems: "center" };

  const quoteSize = Math.round(labelTypography.titleSize * 1.4 * fontScale);
  const attrSize = Math.round(labelTypography.subSize * 1.1 * fontScale);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: `0 ${Math.round(spec.width * 0.1)}px`,
          opacity: op,
          transform: `translateY(${lift}px) scale(${scale})`,
          ...align,
        }}
      >
        {/* The big quote */}
        <div
          style={{
            fontFamily,
            fontSize: quoteSize,
            fontWeight: 300,
            lineHeight: 1.15,
            color: "#ffffff",
            letterSpacing: -1,
            maxWidth: Math.round(spec.width * maxWidthPct),
            position: "relative",
          }}
        >
          {s.showQuoteMarks && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: s.variant === "left" ? -Math.round(quoteSize * 0.7) : "auto",
                top: -Math.round(quoteSize * 0.45),
                fontSize: Math.round(quoteSize * 1.8),
                color: accent,
                opacity: 0.7,
                lineHeight: 1,
              }}
            >
              “
            </span>
          )}
          {s.quote}
        </div>

        {/* Attribution */}
        <div
          style={{
            marginTop: 60,
            fontFamily: `'${fonts.primary.family}', 'Inter', Arial, sans-serif`,
            fontSize: attrSize,
            fontWeight: 400,
            letterSpacing: labelTypography.subSpacing,
            color: accent,
          }}
        >
          — {s.attribution}
        </div>
        {s.context && (
          <div
            style={{
              marginTop: 10,
              fontFamily: `'${fonts.primary.family}', 'Inter', Arial, sans-serif`,
              fontSize: Math.round(attrSize * 0.7),
              fontWeight: 300,
              letterSpacing: Math.round(labelTypography.subSpacing * 0.8),
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {s.context}
          </div>
        )}
      </AbsoluteFill>

      {/* Letterbox */}
      {s.background !== "transparent" && letterboxHeight > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: letterboxHeight,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: letterboxHeight,
            background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))" }} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
