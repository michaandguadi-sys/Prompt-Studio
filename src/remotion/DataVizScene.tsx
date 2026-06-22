"use client";

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  spring,
  useVideoConfig,
} from "remotion";
import type { SceneSpec, DataVizSceneSpec } from "@/lib/types";

const formatNumber = (
  n: number,
  prefix = "",
  suffix = "",
  decimals = 0,
  separator = true,
) => {
  const body = n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: separator,
  });
  return `${prefix}${body}${suffix}`;
};

export const DataVizScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene = spec.scene as DataVizSceneSpec;
  const { palette, fonts, labelTypography } = spec.style;
  const fontFamily = `'${fonts.primary.family}', 'Inter', Arial, sans-serif`;
  // Per-scene accent override (counter / bars / line / dots). Falls back to palette.
  const accent = scene.accentColor ?? palette.borderColor;

  const titleOp = interpolate(
    frame,
    [scene.reveal.inFrame, scene.reveal.inFrame + 8, scene.reveal.outFrame - 12, scene.reveal.outFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const valueProgress = spring({
    frame: frame - scene.reveal.inFrame - 4,
    fps,
    config: { damping: 18, mass: 0.9 },
    durationInFrames: scene.reveal.holdFrame - scene.reveal.inFrame,
  });

  return (
    <AbsoluteFill style={{ background: "#06080f" }}>
      {/* Title bar (top) */}
      <div
        style={{
          position: "absolute",
          top: "16%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOp,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: labelTypography.subSize * 1.2,
            fontWeight: 300,
            letterSpacing: labelTypography.subSpacing,
            color: accent,
            opacity: 0.9,
          }}
        >
          {scene.labels.subtitle}
        </div>
        <div
          style={{
            marginTop: 32,
            fontFamily,
            fontSize: labelTypography.titleSize * 0.7,
            fontWeight: 300,
            letterSpacing: labelTypography.titleSpacing * 0.6,
            color: "#ffffff",
          }}
        >
          {scene.labels.title}
        </div>
      </div>

      {/* Main visual */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {scene.variant === "counter" && (
          <CounterReveal
            value={(scene.data.value ?? 0) * valueProgress}
            prefix={scene.data.prefix}
            suffix={scene.data.suffix}
            decimals={scene.data.decimals ?? 0}
            separator={scene.data.separator ?? true}
            opacity={titleOp}
            palette={palette}
            accent={accent}
            fontFamily={fontFamily}
            width={spec.width}
          />
        )}
        {scene.variant === "bar" && (
          <BarReveal
            bars={scene.data.bars ?? []}
            progress={valueProgress}
            opacity={titleOp}
            palette={palette}
            accent={accent}
            fontFamily={fontFamily}
          />
        )}
        {scene.variant === "line" && (
          <LineReveal
            points={scene.data.points ?? []}
            progress={valueProgress}
            opacity={titleOp}
            palette={palette}
            accent={accent}
            fontFamily={fontFamily}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const CounterReveal: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  separator?: boolean;
  opacity: number;
  palette: SceneSpec["style"]["palette"];
  accent: string;
  fontFamily: string;
  width: number;
}> = ({ value, prefix, suffix, decimals, separator, opacity, palette, accent, fontFamily, width }) => (
  <div style={{ textAlign: "center", opacity }}>
    <div
      style={{
        fontFamily,
        fontSize: width * 0.12,
        fontWeight: 200,
        letterSpacing: -4,
        color: accent,
        textShadow: `0 0 80px ${palette.glowColor}99`,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatNumber(value, prefix, suffix, decimals, separator)}
    </div>
  </div>
);

const BarReveal: React.FC<{
  bars: { label: string; value: number }[];
  progress: number;
  opacity: number;
  palette: SceneSpec["style"]["palette"];
  accent: string;
  fontFamily: string;
}> = ({ bars, progress, opacity, palette, accent, fontFamily }) => {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div
      style={{
        display: "flex",
        gap: 40,
        alignItems: "flex-end",
        height: 800,
        opacity,
      }}
    >
      {bars.map((b, i) => {
        const h = (b.value / max) * 700 * progress;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                fontFamily,
                fontSize: 36,
                color: "#fff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(b.value * progress).toLocaleString()}
            </div>
            <div
              style={{
                width: 180,
                height: h,
                background: `linear-gradient(180deg, ${palette.glowColor}, ${accent})`,
                boxShadow: `0 0 40px ${palette.glowColor}80`,
              }}
            />
            <div
              style={{
                fontFamily,
                fontSize: 28,
                color: "rgba(255,255,255,0.75)",
                letterSpacing: 4,
              }}
            >
              {b.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LineReveal: React.FC<{
  points: { label: string; value: number }[];
  progress: number;
  opacity: number;
  palette: SceneSpec["style"]["palette"];
  accent: string;
  fontFamily: string;
}> = ({ points, progress, opacity, palette, accent, fontFamily }) => {
  if (points.length < 2) return null;
  const W = 1800;
  const H = 600;
  const max = Math.max(...points.map((p) => p.value), 1);
  const visibleCount = Math.max(2, Math.floor(points.length * progress));
  const visible = points.slice(0, visibleCount);
  const path = visible
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - (p.value / max) * H;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg width={W} height={H} style={{ opacity, overflow: "visible" }}>
      <path
        d={path}
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 24px ${palette.glowColor}cc)` }}
      />
      {visible.map((p, i) => {
        const x = (i / (points.length - 1)) * W;
        const y = H - (p.value / max) * H;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={10} fill={accent} />
            <text
              x={x}
              y={H + 50}
              fill="#fff"
              fontSize={28}
              fontFamily={fontFamily}
              textAnchor="middle"
              opacity={0.7}
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
