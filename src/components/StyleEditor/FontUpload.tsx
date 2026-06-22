"use client";

import React, { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Check } from "lucide-react";
import { useStudio } from "@/store/studio";
import { Section } from "@/components/ui/Field";

type UploadedFont = { file: string; family: string; url: string };

export const FontUpload: React.FC = () => {
  const style = useStudio((s) => s.spec.style);
  const patchStyle = useStudio((s) => s.patchStyle);
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const res = await fetch("/api/fonts");
    const data = await res.json();
    setFonts(data.fonts ?? []);
  };

  useEffect(() => {
    refresh();
  }, []);

  // Register loaded fonts with the document so the live preview can render them
  useEffect(() => {
    if (typeof document === "undefined") return;
    fonts.forEach((f) => {
      const id = `font-${f.file}`;
      if (document.getElementById(id)) return;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = `@font-face { font-family: '${f.family}'; src: url('${f.url}'); font-display: swap; }`;
      document.head.appendChild(style);
    });
  }, [fonts]);

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const form = new FormData();
    for (let i = 0; i < files.length; i++) form.append("font", files[i]);
    const res = await fetch("/api/fonts", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Upload failed: ${data.error ?? res.statusText}`);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDelete = async (file: string) => {
    if (!confirm(`Delete ${file}?`)) return;
    await fetch(`/api/fonts?file=${encodeURIComponent(file)}`, { method: "DELETE" });
    await refresh();
  };

  const applyFont = (family: string) => {
    patchStyle({
      fonts: {
        ...style.fonts,
        primary: { ...style.fonts.primary, family },
      },
    });
  };

  return (
    <Section title="Custom Fonts">
      <label className="block">
        <input
          ref={fileRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf"
          multiple
          onChange={(e) => onUpload(e.target.files)}
          className="hidden"
        />
        <span
          className={`flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-3 text-xs uppercase tracking-wider transition cursor-pointer ${
            busy
              ? "border-amber/40 text-white/40"
              : "border-ink-700 text-white/60 hover:border-amber hover:text-amber"
          }`}
        >
          <Upload size={14} />
          {busy ? "Uploading…" : "Upload .woff2 / .ttf / .otf"}
        </span>
      </label>

      {fonts.length === 0 ? (
        <div className="text-[11px] text-white/40">
          No custom fonts yet. Uploaded fonts are available across all your scenes.
        </div>
      ) : (
        <div className="space-y-1">
          {fonts.map((f) => {
            const active = style.fonts.primary.family === f.family;
            return (
              <div
                key={f.file}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  active ? "bg-amber/10 border border-amber/40" : "bg-ink-900 hover:bg-ink-800"
                }`}
              >
                <span
                  className="flex-1 truncate"
                  style={{ fontFamily: `'${f.family}', sans-serif` }}
                >
                  {f.family}
                </span>
                <button
                  onClick={() => applyFont(f.family)}
                  className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber hover:bg-amber/20"
                  title="Apply as primary font"
                >
                  {active ? <Check size={12} /> : "Use"}
                </button>
                <button
                  onClick={() => onDelete(f.file)}
                  className="text-white/30 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};
