import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Free-tier watermark overlay.
 *
 * Rendered on top of any scene when the exporting user is on the Free plan.
 * Deliberately subtle — a bottom-right wordmark that reads as a credit, not a
 * defacement — so Free exports are still usable but visibly nudge toward an
 * upgrade. Paid tiers pass `watermark={false}` and this never mounts.
 *
 * Sizing is relative to composition height so it scales identically across
 * 16:9 / 9:16 / 1:1 without per-aspect tuning.
 */
export const Watermark: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      justifyContent: "flex-end",
      alignItems: "flex-end",
      padding: "3.5%",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: "2.6vh",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.82)",
        textShadow: "0 2px 12px rgba(0,0,0,0.55)",
      }}
    >
      <span
        style={{
          width: "1.4vh",
          height: "1.4vh",
          borderRadius: "50%",
          background: "#f5b642",
          boxShadow: "0 0 10px rgba(245,182,66,0.7)",
        }}
      />
      Mapanisy
    </div>
  </AbsoluteFill>
);
