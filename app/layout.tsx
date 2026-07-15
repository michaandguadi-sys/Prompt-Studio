import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { WEBFONTS_CSS_URL } from "@/v2/doc/themes";

export const metadata: Metadata = {
  // Resolves every RELATIVE og/twitter image (e.g. page.tsx's "/og-image.jpg")
  // to an ABSOLUTE production URL. Without this, shared links (Twitter, Slack,
  // Discord, Product Hunt) render a broken preview because Next falls back to
  // localhost. Same origin source of truth as sitemap.ts / robots.ts.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://mapanisy.com"),
  title: "Mapanisy — The AI Story-Map Editor",
  description: "Turn any story — or any GPS track — into a cinematic 4K map animation. Fact-checked AI direction, no motion-design skills required.",
};

/** Light, brand-matched theme for every Clerk surface (sign-in/up, UserButton),
 *  so the auth funnel feels native to the bright editorial studio. */
const clerkAppearance = {
  variables: {
    colorPrimary: "#6E7BFF",
    colorBackground: "#ffffff",
    colorText: "#16181d",
    colorTextSecondary: "rgba(20,24,30,0.55)",
    colorInputBackground: "#f7f8fc",
    colorInputText: "#16181d",
    colorTextOnPrimaryBackground: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif",
  },
  elements: {
    card: "border border-black/5 shadow-[0_24px_80px_-28px_rgba(20,28,55,0.35)]",
    headerTitle: "text-graphite",
    headerSubtitle: "text-graphite/55",
    socialButtonsBlockButton: "border border-black/10 text-graphite hover:bg-black/[0.03]",
    dividerLine: "bg-black/10",
    formFieldLabel: "text-graphite/70",
    footerActionLink: "text-iris hover:text-iris-dim",
    formButtonPrimary: "bg-brand",
  },
} as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en">
        <head>
          {/* Trendy display fonts (Bebas Neue, Montserrat, Space Grotesk…) used
              by titles/labels — loaded app-wide so style cards, the font picker
              and the live preview all render in the real typeface. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={WEBFONTS_CSS_URL} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
