"use client";

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneSpec, TitleSceneSpec } from "@/lib/types";

export const TitleScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const s = spec.scene as TitleSceneSpec;
  const { palette, fonts, labelTypography, letterboxHeight } = spec.style;

  // ── Resolve adjustable knobs (all optional → sensible fallbacks) ───────
  const template = s.template ?? "classic";
  const align = s.align ?? (s.variant === "left" ? "left" : "center");
  const position = s.position ?? "center";
  const titleScale = s.titleScale ?? 1;
  const accent = s.accentColor ?? palette.borderColor;
  const titleColor = s.titleColor ?? "#ffffff";
  const titleWeight = s.titleWeight ?? 200;
  const animation = s.animation ?? "fade-up";
  const maxWidthPct = s.maxWidthPct ?? 0.84;

  const serif = template === "serif";
  const fontFamily = serif
    ? `'Georgia', 'Times New Roman', serif`
    : `'${fonts.primary.family}', 'Inter', Arial, sans-serif`;

  const titleText = s.uppercaseTitle ? (s.title ?? "").toUpperCase() : s.title;
  const titleSize = labelTypography.titleSize * 1.8 * titleScale;

  // ── Entrance animation ─────────────────────────────────────────────────
  const inF = s.reveal.inFrame;
  const outF = s.reveal.outFrame;
  const op = interpolate(frame, [inF, inF + 8, outF - 12, outF], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const slideY =
    animation === "fade-up"
      ? interpolate(frame, [inF, inF + 14], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 0;
  const scale =
    animation === "scale"
      ? interpolate(frame, [inF, inF + 16], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;
  const wipe =
    animation === "wipe"
      ? interpolate(frame, [inF, inF + 18], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 100;

  // ── Background ─────────────────────────────────────────────────────────
  const bgStyle: React.CSSProperties =
    s.background === "transparent"
      ? { background: "transparent" }
      : s.background === "gradient"
        ? { background: `radial-gradient(ellipse at center, ${palette.fillColor}66 0%, #06080f 75%)` }
        : { background: "#06080f" };

  const justify =
    position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center";
  const textAlign = align as React.CSSProperties["textAlign"];
  const itemsAlign = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  // Horizontal padding for non-centered placements.
  const sidePad = align === "center" ? 0 : spec.width * 0.08;
  const vertPad = position === "center" ? 0 : spec.height * 0.1;

  // ── Per-template title node ────────────────────────────────────────────
  const kickerNode = s.kicker ? renderKicker(template, s.kicker, accent, fontFamily, labelTypography) : null;

  const titleNode =
    animation === "word-reveal" || template === "word-reveal" ? (
      <WordReveal
        text={titleText ?? ""}
        frame={frame}
        startFrame={inF}
        style={{
          fontFamily,
          fontSize: titleSize,
          fontWeight: titleWeight,
          letterSpacing: labelTypography.titleSpacing * 0.6,
          lineHeight: 1.05,
          color: titleColor,
          textShadow: `0 0 80px ${palette.glowColor}55`,
        }}
      />
    ) : (
      <div
        style={{
          fontFamily,
          fontSize: titleSize,
          fontWeight: titleWeight,
          letterSpacing: labelTypography.titleSpacing * (serif ? 0.2 : 0.6),
          lineHeight: 1.05,
          color: titleColor,
          fontStyle: serif ? "normal" : undefined,
          textShadow:
            template === "impact"
              ? `0 6px 40px rgba(0,0,0,0.5)`
              : `0 0 80px ${palette.glowColor}55`,
          // wipe reveal via clip-path
          clipPath: animation === "wipe" ? `inset(0 ${100 - wipe}% 0 0)` : undefined,
        }}
      >
        {titleText}
      </div>
    );

  const subtitleNode = s.subtitle ? (
    <div
      style={{
        marginTop: template === "stacked" ? 14 : 40,
        fontFamily,
        fontSize: labelTypography.subSize * (template === "stacked" ? 1.0 : 1.4),
        fontWeight: 300,
        fontStyle: serif ? "italic" : "normal",
        letterSpacing: labelTypography.subSpacing,
        color: "rgba(255,255,255,0.72)",
      }}
    >
      {s.subtitle}
    </div>
  ) : null;

  // Template decorations (underline / rule / accent bar).
  const underline =
    template === "impact" || s.variant === "split" ? (
      <div
        style={{
          marginTop: 36,
          alignSelf: itemsAlign,
          width: template === "impact" ? 320 : 220,
          height: template === "impact" ? 8 : 2,
          background: accent,
          borderRadius: 4,
          // grow-in
          transform: `scaleX(${interpolate(frame, [inF + 6, inF + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`,
          transformOrigin: align === "center" ? "center" : "left",
        }}
      />
    ) : template === "serif" ? (
      <div
        style={{
          margin: "28px auto 0",
          alignSelf: itemsAlign,
          width: 120,
          height: 1,
          background: accent,
          opacity: 0.8,
        }}
      />
    ) : null;

  // Stacked template gets a left accent bar wrapping the text block.
  const useLeftBar = template === "stacked";

  const block = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: itemsAlign,
        maxWidth: spec.width * maxWidthPct,
        paddingLeft: useLeftBar ? 40 : 0,
        borderLeft: useLeftBar ? `8px solid ${accent}` : undefined,
      }}
    >
      {template !== "impact" && kickerNode}
      {template === "impact" && kickerNode}
      {titleNode}
      {underline}
      {subtitleNode}
    </div>
  );

  return (
    <AbsoluteFill style={bgStyle}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: justify,
          alignItems: itemsAlign,
          textAlign,
          paddingLeft: sidePad,
          paddingRight: sidePad,
          paddingTop: position === "top" ? vertPad : 0,
          paddingBottom: position === "bottom" ? vertPad : 0,
          transform: `translateY(${slideY}px) scale(${scale})`,
          opacity: op,
        }}
      >
        {block}
      </AbsoluteFill>

      {s.background !== "transparent" && letterboxHeight > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: letterboxHeight,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: letterboxHeight,
              background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ── Kicker variants ──────────────────────────────────────────────────────
function renderKicker(
  template: string,
  kicker: string,
  accent: string,
  fontFamily: string,
  lt: SceneSpec["style"]["labelTypography"],
): React.ReactNode {
  if (template === "kicker-box") {
    return (
      <div
        style={{
          display: "inline-block",
          padding: "10px 22px",
          marginBottom: 28,
          background: accent,
          color: "#06080f",
          fontFamily,
          fontSize: lt.subSize * 1.0,
          fontWeight: 700,
          letterSpacing: lt.subSpacing * 1.2,
          textTransform: "uppercase",
          borderRadius: 4,
        }}
      >
        {kicker}
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily,
        fontSize: lt.subSize * 1.2,
        fontWeight: 300,
        letterSpacing: lt.subSpacing * 1.6,
        color: accent,
        marginBottom: template === "impact" ? 24 : 36,
        textTransform: template === "impact" ? "uppercase" : undefined,
      }}
    >
      {kicker}
    </div>
  );
}

// ── Word-by-word reveal ────────────────────────────────────────────────────
const WordReveal: React.FC<{
  text: string;
  frame: number;
  startFrame: number;
  style: React.CSSProperties;
}> = ({ text, frame, startFrame, style }) => {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ ...style, display: "flex", flexWrap: "wrap", gap: "0 0.28em", justifyContent: "inherit" }}>
      {words.map((w, i) => {
        const wStart = startFrame + i * 4;
        const o = interpolate(frame, [wStart, wStart + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const y = interpolate(frame, [wStart, wStart + 10], [28, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span key={i} style={{ display: "inline-block", opacity: o, transform: `translateY(${y}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};
