import type { StylePreset } from "../types";
import { PALETTES } from "./palettes";

export const DEFAULT_STYLE: StylePreset = {
  name: "VOX Default",
  palette: PALETTES[0],
  fonts: {
    primary: { family: "Helvetica Neue", weight: 200, src: null },
    secondary: { family: "Helvetica Neue", weight: 300, src: null },
  },
  labelTypography: {
    titleSize: 92,
    titleWeight: 300,
    titleSpacing: 22,
    subSize: 28,
    subSpacing: 14,
  },
  letterboxHeight: 80,
};
