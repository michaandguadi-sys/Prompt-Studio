import type { HighlightStyle, Palette } from "./types";

/** Build a sensible default highlight style from the active palette. */
export function defaultHighlightStyle(palette: Palette): HighlightStyle {
  return {
    borderColor: palette.borderColor,
    borderWidth: 3.5,
    glowColor: palette.glowColor,
    glowWidth: 22,
    glowBlur: 10,
    fillColor: palette.fillColor,
    fillOpacity: 0.22,
  };
}
