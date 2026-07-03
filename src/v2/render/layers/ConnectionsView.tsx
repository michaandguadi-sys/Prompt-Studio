import React from "react";
import { ConnectionsLayer } from "../../doc/schema";
import { evalTiming } from "../timing";
import { LV, kfOpacityMul, clampN, displayFont, useTheme } from "./renderHelpers";

export const ConnectionsView: React.FC<LV<ConnectionsLayer>> = ({ layer: l, frame, fps, totalFrames, project }) => {
  const theme = useTheme();
  const tr = evalTiming(l.timing, frame, fps, totalFrames);
  tr.opacity *= kfOpacityMul(l);
  if (tr.opacity < 0.01 || !project) return null;
  const pts = l.points.map((pt) => ({ ...project(pt.lon, pt.lat), name: pt.name }));
  if (pts.length < 1) return null;
  let hub = l.hub ? { ...project(l.hub.lon, l.hub.lat), name: l.hub.name } : null;
  let spokes = pts;
  if (l.mode === "hub" && !hub && pts.length >= 2) { hub = pts[0]; spokes = pts.slice(1); }
  const weights = l.points.map((p: any) => p.weight ?? 1);
  const maxW = Math.max(1, ...weights.filter(isFinite));
  const edges: { a: { x: number; y: number }; b: { x: number; y: number }; w: number }[] = [];
  if (l.mode === "hub" && hub) for (let i = 0; i < spokes.length; i++) edges.push({ a: hub, b: spokes[i], w: weights[i] ?? 1 });
  else for (let i = 0; i < pts.length - 1; i++) edges.push({ a: pts[i], b: pts[i + 1], w: weights[i] ?? 1 });
  if (edges.length === 0) return null;

  const inF = Math.round(l.timing.inSec * fps);
  const totalProg = clampN((frame - inF) / Math.max(1, (totalFrames - inF) * 0.7), 0, 1);
  const stag = 0.12 + l.stagger * 0.8;
  const glowI = l.glow ?? 0.5;
  const allNodes = hub ? [hub, ...spokes] : pts;
  const dashPat = l.dashStyle === "dotted" ? "1 9" : l.dashStyle === "dashed" ? "13 9" : undefined;

  const arc = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
    const cx = (a.x + b.x) / 2 + (-dy / dist) * l.curve * dist * 0.32;
    const cy = (a.y + b.y) / 2 + (dx / dist) * l.curve * dist * 0.32;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };

  return (
    <svg data-layer-id={l.id} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
      {edges.map((e, i) => {
        const d = arc(e.a, e.b);
        const start = (i / edges.length) * stag;
        const ep = clampN((totalProg - start) / Math.max(0.0001, 1 - start), 0, 1);
        const draw = l.reveal === "draw" ? ep : 1;
        const op = (l.reveal === "fade" ? ep : 1) * tr.opacity;
        const wScale = e.w / maxW;
        const baseW = l.reveal === "grow" ? Math.max(0.5, l.width * ep) : l.width;
        const w = Math.max(1, baseW * (0.3 + 0.7 * wScale));
        const drawDash = draw < 1 ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - draw } : (dashPat ? { strokeDasharray: dashPat } : {});
        const particles = l.pulse && draw > 0.5 ? [0, 0.33, 0.66].map((offset) => {
          const t = ((frame / 35 + offset) % 1) * draw;
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, dist = Math.hypot(dx, dy) || 1;
          const cx = (e.a.x + e.b.x) / 2 + (-dy / dist) * l.curve * dist * 0.32;
          const cy = (e.a.y + e.b.y) / 2 + (dx / dist) * l.curve * dist * 0.32;
          const mt = 1 - t;
          const px = mt * mt * e.a.x + 2 * mt * t * cx + t * t * e.b.x;
          const py = mt * mt * e.a.y + 2 * mt * t * cy + t * t * e.b.y;
          return { px, py };
        }) : [];
        return (
          <g key={i} opacity={op}>
            {glowI > 0.01 && <path d={d} fill="none" stroke={l.color} strokeWidth={w * (2.2 + glowI * 2)} strokeOpacity={0.4 * Math.min(1, glowI)} strokeLinecap="round" style={{ filter: `blur(${Math.max(3, w * 1.1)}px)` }} pathLength={draw < 1 ? 1 : undefined} strokeDasharray={draw < 1 ? 1 : undefined} strokeDashoffset={draw < 1 ? 1 - draw : undefined} />}
            <path d={d} fill="none" stroke={l.color} strokeWidth={w} strokeLinecap="round" {...drawDash} />
            {particles.map((p, pi) => (
              <circle key={pi} cx={p.px} cy={p.py} r={Math.max(2.5, w * 0.9)} fill="#fff" opacity={0.85} />
            ))}
          </g>
        );
      })}
      {l.dots && allNodes.map((n, i) => (
        <g key={`n${i}`} opacity={tr.opacity}>
          <circle cx={n.x} cy={n.y} r={l.width * 1.5 * (1.25 + 0.45 * Math.sin(frame / 6))} fill="none" stroke={l.dotColor} strokeWidth={2} opacity={0.4} />
          <circle cx={n.x} cy={n.y} r={l.width * 1.5} fill={l.dotColor} />
        </g>
      ))}
      {l.showLabels && allNodes.map((n, i) => n.name ? (
        <text key={`t${i}`} x={n.x} y={n.y - l.width * 2.6} fill="#fff" fontSize={28} fontFamily={displayFont(theme)} fontWeight={600} textAnchor="middle" opacity={tr.opacity} style={{ paintOrder: "stroke" }} stroke="rgba(0,0,0,0.7)" strokeWidth={4}>{n.name}</text>
      ) : null)}
    </svg>
  );
};
