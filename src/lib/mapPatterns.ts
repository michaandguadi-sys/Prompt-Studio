import type { HighlightFillType } from "./types";

/**
 * Canvas-generated pattern tiles for Mapbox `fill-pattern`.
 *
 * Mapbox has no built-in hatch/dot/stripe fills, so we paint a small tile on a
 * 2D canvas and register it with `map.addImage(id, imageData, { pixelRatio })`.
 * The polygon's `fill-pattern` then references it by id and Mapbox clips the
 * tiled texture to the highlight shape — giving the classic "contested
 * territory" look used in history / geopolitics explainers.
 */

/** Stable id for a (type,color) tile so we register each combo exactly once. */
export function patternImageId(type: HighlightFillType, color: string): string {
  return `ps-fill-${type}-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

const TILE = 32; // device px; rendered at pixelRatio 2 → ~16 CSS px tile

/**
 * Build an ImageData tile for the given pattern + color. Returns null for
 * "solid" (no pattern) or when run without a DOM (SSR / no canvas).
 */
export function makePatternImageData(
  type: HighlightFillType,
  color: string,
): ImageData | null {
  if (type === "solid") return null;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, TILE, TILE);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";

  switch (type) {
    case "hatch": {
      // Diagonal "/" lines.
      ctx.lineWidth = 4;
      drawDiagonal(ctx, false);
      break;
    }
    case "crosshatch": {
      ctx.lineWidth = 3;
      drawDiagonal(ctx, false);
      drawDiagonal(ctx, true);
      break;
    }
    case "stripes": {
      // Horizontal bands.
      ctx.lineWidth = 5;
      for (let y = TILE / 4; y < TILE; y += TILE / 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(TILE, y);
        ctx.stroke();
      }
      break;
    }
    case "dots": {
      const r = 3.2;
      const step = TILE / 2;
      for (let gx = step / 2; gx < TILE; gx += step) {
        for (let gy = step / 2; gy < TILE; gy += step) {
          ctx.beginPath();
          ctx.arc(gx, gy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }

  return ctx.getImageData(0, 0, TILE, TILE);
}

/** Draw two diagonal lines tiling seamlessly across the tile. */
function drawDiagonal(ctx: CanvasRenderingContext2D, flip: boolean) {
  ctx.save();
  if (flip) {
    ctx.translate(TILE, 0);
    ctx.scale(-1, 1);
  }
  // Two offset diagonals so the tile repeats without seams.
  ctx.beginPath();
  ctx.moveTo(-TILE / 2, TILE / 2);
  ctx.lineTo(TILE / 2, -TILE / 2);
  ctx.moveTo(TILE / 2, TILE * 1.5);
  ctx.lineTo(TILE * 1.5, TILE / 2);
  ctx.moveTo(0, TILE);
  ctx.lineTo(TILE, 0);
  ctx.stroke();
  ctx.restore();
}

export const FILL_TYPE_OPTIONS: { id: HighlightFillType; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "hatch", label: "Hatch" },
  { id: "crosshatch", label: "Cross" },
  { id: "stripes", label: "Stripes" },
  { id: "dots", label: "Dots" },
];
