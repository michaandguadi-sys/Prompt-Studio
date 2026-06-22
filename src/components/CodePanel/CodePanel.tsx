"use client";

import React, { useState } from "react";
import { useStudio } from "@/store/studio";
import { generateMapSceneTsx } from "@/lib/codegen/mapScene";
import { generateDataVizSceneTsx } from "@/lib/codegen/dataVizScene";
import { generateTitleSceneTsx } from "@/lib/codegen/titleScene";
import { generateLowerThirdSceneTsx } from "@/lib/codegen/lowerThirdScene";
import { generateQuoteSceneTsx } from "@/lib/codegen/quoteScene";
import { Button } from "@/components/ui/Button";
import { Check, Copy, FileCode } from "lucide-react";

export const CodePanel: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const [copied, setCopied] = useState(false);

  const tsx =
    spec.kind === "map"         ? generateMapSceneTsx(spec)
    : spec.kind === "dataviz"   ? generateDataVizSceneTsx(spec)
    : spec.kind === "title"     ? generateTitleSceneTsx(spec)
    : spec.kind === "lowerthird"? generateLowerThirdSceneTsx(spec)
    : generateQuoteSceneTsx(spec);

  const copy = () => {
    navigator.clipboard.writeText(tsx);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-700/60 bg-ink-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileCode size={12} className="text-white/30" />
          <span className="font-mono text-[11px] text-white/50">{spec.name}.tsx</span>
          <span className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[9px] text-white/30 font-mono uppercase tracking-wider">
            tsx
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-[11px] leading-[1.7] text-white/70 font-mono whitespace-pre min-h-full">
          <code>{tsx}</code>
        </pre>
      </div>
    </div>
  );
};
