"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Catches errors thrown in the ROOT layout itself,
 * so it must render its own <html>/<body> and CANNOT depend on globals.css or
 * Tailwind (the stylesheet the failing layout would have loaded). Everything is
 * inline-styled and brand-matched so even a catastrophic failure looks like
 * Mapanisy, never a raw stack trace.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[mapanisy] global error:", error?.digest ?? error?.message ?? error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#04060f", color: "#fff", fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", marginBottom: 20, fontSize: 26 }} aria-hidden>
            ⚠️
          </div>
          <h1 style={{ fontFamily: "Newsreader, 'Playfair Display', Georgia, serif", fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 500, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
            Something went off-course.
          </h1>
          <p style={{ maxWidth: 360, marginTop: 16, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
            An unexpected error interrupted Mapanisy. It’s usually temporary — try again, or reload the page.
          </p>
          {error?.digest && (
            <p style={{ marginTop: 12, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>ref: {error.digest}</p>
          )}
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, border: "none", background: "#6E7BFF", padding: "12px 20px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 10px 30px -8px rgba(110,123,255,0.6)" }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", textDecoration: "none" }}
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
