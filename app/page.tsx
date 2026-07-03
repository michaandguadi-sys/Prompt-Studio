import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LandingExperience } from "@/components/landing/LandingExperience";

export const metadata: Metadata = {
  title: "Prompt Studio — Map Animation Tool for YouTube | No After Effects",
  description:
    "The easiest way to make Vox-style and Johnny Harris-style map animations for YouTube. Animate routes, zoom to cities, highlight countries — export 4K MP4 in minutes. No After Effects required.",
  keywords: [
    "map animation tool",
    "how to animate maps for YouTube",
    "Vox style map animation",
    "documentary map maker",
    "travel video map animation",
    "animate maps online free",
    "map animation without After Effects",
    "Johnny Harris style map",
    "YouTube map animation maker",
    "animated map video creator",
    "map animation software",
    "cinematic map animation",
    "animated route map",
    "GPX animation",
    "travel map video",
    "geography animation",
    "country highlight animation",
    "documentary map animation",
  ],
  openGraph: {
    type: "website",
    title: "Prompt Studio — Make Vox-style Map Animations. No After Effects.",
    description:
      "Animate routes, fly to cities, highlight countries. Export 4K MP4 in minutes. The map animation tool built for documentary YouTubers and travel creators.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Prompt Studio — Map Animation Tool for YouTubers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompt Studio — Map Animation Without After Effects",
    description:
      "Make Johnny Harris-style map animations for YouTube in minutes. Animate routes, zoom to cities, export 4K. Free to start.",
    images: ["/og-image.png"],
  },
  alternates: { canonical: "https://mapanisy.com" },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Prompt Studio",
      "url": "https://mapanisy.com",
      "applicationCategory": "MultimediaApplication",
      "applicationSubCategory": "Map Animation Tool",
      "operatingSystem": "Web browser",
      "description":
        "Prompt Studio is the easiest map animation tool for YouTube creators, travel bloggers, journalists, and documentary makers. Create Vox-style and Johnny Harris-style animated maps without After Effects. Animate routes, fly to cities, highlight countries, and export 4K MP4 in minutes.",
      "featureList": [
        "Animate map routes between any two locations on Earth",
        "Cinematic city fly-to camera moves",
        "Country and region highlight animations",
        "Vox-style and Johnny Harris-style documentary map look",
        "No After Effects or motion design skills required",
        "Export 4K MP4 via Remotion",
        "FCPXML export for Final Cut Pro",
        "DaVinci Resolve compatible export",
        "Live preview before rendering",
        "Custom Mapbox map styles",
        "Brand presets for consistent look",
        "GPX, KML, GeoJSON track import",
        "Data visualization overlays — choropleth, bubbles, flows",
        "Free plan with watermark",
      ],
      "offers": [
        {
          "@type": "Offer",
          "name": "Free",
          "price": "0",
          "priceCurrency": "EUR",
          "description": "All features with watermark on exported video",
        },
        {
          "@type": "Offer",
          "name": "Pay as you go",
          "price": "0.10",
          "priceCurrency": "EUR",
          "description": "No watermark, cloud rendering, charged per render minute",
        },
        {
          "@type": "Offer",
          "name": "Pro",
          "price": "149",
          "priceCurrency": "EUR",
          "description": "One-time payment, unlimited cloud renders, all features forever",
        },
      ],
      "screenshot": "https://mapanisy.com/og-image.png",
      "creator": {
        "@type": "Organization",
        "name": "Prompt Studio",
        "url": "https://mapanisy.com",
      },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I animate a map for YouTube?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "With Prompt Studio, you describe your story or paste a script and the AI Director builds the camera moves, route animations, and timing for you. You can animate a route between any two cities, fly into a location with a cinematic push, or highlight an entire country — then export a 4K MP4 ready to drop into your YouTube edit. No After Effects or motion design experience needed.",
          },
        },
        {
          "@type": "Question",
          "name": "What is the best free map animation tool for YouTube creators?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Prompt Studio offers a free plan that unlocks all animation features — you can animate routes, fly to cities, highlight regions, and export MP4. The free plan adds a small watermark ('Made with Prompt Studio') which you can remove by upgrading. It's the most complete free map animation tool available for documentary YouTubers and travel creators.",
          },
        },
        {
          "@type": "Question",
          "name": "Can I make Vox-style or Johnny Harris-style map animations without After Effects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes — that's exactly what Prompt Studio is built for. The tool recreates the signature look of documentary map animations: cinematic fly-throughs, smooth city zooms, country highlight fills, and animated routes. You get the Vox and Johnny Harris aesthetic without touching After Effects, plugins, or motion design software.",
          },
        },
        {
          "@type": "Question",
          "name": "How do documentary makers animate maps?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Traditionally, documentary teams used After Effects with plugins like Motion Bro or Mapbox motion tiles — a process that took hours per map shot and required motion design expertise. Prompt Studio replaces that workflow entirely: describe your story, choose a camera style, and export 4K footage in minutes. The AI Director handles camera timing, route drawing, and geographic framing automatically.",
          },
        },
        {
          "@type": "Question",
          "name": "What is a Johnny Harris style map animation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Johnny Harris-style map animations are cinematic geographic shots used in documentary YouTube videos — characterized by smooth fly-throughs of real-world satellite imagery, animated route lines, country highlights with dramatic reveals, and a dark cinematic grade. Prompt Studio is specifically designed to produce this look, powered by live Mapbox maps and Remotion rendering.",
          },
        },
        {
          "@type": "Question",
          "name": "Can I animate maps for travel video content?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Travel creators are one of the primary use cases for Prompt Studio. You can import a GPX track from your hike, cycle, or road trip and watch it animate on a cinematic map. Or describe a travel route in plain text — 'from Vienna to Istanbul by train' — and the AI Director builds the animation automatically. Export to MP4 in your target aspect ratio for YouTube, Shorts, or Reels.",
          },
        },
        {
          "@type": "Question",
          "name": "What video format does Prompt Studio export to?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Prompt Studio exports to MP4 (H.264) at up to 4K (3840×2160) via Remotion rendering, FCPXML for Final Cut Pro, and formats compatible with DaVinci Resolve. You can also export animated GIFs or share a public live-preview link. Cloud rendering is available on pay-as-you-go and Pro plans.",
          },
        },
        {
          "@type": "Question",
          "name": "How long does it take to make a map animation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most map animations are ready to preview in under 60 seconds after you describe your idea. Rendering to 4K MP4 typically takes 1–4 minutes depending on animation length. Compared to the 2–4 hours a motion designer spends in After Effects for a similar result, Prompt Studio is dramatically faster for documentary YouTubers and journalists on deadline.",
          },
        },
      ],
    },
  ],
};

/**
 * Public marketing landing — ALWAYS viewable, signed in or not, so the sales
 * page can be found, shared and linked at any time. Signed-in visitors get a
 * "Open studio" path from the landing's own CTAs instead of a forced redirect.
 */
export default async function LandingPage() {
  const { userId } = await auth();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <LandingExperience signedIn={!!userId} />
    </>
  );
}
