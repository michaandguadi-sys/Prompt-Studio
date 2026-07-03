import React from "react";
import { AbsoluteFill, useVideoConfig, Img } from "remotion";
import { ImageLayer } from "../../doc/schema";
import { evalTiming, timingTransform } from "../timing";
import { useTheme, LV, kfOpacityMul, anchorXY, tfStyle } from "./renderHelpers";

export const ImageView: React.FC<LV<ImageLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !l.url) return null;
  const a = anchorXY(l.anchor as any, project);
  const w = l.sizePx;
  const content = (
    <>
      <Img src={l.url} style={{ width: w, height: w, objectFit: "cover", borderRadius: l.rounded ? "50%" : 12, border: "3px solid #fff", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }} />
      {l.caption && <div style={{ marginTop: 8, color: "#fff", fontSize: 22, fontFamily: "Inter, sans-serif" }}>{l.caption}</div>}
    </>
  );
  if ((a as any).screen) {
    const pos = (a as any).pos as "bottom" | "top" | "center";
    const vAlign = pos === "top" ? "flex-start" : pos === "center" ? "center" : "flex-end";
    return (
      <AbsoluteFill style={{ justifyContent: vAlign, alignItems: "flex-end", padding: "3.5%", pointerEvents: "none" }}>
        <div data-layer-id={l.id} style={{ transform: `${timingTransform(tr)}${tfStyle(l, vw, vh)}`, opacity: tr.opacity, textAlign: "center" }}>{content}</div>
      </AbsoluteFill>
    );
  }
  return (
    <div data-layer-id={l.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${a.x}px, ${a.y}px) translate(-50%,-50%) ${timingTransform(tr)}${tfStyle(l, vw, vh)}`, willChange: "transform", opacity: tr.opacity, pointerEvents: "none", textAlign: "center" }}>
      {content}
    </div>
  );
};
