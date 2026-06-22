import type { Theme, Layer } from "./schema";

/**
 * Palette + font presets for the editor's "Palette & Fonts" panel.
 *
 * Each preset is a complete Theme: a colour set AND a font pairing. Picking one
 * recolours the project and swaps its fonts in a single click — but the very
 * first preset ("Default") is the same look the app ships with, so users who
 * never touch the panel are unaffected. This only opens the door.
 */
export const THEME_PRESETS: Theme[] = [
  {
    name: "Default",
    accent: "#6E7BFF", fill: "#6E7BFF", border: "#6E7BFF", glow: "#6E7BFF", text: "#ffffff",
    fontDisplay: "Inter", fontBody: "Inter",
  },
  {
    name: "Vox Editorial",
    accent: "#ffd24a", fill: "#ffd24a", border: "#ffffff", glow: "#ffc266", text: "#ffffff",
    fontDisplay: "Georgia", fontBody: "Inter",
  },
  {
    name: "Arctic Cold",
    accent: "#4ab8ff", fill: "#1a3a6e", border: "#ffffff", glow: "#88bbff", text: "#ffffff",
    fontDisplay: "Inter", fontBody: "Inter",
  },
  {
    name: "Conflict Red",
    accent: "#ff5a44", fill: "#3a0a0a", border: "#ffffff", glow: "#ff4444", text: "#ffffff",
    fontDisplay: "Oswald", fontBody: "Inter",
  },
  {
    name: "Trade Green",
    accent: "#2ec4b6", fill: "#042a1a", border: "#ffffff", glow: "#40c8a0", text: "#ffffff",
    fontDisplay: "Inter", fontBody: "Inter",
  },
  {
    name: "Political Violet",
    accent: "#aa66ff", fill: "#1a0a3a", border: "#ffffff", glow: "#8844ff", text: "#ffffff",
    fontDisplay: "Inter", fontBody: "Inter",
  },
  {
    name: "Classic Mono",
    accent: "#e8e8e8", fill: "#222222", border: "#ffffff", glow: "#cccccc", text: "#ffffff",
    fontDisplay: "Courier New", fontBody: "Courier New",
  },
];

/**
 * Font catalogue — curated families with robust fallback stacks. They render
 * in the live preview everywhere; the ones marked `system` are safest for the
 * headless 4K render too. "Opening the possibility" without shipping a font CDN.
 */
export const FONT_CHOICES: { label: string; value: string; stack: string }[] = [
  { label: "Inter (default)", value: "Inter", stack: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
  { label: "System Sans", value: "System Sans", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: "Helvetica Now", value: "Helvetica Now", stack: "'Helvetica Now Text', Helvetica, Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { label: "Times (serif)", value: "Times", stack: "'Times New Roman', Times, serif" },
  { label: "Courier (mono)", value: "Courier New", stack: "'Courier New', Courier, monospace" },
  { label: "Oswald (condensed)", value: "Oswald", stack: "Oswald, 'Arial Narrow', Impact, sans-serif" },
  { label: "Impact (display)", value: "Impact", stack: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif" },
  { label: "Arial", value: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  // ── Trendy pack — webfonts auto-loaded in preview AND the 4K render ──
  { label: "Bebas Neue (YouTube)", value: "Bebas Neue", stack: "'Bebas Neue', 'Arial Narrow', Impact, sans-serif" },
  { label: "Anton (heavy)", value: "Anton", stack: "Anton, Impact, 'Arial Narrow Bold', sans-serif" },
  { label: "Montserrat", value: "Montserrat", stack: "Montserrat, 'Helvetica Neue', sans-serif" },
  { label: "Poppins", value: "Poppins", stack: "Poppins, 'Segoe UI', sans-serif" },
  { label: "Space Grotesk (tech)", value: "Space Grotesk", stack: "'Space Grotesk', 'Helvetica Neue', sans-serif" },
  { label: "Playfair (editorial)", value: "Playfair Display", stack: "'Playfair Display', Georgia, serif" },
  { label: "Archivo Black", value: "Archivo Black", stack: "'Archivo Black', Impact, sans-serif" },
  { label: "DM Serif (elegant)", value: "DM Serif Display", stack: "'DM Serif Display', Georgia, serif" },
  { label: "Marker (handwritten)", value: "Permanent Marker", stack: "'Permanent Marker', 'Comic Sans MS', cursive" },
];

/** Google-Fonts stylesheet for the trendy pack — imported by the composition
 *  (so headless renders get the fonts) and by the editor app (for previews). */
export const WEBFONTS_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Montserrat:wght@400;700;800&family=Poppins:wght@400;600;800&family=Space+Grotesk:wght@400;700&family=Playfair+Display:wght@500;700;800&family=Archivo+Black&family=DM+Serif+Display&family=Permanent+Marker&display=swap";

/** Resolve a font name (theme or per-layer) to a CSS font-family stack. */
export function fontStack(name: string | null | undefined): string {
  if (!name) return FONT_CHOICES[0].stack;
  const hit = FONT_CHOICES.find((f) => f.value === name || f.label.startsWith(name));
  return hit ? hit.stack : `'${name}', Inter, sans-serif`;
}

/** Recolour a single layer's colour-bearing fields from a theme (immutable). */
export function recolorLayer<T extends Layer>(layer: T, theme: Theme): T {
  switch (layer.type) {
    case "highlight":
      return { ...layer, fillColor: theme.fill, borderColor: theme.border, glowColor: theme.glow };
    case "route":
      return { ...layer, color: theme.accent };
    case "label":
      return { ...layer, accent: theme.accent, color: theme.text };
    case "title":
      return { ...layer, accent: theme.accent, color: theme.text };
    case "chart":
      return { ...layer, accent: theme.accent };
    case "annotation":
      return { ...layer, accent: theme.accent, color: theme.text };
    case "connections":
      return { ...layer, color: theme.accent };
    default:
      return layer;
  }
}
