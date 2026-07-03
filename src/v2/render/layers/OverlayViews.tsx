import React from "react";
import { useVideoConfig } from "remotion";
import { LabelLayer, FlagLayer, MarkerLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul, displayFont, useTheme, outlineStyle, textShadow, tfStyle } from "./renderHelpers";

// ── LabelView ───────────────────────────────────────────────────────────────

export const LabelView: React.FC<LV<LabelLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;

  const font = displayFont(theme, l.fontFamily);
  const sz = l.sizePx;
  const shadow = l.shadow > 0 ? textShadow(l.shadow) : undefined;

  let x: number | string = "50%";
  let y: number | string = "85%";
  if (l.anchor.kind === "coord" && project) {
    const pt = project(l.anchor.lon, l.anchor.lat);
    x = pt.x;
    y = pt.y;
  } else if (l.anchor.kind === "screen") {
    x = "50%";
    y = l.anchor.pos === "top" ? "8%" : l.anchor.pos === "center" ? "50%" : "88%";
  }

  const base: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    transform: `translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`,
    opacity: tr.opacity,
    pointerEvents: "none",
    fontFamily: font,
    textAlign: "center",
  };

  if (l.variant === "pin") {
    return (
      <div style={base}>
        <div style={{ ...outlineStyle(l.outline, sz * 0.04), fontSize: sz, fontWeight: 800, color: l.color, textShadow: shadow, letterSpacing: 1 }}>{l.text}</div>
        {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.1, fontWeight: 600, textShadow: shadow }}>{l.sub}</div>}
        <div style={{ width: sz * 0.12, height: sz * 0.35, background: l.accent, margin: `${sz * 0.12}px auto 0`, borderRadius: sz * 0.06 }} />
      </div>
    );
  }

  if (l.variant === "card") {
    return (
      <div style={{ ...base, transform: `translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}` }}>
        <div style={{ display: "inline-block", padding: `${sz * 0.3}px ${sz * 0.6}px`, background: "rgba(6,8,15,0.85)", border: `${Math.max(2, sz * 0.04)}px solid ${l.accent}`, borderRadius: sz * 0.16, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
          <div style={{ fontSize: sz, fontWeight: 800, color: l.color, ...outlineStyle(l.outline, sz * 0.04) }}>{l.text}</div>
          {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.12, fontWeight: 600 }}>{l.sub}</div>}
        </div>
      </div>
    );
  }

  if (l.variant === "lower-third") {
    return (
      <div style={{ position: "absolute", left: "5%", bottom: "10%", transform: timingTransform(tr), opacity: tr.opacity, pointerEvents: "none", fontFamily: font }}>
        <div style={{ display: "inline-block", padding: `${sz * 0.22}px ${sz * 0.5}px`, borderLeft: `${Math.max(4, sz * 0.08)}px solid ${l.accent}`, background: "rgba(6,8,15,0.78)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          <div style={{ fontSize: sz, fontWeight: 800, color: l.color, ...outlineStyle(l.outline, sz * 0.04) }}>{l.text}</div>
          {l.sub && <div style={{ fontSize: sz * 0.5, color: l.accent, marginTop: sz * 0.1, fontWeight: 600 }}>{l.sub}</div>}
        </div>
      </div>
    );
  }

  // banner
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: `translateY(-50%) ${timingTransform(tr)}`, opacity: tr.opacity, pointerEvents: "none", textAlign: "center", background: `${l.accent}cc`, padding: `${sz * 0.4}px 0`, fontFamily: font }}>
      <div style={{ fontSize: sz * 1.1, fontWeight: 900, color: l.color, letterSpacing: 4, textTransform: "uppercase", ...outlineStyle(l.outline, sz * 0.04) }}>{l.text}</div>
      {l.sub && <div style={{ fontSize: sz * 0.55, color: "rgba(255,255,255,0.82)", marginTop: sz * 0.12 }}>{l.sub}</div>}
    </div>
  );
};

// ── FlagView ────────────────────────────────────────────────────────────────

export const FlagView: React.FC<LV<FlagLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;

  const { x, y } = project(l.anchor.lon, l.anchor.lat);
  const sz = l.sizePx;
  const iso = l.iso.toLowerCase();
  // Country code points: e.g. "fr" → 🇫🇷
  const toEmoji = (code: string) =>
    code.toUpperCase().split("").map((c) => String.fromCodePoint(c.codePointAt(0)! + 127397)).join("");
  const emojiFlag = toEmoji(iso);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`,
        opacity: tr.opacity,
        pointerEvents: "none",
        textAlign: "center",
        fontFamily: displayFont(theme),
      }}
    >
      <div style={{ fontSize: sz, lineHeight: 1, filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" }}>{emojiFlag}</div>
      {l.showCode && (
        <div style={{ fontSize: sz * 0.22, fontWeight: 700, color: "#fff", letterSpacing: 2, textTransform: "uppercase", marginTop: sz * 0.08, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          {l.iso.toUpperCase()}
        </div>
      )}
    </div>
  );
};

// ── MarkerView ──────────────────────────────────────────────────────────────

const MARKER_ICONS: Record<string, string> = {
  pin: "📍", dot: "⚪", star: "⭐", diamond: "💎", circle: "⭕",
  camera: "📷", flag: "🚩", heart: "❤️", warning: "⚠️", info: "ℹ️",
};

export const MarkerView: React.FC<LV<MarkerLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;

  const { x, y } = project(l.anchor.lon, l.anchor.lat);
  const sz = l.sizePx;
  const icon = l.emoji || MARKER_ICONS[l.icon] || "📍";

  // Animation modifiers
  const pulse = l.animation === "pulse" || l.animation === "throb"
    ? 1 + 0.15 * Math.sin((frame / fps) * Math.PI * 2)
    : 1;
  const spin = l.animation === "spin"
    ? { transform: `rotate(${(frame / fps) * 180}deg)` }
    : {};
  const flash = l.animation === "flash"
    ? (Math.floor(frame / 8) % 2 === 0 ? 1 : 0.3)
    : 1;

  const glowSz = sz * 1.6 * (1 + l.glow * 0.4);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%,-50%) scale(${pulse}) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`,
        opacity: tr.opacity * flash,
        pointerEvents: "none",
        textAlign: "center",
        fontFamily: displayFont(theme),
      }}
    >
      {l.glow > 0 && l.ring && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: glowSz,
            height: glowSz,
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            border: `${Math.max(2, sz * 0.06)}px solid ${l.color}`,
            opacity: 0.4 * l.glow * (0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 2)),
          }}
        />
      )}
      <div style={{ fontSize: sz, lineHeight: 1, ...spin, filter: l.glow > 0 ? `drop-shadow(0 0 ${sz * l.glow * 0.3}px ${l.color})` : undefined }}>{icon}</div>
      {l.label && (
        <div style={{ fontSize: sz * 0.28, fontWeight: 700, color: l.labelColor, marginTop: sz * 0.08, textShadow: textShadow(0.7), whiteSpace: "nowrap" }}>
          {l.label}
        </div>
      )}
    </div>
  );
};
