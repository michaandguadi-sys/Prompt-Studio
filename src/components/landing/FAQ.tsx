"use client";

import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";

const FAQS = [
  {
    q: "How do I animate a route on a map?",
    a: "Describe the route in plain text — e.g. 'Animate a flight path from Paris to Tokyo'. The AI Director geocodes both locations, draws a great-circle arc, and composes a cinematic camera fly-through automatically. You can also upload a GPX, TCX, or KML file to animate any recorded GPS track with a live-draw effect.",
  },
  {
    q: "What is the best tool for making an animated map video?",
    a: "Mapanisy is purpose-built for animated map videos. Unlike general motion-graphics software, it understands geography: it can highlight countries, draw animated routes, fly the camera through 3D terrain, and add cinematic text overlays — all from a single sentence describing your story. No After Effects, no coding.",
  },
  {
    q: "How does the AI map animation work?",
    a: "You type a story or paste a voiceover script. The AI Director reads the idea, identifies the geography, designs story beats with camera moves, chooses the right map style, and outputs a fully timed composition — in under 10 seconds. Every beat has a precise camera position, layer order, and text timing.",
  },
  {
    q: "Can I animate a GPX or GPS route?",
    a: "Yes. Import a GPX, TCX, KML, or GeoJSON file and Mapanisy animates the track with a camera that follows the path, terrain 3D exaggeration, and an animated route-draw effect. Works great for cycling, running, hiking, or any GPS-recorded journey.",
  },
  {
    q: "Can I highlight a country or region on the map?",
    a: "Yes. Tell the AI Director which country, state, city, or region to highlight — or draw a custom area. Mapanisy fetches official boundaries from OpenStreetMap and animates them with a cinematic fill, hatch pattern, or border-draw effect, with a matching glow and colour grade.",
  },
  {
    q: "Can I add voiceover to a map animation?",
    a: "Yes. Connect your ElevenLabs API key in Settings → AI Voiceover, and Mapanisy generates documentary-quality narration from your script and bakes the audio directly into the exported MP4. Choose from 8 preset voices or use any ElevenLabs voice ID.",
  },
  {
    q: "What video formats does it export?",
    a: "Mapanisy exports MP4 (H.264) at up to 4K (3840×2160) resolution, suitable for YouTube, Instagram, TV broadcast, and conference presentations. GIF export is available for social posts, and a live public share link lets viewers play the animation without downloading.",
  },
  {
    q: "Which AI models can I use?",
    a: "Mapanisy works with any major AI provider: Anthropic Claude, OpenAI GPT, Google Gemini, Groq, Mistral, xAI Grok, Together AI, Perplexity, OpenRouter, DeepSeek, Cohere, and local Ollama. Bring your own key — it's stored only in your browser and sent securely with each request.",
  },
  {
    q: "Do I need design or motion-graphics skills?",
    a: "No. Mapanisy is built for journalists, educators, YouTubers, documentary-makers, and anyone who needs to tell a geographic story visually. The AI handles all the animation, camera timing, map-style selection, and graphic design — you just describe the story.",
  },
];

export const FAQ: React.FC<{ serifFont: string }> = ({ serifFont }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 sm:py-32" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-base font-semibold leading-7 text-[#6E7BFF] uppercase tracking-wider">FAQ</p>
          <h2 id="faq-heading" className="mt-2 text-3xl font-medium tracking-tight text-white sm:text-5xl" style={{ fontFamily: serifFont }}>
            Common questions <br /><span className="text-white/40">answered.</span>
          </h2>
        </div>
        <div className="mx-auto mt-16 max-w-3xl">
          <dl className="space-y-4">
            {FAQS.map((faq, i) => (
              <div
                key={faq.q}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-all cursor-pointer hover:bg-white/[0.04]"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <dt className="flex w-full items-start justify-between text-left text-white">
                  <span className="text-lg font-medium leading-7">{faq.q}</span>
                  <span className="ml-6 flex-shrink-0">
                    {openIndex === i
                      ? <Minus className="h-5 w-5 text-[#6E7BFF]" />
                      : <Plus className="h-5 w-5 text-white/40" />
                    }
                  </span>
                </dt>
                {openIndex === i && (
                  <dd className="mt-4 pr-12">
                    <p className="text-base leading-7 text-white/55">{faq.a}</p>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
