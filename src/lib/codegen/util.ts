/**
 * Shared helpers for every codegen emitter.
 * Centralizing here so escape rules don't drift per scene type.
 */

/**
 * Escape characters that would break JSX content when interpolated as text.
 * Used everywhere user-supplied strings hit the emitted TSX.
 */
export function escapeJsx(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[<>&{}]/g, (c) =>
    (({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "{": "&#123;",
      "}": "&#125;",
    } as Record<string, string>)[c]!),
  );
}

/**
 * "Scene03-Istanbul" → "Scene03Istanbul".
 * Removes every character that's invalid in a React component name.
 */
export function toComponentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "") || "Untitled";
}

/** Stable JSON for embedding into emitted code. */
export const j = (v: unknown) => JSON.stringify(v);
