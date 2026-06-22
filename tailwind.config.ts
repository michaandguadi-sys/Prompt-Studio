import type { Config } from "tailwindcss";

/**
 * Design tokens — refreshed for a brighter, more futuristic / Apple-like feel.
 *
 * NOTE: `amber` is the historical name for "the brand accent". It now resolves
 * to an electric iris (indigo-violet) so the whole app recolors at the token
 * level without touching every className. `iris` is the same accent under its
 * correct name for new code; `cyan` / `violet` are the gradient endpoints.
 */
const ACCENT = "#6E7BFF";       // electric iris — primary accent
const ACCENT_GLOW = "#9CA6FF";  // lighter iris for glows / gradients
const ACCENT_DIM = "#4F59E0";   // deeper iris for pressed / borders

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cool, premium near-black ramp with a touch of blue-violet for air.
        ink: {
          950: "#05060e",
          900: "#0a0d1a",
          800: "#141a2b",
          700: "#212b43",
          600: "#2e3a57",
          500: "#3d4b6e",
        },
        // Brand accent (legacy name — now electric iris).
        amber: {
          DEFAULT: ACCENT,
          glow: ACCENT_GLOW,
          dim: ACCENT_DIM,
        },
        // Same accent under its real name + gradient endpoints.
        iris: {
          DEFAULT: ACCENT,
          glow: ACCENT_GLOW,
          dim: ACCENT_DIM,
        },
        cyan: {
          DEFAULT: "#2fe0ff",
          dim: "#16b6d8",
        },
        // ── Surfaces / text / borders — CSS-variable-backed so they can flip
        //    to a dark theme under `.editor-dark` WITHOUT touching every class.
        //    `:root` holds the original light values (see globals.css), so the
        //    landing / home / dashboard render byte-identically. <alpha-value>
        //    keeps every opacity variant (e.g. text-graphite/70) working. ──
        paper: {
          DEFAULT: "rgb(var(--c-paper) / <alpha-value>)",
          50: "rgb(var(--c-paper-50) / <alpha-value>)",
          100: "rgb(var(--c-paper-100) / <alpha-value>)",
          200: "rgb(var(--c-paper-200) / <alpha-value>)",
        },
        line: "rgb(var(--c-line) / <alpha-value>)",
        graphite: {
          DEFAULT: "rgb(var(--c-graphite) / <alpha-value>)",
          muted: "rgb(var(--c-graphite-muted) / <alpha-value>)",
        },
        violet: {
          DEFAULT: "#b57bff",
          dim: "#8e4fe8",
        },
      },
      fontFamily: {
        // Renders true SF Pro on Apple devices; refined fallbacks elsewhere.
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', '"SF Pro Text"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"SF Mono"', '"JetBrains Mono"', "Menlo", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      animation: {
        "fade-up":        "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in":        "fade-in 0.3s ease both",
        "scale-in":       "scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-glow":     "pulse-glow 2.5s ease-in-out infinite",
        "breathe":        "breathe 3s ease-in-out infinite",
        "shimmer":        "shimmer-sweep 2.8s ease-in-out infinite",
        "float":          "float 4s ease-in-out infinite",
        "spin-slow":      "spin-slow 8s linear infinite",
        "bar-fill":       "bar-fill 1s cubic-bezier(0.16,1,0.3,1) both",
        "aurora":         "aurora 18s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(110,123,255,0.18)" },
          "50%":       { boxShadow: "0 0 48px rgba(110,123,255,0.4), 0 0 90px rgba(110,123,255,0.12)" },
        },
        "breathe": {
          "0%, 100%": { opacity: "0.6" },
          "50%":       { opacity: "1" },
        },
        "shimmer-sweep": {
          "0%":   { left: "-80%" },
          "100%": { left: "200%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":       { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
        "bar-fill": {
          from: { width: "0%" },
        },
        "aurora": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)", opacity: "0.9" },
          "50%":       { transform: "translate3d(2%, -2%, 0) scale(1.08)", opacity: "1" },
        },
      },
      transitionTimingFunction: {
        spring:   "cubic-bezier(0.16, 1, 0.3, 1)",
        smooth:   "cubic-bezier(0.4, 0, 0.2, 1)",
        snappy:   "cubic-bezier(0.25, 0, 0.1, 1)",
      },
      boxShadow: {
        "glow-amber":    "0 0 40px rgba(110,123,255,0.22), 0 0 90px rgba(110,123,255,0.07)",
        "glow-amber-sm": "0 0 16px rgba(110,123,255,0.3)",
        "glow-amber-lg": "0 0 80px rgba(110,123,255,0.18), 0 0 160px rgba(110,123,255,0.06)",
        "glow-iris":     "0 0 40px rgba(110,123,255,0.22), 0 0 90px rgba(110,123,255,0.07)",
        "glow-cyan":     "0 0 36px rgba(47,224,255,0.25)",
        "inner-glow":    "inset 0 1px 0 rgba(255,255,255,0.06)",
        "card":          "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)",
        "elevated":      "0 8px 40px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06)",
        "floaty":        "0 24px 70px -16px rgba(0,0,0,0.75), 0 1px 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "gradient-amber-glow": "radial-gradient(ellipse at center, rgba(110,123,255,0.10) 0%, transparent 70%)",
        "gradient-surface":    "linear-gradient(135deg, rgba(20,26,43,0.82) 0%, rgba(10,13,26,0.82) 100%)",
        "gradient-card":       "linear-gradient(135deg, rgba(20,26,43,1) 0%, rgba(10,13,26,0.92) 100%)",
        // Signature bright "intelligence" gradient — iris → violet → cyan.
        "gradient-brand":      "linear-gradient(120deg, #6E7BFF 0%, #B57BFF 48%, #2FE0FF 100%)",
        "gradient-iris":       "linear-gradient(135deg, #6E7BFF 0%, #2FE0FF 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
