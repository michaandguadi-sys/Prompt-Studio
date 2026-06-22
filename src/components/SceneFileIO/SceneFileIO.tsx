"use client";

import React, { useRef, useState } from "react";
import { useStudio } from "@/store/studio";
import { Download, Upload, Check } from "lucide-react";
import { useToast } from "@/components/Toast/Toast";

/**
 * Save / Import scene JSON files. Animated confirmation:
 *  - Save: button briefly morphs to a green checkmark, plus a toast with
 *    the actual filename in the user's Downloads folder.
 *  - Import: toast on success with the loaded scene name.
 */
export const SceneFileIO: React.FC = () => {
  const spec = useStudio((s) => s.spec);
  const setSpec = useStudio((s) => s.setSpec);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [justSaved, setJustSaved] = useState(false);

  const download = () => {
    const safe = JSON.parse(JSON.stringify(spec));
    const filename = `${spec.name || "scene"}.scene.json`;
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // Visual feedback — button morphs to checkmark + toast
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
    toast.success(
      `Saved ${filename}`,
      "Downloaded to your Downloads folder · drop the .json here later to reload",
    );
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (
        !parsed?.kind ||
        !["map", "dataviz", "title", "lowerthird", "quote"].includes(parsed.kind) ||
        typeof parsed.name !== "string" ||
        typeof parsed.durationSec !== "number" ||
        !parsed.scene ||
        !parsed.style
      ) {
        toast.error("Invalid scene file", "Missing required fields (kind, name, durationSec, scene, style)");
        return;
      }
      setSpec(parsed);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(`Loaded "${parsed.name}"`, `${parsed.kind} scene · ${parsed.durationSec}s · imported from ${f.name}`);
    } catch (err: any) {
      toast.error("Failed to parse scene file", err.message);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={download}
        title="Save current scene as .scene.json (downloads to your Downloads folder)"
        className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] uppercase tracking-wider border transition-all duration-300 ${
          justSaved
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 scale-105"
            : "bg-ink-900 border-ink-700 text-white/60 hover:text-amber hover:border-amber/40"
        }`}
        disabled={justSaved}
      >
        {justSaved ? (
          <>
            <Check size={11} className="animate-[bounce_0.4s_ease-out_1]" />
            Saved
          </>
        ) : (
          <>
            <Download size={10} />
            Save
          </>
        )}
      </button>
      <label
        title="Import a .scene.json file"
        className="flex items-center gap-1 rounded bg-ink-900 border border-ink-700 px-2 py-1 text-[10px] uppercase tracking-wider text-white/60 hover:text-amber hover:border-amber/40 cursor-pointer"
      >
        <Upload size={10} />
        Import
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleUpload}
          className="hidden"
        />
      </label>
    </div>
  );
};
