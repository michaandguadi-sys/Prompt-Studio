"use client";

import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";

interface FAQProps {
  serifFont: string;
}

export const FAQ: React.FC<FAQProps> = ({ serifFont }) => {
  const faqs = [
    {
      q: "How does the AI work?",
      a: "Our AI Director understands spatial data and storytelling. It researches your prompt, finds the best camera angles, and composes the scene using our library of high-end map styles.",
    },
    {
      q: "Can I export for social media?",
      a: "Yes, you can export in 9:16 (Vertica), 16:9 (Horizontal), or 1:1 (Square) in full 4K resolution.",
    },
    {
      q: "Do I need a powerful computer?",
      a: "No. The heavy lifting is done on our cloud GPUs. You only need a modern web browser to use the studio.",
    },
    {
      q: "Can I use my own data?",
      a: "Absolutely. You can upload GPX, TCX, and KML files. We also support direct integration with Strava and Garmin.",
    },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6E7BFF] uppercase tracking-wider">FAQ</h2>
          <p className="mt-2 text-3xl font-medium tracking-tight text-white sm:text-5xl" style={{ fontFamily: serifFont }}>
            Common questions <br /><span className="text-white/40">answered.</span>
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-3xl">
          <dl className="space-y-4">
            {faqs.map((faq, i) => (
              <div
                key={faq.q}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-all cursor-pointer hover:bg-white/[0.04]"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <dt className="flex w-full items-start justify-between text-left text-white">
                  <span className="text-lg font-medium leading-7">{faq.q}</span>
                  <span className="ml-6 flex-shrink-0">
                    {openIndex === i ? <Minus className="h-5 w-5 text-[#6E7BFF]" /> : <Plus className="h-5 w-5 text-white/40" />}
                  </span>
                </dt>
                {openIndex === i && (
                  <dd className="mt-4 pr-12">
                    <p className="text-base leading-7 text-white/50">{faq.a}</p>
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
