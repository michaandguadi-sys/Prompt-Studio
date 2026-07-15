"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Sparkles, ArrowRight, Wand2 } from "lucide-react";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/**
 * QUICK ACTIONS BAR — a compact, inline prompt entry that sits inside the
 * home page layout. Replaces the full-screen DirectorStage hero with a tight
 * "What do you want to create?" bar that flows naturally with the rest of the
 * page content. Still delegates to AiIdeaBox for the actual generation flow
 * but keeps the home page scrollable and tool-forward.
 */
export const QuickPromptBar: React.FC<{ onStartAI: () => void }> = ({ onStartAI }) => {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  const submit = () => {
    if (prompt.trim()) {
      // Seed the prompt into AiIdeaBox via the existing localStorage + event mechanism
      try { localStorage.setItem("mapanisy-seed-prompt", prompt.trim()); } catch {}
      window.dispatchEvent(new CustomEvent("mapanisy-seed", { detail: prompt.trim() }));
    }
    onStartAI();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-floaty">
      {/* Background accent */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: "radial-gradient(80% 100% at 0% 0%, rgba(110,123,255,0.06), transparent 60%)",
        }}
      />

      <div className="relative px-5 py-5 sm:px-6">
        {/* Label row */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#6E7BFF] to-[#B57BFF] text-white shadow-glow-iris">
            <Sparkles size={14} />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-graphite">
              What&rsquo;s the story?
            </h2>
            <p className="text-[11px] text-graphite/45">
              Type a sentence — the AI director does the rest
            </p>
          </div>
        </div>

        {/* Prompt input + button */}
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              rows={2}
              placeholder='e.g. "The fall of the Berlin Wall, 1989"'
              className="w-full resize-none rounded-xl border border-line bg-paper-50 px-3.5 py-2.5 text-[14px] leading-relaxed text-graphite placeholder:text-graphite/30 transition-colors focus:border-iris/50 focus:outline-none focus:ring-2 focus:ring-iris/15"
            />
          </div>
          <button
            onClick={submit}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 text-[13px] font-semibold text-white shadow-glow-iris transition-all hover:-translate-y-0.5"
          >
            <Wand2 size={15} />
            <span className="hidden sm:inline">Create</span>
          </button>
        </div>

        {/* Quick actions row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push("/studio2?blank=1")}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-3 py-1.5 text-[11px] font-medium text-graphite/60 transition-colors hover:border-iris/40 hover:text-iris"
          >
            <Wand2 size={11} /> Blank animation
          </button>
          <button
            onClick={() => {
              // Trigger the import track flow by opening the ImportTrackBox
              const el = document.querySelector('[data-import-track]') as HTMLButtonElement;
              if (el) el.click();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-3 py-1.5 text-[11px] font-medium text-graphite/60 transition-colors hover:border-iris/40 hover:text-iris"
          >
            <Upload size={11} /> Import GPS route
          </button>
          <span className="ml-auto text-[10px] text-graphite/30">
            ⌘↵ to generate
          </span>
        </div>
      </div>
    </div>
  );
};
