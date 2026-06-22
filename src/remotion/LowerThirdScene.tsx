"use client";

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneSpec, LowerThirdSceneSpec } from "@/lib/types";

export const LowerThirdScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const s = spec.scene as LowerThirdSceneSpec;
  const { palette, fonts, labelTypography } = spec.style;
  const fontFamily = `'${fonts.primary.family}', 'Inter', Arial, sans-serif`;

  const animation = s.animation ?? "slide";
  const fontScale = s.fontScale ?? 1;
  const accent = s.accentColor ?? palette.borderColor;
  const titleSize = labelTypography.titleSize * fontScale;
  const subSize = labelTypography.subSize * fontScale;

  const op = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 8, s.reveal.outFrame - 16, s.reveal.outFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const slideXRaw = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 14],
    [s.position === "left" ? -80 : 80, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const slideX = animation === "slide" ? slideXRaw : 0;
  // Wipe: clip-path reveals the block left→right (or right→left).
  const wipePct = interpolate(
    frame,
    [s.reveal.inFrame, s.reveal.inFrame + 16],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const clipPath =
    animation === "wipe"
      ? s.position === "left"
        ? `inset(0 ${100 - wipePct}% 0 0)`
        : `inset(0 0 0 ${100 - wipePct}%)`
      : undefined;
  const barW = interpolate(
    frame,
    [s.reveal.inFrame + 4, s.reveal.inFrame + 20],
    [0, 12],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const sideStyles: React.CSSProperties =
    s.position === "left"
      ? { left: spec.width * 0.06, alignItems: "flex-start", textAlign: "left" }
      : {
          right: spec.width * 0.06,
          left: "auto",
          alignItems: "flex-end",
          textAlign: "right",
        };

  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <div
        style={{
          position: "absolute",
          bottom: spec.height * 0.12,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          opacity: op,
          transform: `translateX(${slideX}px)`,
          clipPath,
          ...sideStyles,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28, flexDirection: s.position === "left" ? "row" : "row-reverse" }}>
          {s.accentBar && (
            <div
              style={{
                width: barW,
                height: titleSize * 1.3,
                background: accent,
                boxShadow: `0 0 24px ${palette.glowColor}cc`,
              }}
            />
          )}
          <div
            style={{
              padding: "18px 36px",
              background: "rgba(6,8,15,0.7)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${palette.borderColor}55`,
            }}
          >
            <div
              style={{
                fontFamily,
                fontSize: titleSize,
                fontWeight: 300,
                letterSpacing: labelTypography.titleSpacing * 0.7,
                color: "#ffffff",
                lineHeight: 1,
              }}
            >
              {s.name}
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily,
                fontSize: subSize,
                fontWeight: 300,
                letterSpacing: labelTypography.subSpacing,
                color: accent,
                opacity: 0.92,
              }}
            >
              {s.role}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
