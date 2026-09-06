import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { TitleLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { LV, kfOpacityMul, displayFont, textShadow, tfStyle, outlineStyle, useTheme } from "./renderHelpers";

export const TitleView: React.FC<LV<TitleLayer>> = ({ layer: l, frame, fps, totalFrames }) => {
  const theme = useTheme();
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01) return null;
  const vAlign = l.position === "top" ? "flex-start" : l.position === "bottom" ? "flex-end" : "center";
  const hAlign = l.align === "left" ? "flex-start" : l.align === "right" ? "flex-end" : "center";
  const ts = textShadow((l as any).shadow ?? 0.55);
  const tpl = l.template;
  // Length-aware type scale: a 6-word headline must never become a wall of
  // text spanning the frame — long titles step down smoothly (min 55%).
  const fit = Math.max(0.55, Math.min(1, 24 / Math.max(12, l.text.length)));
  const headSize = (tpl === "impact" ? 160 : tpl === "kicker" ? 116 : 122) * fit;
  const headWeight = tpl === "impact" ? 800 : tpl === "split" ? 700 : 300;
  const bar = (w: number, h: number) => <div style={{ height: h, width: w, marginTop: 24, background: l.accent, borderRadius: h / 2, marginLeft: hAlign === "center" ? "auto" : 0, marginRight: hAlign === "center" ? "auto" : 0, boxShadow: `0 0 18px ${l.accent}88` }} />;
  const headline = <div style={{ fontSize: headSize, fontWeight: headWeight, color: l.color, lineHeight: 1.05, letterSpacing: tpl === "impact" ? -2 * fit : -1, maxWidth: "22em", textWrap: "balance" as any, textShadow: ts, ...outlineStyle((l as any).outline, headSize) }}>{l.text}</div>;
  const sub = l.sub ? <div style={{ fontSize: tpl === "kicker" ? 48 : 40, fontWeight: tpl === "kicker" ? 800 : 600, letterSpacing: 6, textTransform: "uppercase", color: l.accent, marginBottom: 16, textShadow: ts }}>{l.sub}</div> : null;
  return (
    <AbsoluteFill style={{ justifyContent: vAlign, alignItems: hAlign, padding: "10%", pointerEvents: "none" }}>
      {tpl === "split" ? (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, display: "flex", alignItems: "stretch", gap: 30, textAlign: "left", fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          <div style={{ width: 12, background: l.accent, borderRadius: 6, boxShadow: `0 0 26px ${l.accent}aa` }} />
          <div>
            {headline}
            {l.sub && <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: l.accent, marginTop: 14, textShadow: ts }}>{l.sub}</div>}
          </div>
        </div>
      ) : tpl === "boxed" ? (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, textAlign: l.align, fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          <div style={{ display: "inline-block", padding: "30px 48px", background: "rgba(6,8,15,0.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `2px solid ${l.accent}`, borderRadius: 20, boxShadow: `0 24px 80px -30px ${l.accent}88` }}>
            {sub}
            {headline}
          </div>
        </div>
      ) : tpl === "lowerthird" ? (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, display: "flex", alignItems: "stretch", gap: 22, textAlign: "left", fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          <div style={{ width: 10, background: l.accent, borderRadius: 5, boxShadow: `0 0 24px ${l.accent}aa` }} />
          <div style={{ background: "linear-gradient(90deg, rgba(6,8,15,0.85), rgba(6,8,15,0.12))", padding: "18px 64px 18px 28px", borderRadius: 8 }}>
            <div style={{ fontSize: 92, fontWeight: 800, color: l.color, lineHeight: 1.04, letterSpacing: -1, textShadow: ts, ...outlineStyle((l as any).outline, 92) }}>{l.text}</div>
            {l.sub && <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: l.accent, marginTop: 8, textShadow: ts }}>{l.sub}</div>}
          </div>
        </div>
      ) : (
        <div data-layer-id={l.id} style={{ opacity: tr.opacity, transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, textAlign: l.align, fontFamily: displayFont(theme, (l as any).fontFamily) }}>
          {tpl === "classic" && bar(70, 3)}
          {sub}
          {headline}
          {tpl === "impact" && bar(160, 8)}
          {tpl === "kicker" && bar(90, 4)}
        </div>
      )}
    </AbsoluteFill>
  );
};
