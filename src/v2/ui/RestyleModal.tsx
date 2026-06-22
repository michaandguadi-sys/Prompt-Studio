"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Wand2, Loader2, Upload, Link2, ExternalLink, Settings2 } from "lucide-react";
import { RESTYLE_STYLES } from "@/lib/presets/restyleStyles";
import { loadRestyleSettings } from "./SettingsModal";

type Phase = "setup" | "uploading" | "working" | "done" | "error";

/** AI restyle — turn a rendered map clip into a different art style via a
 *  video-to-video model. Upload a clip (or paste a public URL), pick a style,
 *  and we submit + poll the configured provider. */
export const RestyleModal: React.FC<{ open: boolean; onClose: () => void; onOpenSettings: () => void }> = ({ open, onClose, onOpenSettings }) => {
  const [phase, setPhase] = useState<Phase>("setup");
  const [styleId, setStyleId] = useState(RESTYLE_STYLES[0].id);
  const [customPrompt, setCustomPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);
  useEffect(() => { if (open) { setPhase("setup"); setMsg(null); setOutUrl(null); setUrl(""); } }, [open]);
  if (!open || typeof document === "undefined") return null;

  const rs = loadRestyleSettings();
  const prompt = customPrompt.trim() || RESTYLE_STYLES.find((s) => s.id === styleId)?.prompt || "cinematic restyle";

  const byoQuery = rs ? `&provider=${encodeURIComponent(rs.provider)}&apiKey=${encodeURIComponent(rs.apiKey)}&model=${encodeURIComponent(rs.model)}&baseUrl=${encodeURIComponent(rs.baseUrl)}` : "";

  const poll = async (id: string) => {
    try {
      const r = await fetch(`/api/v2/restyle?id=${encodeURIComponent(id)}${byoQuery}`);
      const d = await r.json();
      const job = d.job;
      if (!r.ok || !job) { setPhase("error"); setMsg(d.error ?? "Lost the job."); return; }
      if (job.status === "succeeded" && job.outputUrl) { setOutUrl(job.outputUrl); setPhase("done"); return; }
      if (job.status === "failed") { setPhase("error"); setMsg(job.error ?? "Restyle failed."); return; }
      pollRef.current = setTimeout(() => poll(id), 4000);
    } catch { pollRef.current = setTimeout(() => poll(id), 5000); }
  };

  const submit = async (videoUrl: string) => {
    setPhase("working"); setMsg("Submitting to the restyle model…");
    try {
      const r = await fetch("/api/v2/restyle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, prompt, restyle: rs ?? undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d.job?.id) { setPhase("error"); setMsg(d.error ?? "Couldn't start restyle."); return; }
      setMsg(`Restyling with ${d.provider ?? "your model"}…`);
      poll(d.job.id);
    } catch { setPhase("error"); setMsg("Network error."); }
  };

  const onPickFile = async (f: File) => {
    setPhase("uploading"); setMsg("Uploading your clip…");
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/v2/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || !d.url) { setPhase("error"); setMsg(d.error ?? "Upload failed."); return; }
      submit(d.url);
    } catch { setPhase("error"); setMsg("Upload error."); }
  };

  const busy = phase === "uploading" || phase === "working";
  const cinematic = RESTYLE_STYLES.filter((s) => s.kind === "cinematic");
  const art = RESTYLE_STYLES.filter((s) => s.kind === "art");
  const selected = RESTYLE_STYLES.find((s) => s.id === styleId);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md anim-fade-in" onClick={onClose}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white" onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 40px 110px -34px rgba(20,28,55,0.42), 0 6px 20px -8px rgba(20,28,55,0.18)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6E7BFF]/50 to-transparent" />
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#2FE0FF)" }}><Wand2 size={13} /></span>
            <h2 className="text-sm font-semibold text-graphite">Cinematic AI restyle</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-graphite/45 transition-colors hover:bg-graphite/[0.05] hover:text-graphite"><X size={16} /></button>
        </div>

        <div className="max-h-[74vh] space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-relaxed text-graphite/55">
            Turn a rendered frame or clip into an ultra-realistic <span className="text-graphite/75">3D drone-cinema</span> shot — true depth, parallax and film-grade color. Pick a look and the model does the rest.
          </p>

          {!rs && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#6E7BFF]/25 bg-[#6E7BFF]/[0.06] px-3 py-2 text-[11px] text-graphite/70">
              No restyle provider connected.
              <button onClick={onOpenSettings} className="inline-flex items-center gap-1 font-medium text-iris/70 hover:underline"><Settings2 size={12} /> Connect one</button>
            </div>
          )}

          {/* Cinematic 3D looks — the headline */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/40">Cinematic 3D looks</div>
            <div className="grid grid-cols-2 gap-1.5">
              {cinematic.map((s) => {
                const on = styleId === s.id;
                return (
                  <button key={s.id} onClick={() => setStyleId(s.id)}
                    className={`group rounded-xl border px-3 py-2 text-left transition-all ${on ? "border-[#6E7BFF] bg-[#6E7BFF]/[0.1] ring-1 ring-[#6E7BFF]/40" : "border-line bg-graphite/[0.02] hover:border-[#6E7BFF]/40 hover:bg-graphite/[0.04]"}`}>
                    <div className={`text-[12px] font-semibold ${on ? "text-iris" : "text-graphite/80"}`}>{s.label}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-graphite/45">{s.tagline}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Art styles */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-graphite/40">Art styles</div>
            <div className="grid grid-cols-3 gap-1.5">
              {art.map((s) => {
                const on = styleId === s.id;
                return (
                  <button key={s.id} onClick={() => setStyleId(s.id)} title={s.tagline}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] transition ${on ? "border-[#6E7BFF] bg-[#6E7BFF]/[0.1] text-iris" : "border-line text-graphite/60 hover:border-[#6E7BFF]/40 hover:text-graphite"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {selected?.kind === "cinematic" && (
            <div className="rounded-lg border border-line bg-graphite/[0.02] px-3 py-2 text-[10.5px] leading-relaxed text-graphite/50">
              <span className="font-medium text-iris/70">{selected.label}: </span>{selected.prompt.slice(0, 150)}…
            </div>
          )}

          <input value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="…or describe your own cinematic move (optional)"
            className="w-full rounded-lg border border-line bg-graphite/[0.03] px-3 py-2 text-sm text-graphite placeholder:text-graphite/40 focus:border-[#6E7BFF]/60 focus:outline-none" />

          {/* Source */}
          {phase === "setup" && (
            <div className="space-y-2">
              <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-white transition hover:-translate-y-px" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 10px 30px -10px rgba(110,123,255,0.7)" }}>
                <Upload size={14} /> Upload a frame or clip & restyle
              </button>
              <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
              <div className="flex items-center gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste a public video / image URL" className="flex-1 rounded-lg border border-line bg-graphite/[0.03] px-3 py-2 text-sm text-graphite placeholder:text-graphite/40 focus:border-[#6E7BFF]/60 focus:outline-none" />
                <button onClick={() => url.trim() && submit(url.trim())} disabled={!url.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-graphite/70 transition hover:border-[#6E7BFF] hover:text-iris/70 disabled:opacity-40"><Link2 size={13} /> Go</button>
              </div>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-graphite/[0.03] px-3 py-2.5 text-xs text-graphite/70">
              <Loader2 size={14} className="animate-spin text-iris/70" /> {msg}
            </div>
          )}

          {phase === "done" && outUrl && (
            <a href={outUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/15">
              <ExternalLink size={14} /> Open your cinematic restyle
            </a>
          )}

          {phase === "error" && (
            <div className="space-y-2">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{msg}</div>
              <button onClick={() => setPhase("setup")} className="text-[11px] text-graphite/60 hover:text-iris/70">← Try again</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
