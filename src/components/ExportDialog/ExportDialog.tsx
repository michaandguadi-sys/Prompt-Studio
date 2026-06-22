"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStudio } from "@/store/studio";
import { Button } from "@/components/ui/Button";
import { Download, Loader2, X, Layers, ListPlus, Cpu, ChevronDown, ChevronRight, MonitorSmartphone } from "lucide-react";
import { UpgradeModal } from "@/components/UpgradeModal/UpgradeModal";
import { useTier } from "@/hooks/useTier";
import type { MapSceneSpec } from "@/lib/types";

type QualityPreset = "draft" | "standard" | "high" | "cinematic" | "custom";

/** Friendly device label — prefers the connected agent's machine name. */
function deviceLabel(machine?: string): string {
  if (machine) return machine;
  if (typeof navigator === "undefined") return "your computer";
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "your Mac";
  if (/Windows/i.test(ua)) return "your PC";
  if (/Linux/i.test(ua)) return "your computer";
  return "your computer";
}

const QUALITY_PRESETS: Record<QualityPreset, {
  label: string;
  hint: string;
  scale: number;
  x264Preset: string;
  videoBitrate: string;
}> = {
  draft:     { label: "Draft",     hint: "1080p · ultrafast · ~4× faster",        scale: 0.5,  x264Preset: "ultrafast", videoBitrate: "8M" },
  standard:  { label: "Standard",  hint: "1080p · medium quality · balanced",      scale: 0.5,  x264Preset: "medium",    videoBitrate: "15M" },
  high:      { label: "High",      hint: "4K · slow encode · high bitrate",        scale: 1.0,  x264Preset: "slow",      videoBitrate: "40M" },
  cinematic: { label: "Cinematic", hint: "4K · veryslow · maximum quality",        scale: 1.0,  x264Preset: "veryslow",  videoBitrate: "80M" },
  custom:    { label: "Custom",    hint: "Pick your own scale / preset / bitrate", scale: 1.0,  x264Preset: "medium",    videoBitrate: "20M" },
};

export const ExportDialog: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const spec = useStudio((s) => s.spec);
  const scenes = useStudio((s) => s.scenes);
  const patchScene = useStudio((s) => s.patchScene);
  const { unit: tierUnit, usedRenders, maxRenders } = useTier();
  // Free plan (count-metered): how many trial animations remain.
  const freeRemaining =
    tierUnit === "animation" && maxRenders != null
      ? Math.max(0, maxRenders - (usedRenders ?? 0))
      : null;
  const isSequence = scenes.length > 1;
  const totalSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const isMap = spec.kind === "map";
  const transparentBg = isMap && (spec.scene as MapSceneSpec).transparentBg === true;
  const [alpha, setAlpha] = useState(false);
  const [scaleSlider, setScaleSlider] = useState(0.5);       // 0.25 → 1.0
  const [encoderSlider, setEncoderSlider] = useState(1);     // 0 → 4 maps to encoder presets
  const [bitrateMb, setBitrateMb] = useState(15);            // 4 → 100 Mbps
  const [exporting, setExporting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{
    usedMinutes?: number;
    limitMinutes?: number;
    usedRenders?: number;
    maxRenders?: number | null;
    unit?: "animation" | "minute";
    tier?: string;
  }>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentMachine, setAgentMachine] = useState<string | undefined>();
  const statusPollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Map encoder slider 0–4 → x264 preset (low end = fast, high end = quality)
  const ENCODER_PRESETS = ["ultrafast", "veryfast", "medium", "slow", "veryslow"] as const;
  const encoderName = ENCODER_PRESETS[Math.max(0, Math.min(4, Math.round(encoderSlider)))];

  // Poll agent status while dialog is open
  useEffect(() => {
    if (!open) return;
    const poll = async () => {
      try {
        const r = await fetch("/api/agent/status");
        if (r.ok) { const d = await r.json(); setAgentOnline(d.online); setAgentMachine(d.machine); }
      } catch { /* silent */ }
    };
    poll();
    statusPollRef.current = setInterval(poll, 10_000);
    return () => clearInterval(statusPollRef.current);
  }, [open]);

  const renderOnAgent = async () => {
    setExporting(true);
    setLog([
      isSequence
        ? `→ Sending your ${scenes.length}-scene sequence to ${deviceLabel(agentMachine)}…`
        : `→ Sending your scene to ${deviceLabel(agentMachine)}…`,
    ]);
    try {
      const settings = buildSettings();
      const r = await fetch("/api/agent/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // When the project has more than one scene, send the whole sequence so
        // the agent renders the full timeline (PromptStudioSequence composition).
        body: JSON.stringify({ spec, scenes: isSequence ? scenes : undefined, settings }),
      });
      const data = await r.json();
      if (r.status === 402) {
        // Free-tier animation cap reached — show the upgrade modal.
        setQuotaInfo({
          usedMinutes:  data.usedMinutes,
          limitMinutes: data.limitMinutes,
          usedRenders:  data.usedRenders,
          maxRenders:   data.maxRenders,
          unit:         data.unit,
          tier:         data.tier,
        });
        setUpgradeOpen(true);
        setExporting(false);
        return;
      }
      if (!r.ok) {
        setLog((l) => [...l, `✗ ${data.error ?? "Unknown error"}`]);
        setExporting(false);
        return;
      }
      setLog((l) => [
        ...l,
        `✓ Render started on ${deviceLabel(agentMachine)}`,
        `✓ Your finished file lands in Downloads when it's done.`,
      ]);
      setTimeout(() => { setExporting(false); onClose(); }, 1400);
    } catch (e: any) {
      setLog((l) => [...l, `✗ ${e.message}`]);
      setExporting(false);
    }
  };

  if (!open) return null;

  const activePreset = (["draft", "standard", "high", "cinematic"] as QualityPreset[]).find((id) => {
    const p = QUALITY_PRESETS[id];
    return scaleSlider === p.scale && encoderName === p.x264Preset && bitrateMb === parseInt(p.videoBitrate.replace("M", ""), 10);
  }) ?? "custom";

  // Snap sliders to a preset
  const applyPreset = (p: QualityPreset) => {
    const preset = QUALITY_PRESETS[p];
    setScaleSlider(preset.scale);
    setEncoderSlider(ENCODER_PRESETS.indexOf(preset.x264Preset as any));
    setBitrateMb(parseInt(preset.videoBitrate.replace("M", ""), 10) || 15);
  };

  const buildSettings = () => ({
    alpha,
    draft: scaleSlider <= 0.5 && encoderSlider <= 1,
    scale: scaleSlider,
    x264Preset: encoderName as any,
    videoBitrate: `${bitrateMb}M`,
    concurrency: "50%",
  });

  // Write TSX + enqueue render in one click (the queue widget shows progress).
  const exportAndQueue = async (alsoRender: boolean) => {
    setExporting(true);
    setLog([`→ Preparing “${spec.name}” for render…`]);
    try {
      const res = await fetch("/api/export-tsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLog((l) => [...l, `✗ ${data.error ?? "Unknown error"}`]);
        setExporting(false);
        return;
      }
      setLog((l) => [...l, `✓ Render prepared`]);

      if (alsoRender) {
        const settings = buildSettings();
        const r = await fetch("/api/render-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ compositionId: data.compositionId, settings }),
        });
        const qdata = await r.json();
        if (r.status === 402) {
          // Quota exceeded — show upgrade modal instead of error log
          setQuotaInfo({
            usedMinutes:  qdata.usedMinutes,
            limitMinutes: qdata.limitMinutes,
            usedRenders:  qdata.usedRenders,
            maxRenders:   qdata.maxRenders,
            unit:         qdata.unit,
            tier:         qdata.tier,
          });
          setUpgradeOpen(true);
          setExporting(false);
          return;
        }
        if (!r.ok) {
          setLog((l) => [...l, `✗ Queue: ${qdata.error}`]);
        } else {
          setLog((l) => [
            ...l,
            `🎬 Render queued (${activePreset}${alpha ? " + alpha" : ""}) — track progress in the widget, bottom-right`,
            `   Delivers ${data.compositionId}${settings.draft ? "-draft" : ""}.${alpha ? "mov" : "mp4"} when finished.`,
          ]);
          // Close dialog after a short beat so the user sees the confirmation
          setTimeout(() => { setExporting(false); onClose(); }, 1200);
          return;
        }
      }
      setExporting(false);
    } catch (e: any) {
      setLog((l) => [...l, `✗ ${e.message}`]);
      setExporting(false);
    }
  };

  return (
    <>
    <UpgradeModal
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
      usedMinutes={quotaInfo.usedMinutes}
      limitMinutes={quotaInfo.limitMinutes}
      usedRenders={quotaInfo.usedRenders}
      maxRenders={quotaInfo.maxRenders}
      unit={quotaInfo.unit}
      tier={quotaInfo.tier}
    />
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-ink-700/70 bg-ink-900 shadow-elevated max-h-[90vh] overflow-y-auto anim-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-700/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Download size={15} className="text-amber" />
            <div>
              <h2 className="text-sm font-semibold text-white">Export &amp; Render</h2>
              {isSequence && (
                <p className="text-[11px] text-white/40 mt-0.5">
                  {scenes.length} scenes · {totalSec.toFixed(1)}s sequence
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-white/40 hover:text-white hover:bg-ink-800 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* ── Agent status banner (top, prominent) ──────────────── */}
          {agentOnline ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-emerald-400">Render Agent connected</div>
                {agentMachine && <div className="text-[11px] text-emerald-400/60 truncate">{agentMachine}</div>}
              </div>
              <MonitorSmartphone size={14} className="text-emerald-400/50 shrink-0" />
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-ink-700/60 bg-ink-800/30 px-4 py-3">
              <Cpu size={13} className="text-white/30 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-white/40 leading-relaxed">
                No Render Agent connected.{" "}
                <a href="/dashboard" className="text-amber/70 hover:text-amber underline underline-offset-2">
                  Install it
                </a>{" "}
                for 4K renders on your own machine.
              </div>
            </div>
          )}

          {/* ── Free-plan trial note ───────────────────────────────── */}
          {freeRemaining !== null && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-3">
              <span className="text-base leading-none">{freeRemaining > 0 ? "✨" : "🔒"}</span>
              <div className="flex-1 text-xs leading-relaxed text-amber/90">
                {freeRemaining > 0 ? (
                  <>
                    <span className="font-semibold">Free plan</span> — {freeRemaining} free animation
                    {freeRemaining === 1 ? "" : "s"} left. Renders include a small watermark.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Free plan</span> — you&apos;ve used your free animation.{" "}
                    <a href="/pricing" className="underline underline-offset-2 hover:text-amber">
                      Upgrade
                    </a>{" "}
                    for unlimited, watermark-free 4K.
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Render quality ─────────────────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-ink-700/60 bg-ink-900/50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Render quality
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(["draft", "standard", "high", "cinematic"] as QualityPreset[]).map((id) => {
                const p = QUALITY_PRESETS[id];
                return (
                  <button
                    key={id}
                    onClick={() => applyPreset(id)}
                    title={p.hint}
                    className={`rounded-lg px-2 py-2 text-[10px] uppercase tracking-wider border transition-all ${
                      activePreset === id
                        ? "bg-amber/15 border-amber/60 text-amber"
                        : "bg-ink-800/50 border-ink-700/60 text-white/50 hover:border-amber/30 hover:text-white/70"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/30">{QUALITY_PRESETS[activePreset]?.hint ?? "Custom settings"}</p>

            {/* Advanced sliders */}
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60 transition-colors"
            >
              {showAdvanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Fine-tune
            </button>
            {showAdvanced && (
              <div className="space-y-2 pt-1">
                <SliderRow
                  label="Resolution scale"
                  value={scaleSlider}
                  min={0.25} max={1} step={0.05}
                  hint={`${Math.round(scaleSlider * spec.width)} × ${Math.round(scaleSlider * spec.height)}`}
                  onChange={setScaleSlider}
                />
                <SliderRow
                  label="Encoder quality"
                  value={encoderSlider}
                  min={0} max={4} step={1}
                  hint={`x264 ${encoderName} — ${
                    encoderName === "ultrafast" ? "fastest, biggest file"
                    : encoderName === "veryslow" ? "slowest, smallest file"
                    : "balanced"
                  }`}
                  onChange={setEncoderSlider}
                />
                <SliderRow
                  label="Video bitrate"
                  value={bitrateMb}
                  min={4} max={100} step={1}
                  hint={`${bitrateMb} Mbps — ${
                    bitrateMb < 10 ? "small file, visible compression"
                    : bitrateMb < 30 ? "good for YouTube delivery"
                    : bitrateMb < 60 ? "great for archive / master"
                    : "overkill for most uses"
                  }`}
                  onChange={setBitrateMb}
                />
              </div>
            )}
          </div>

          {/* ── Overlay & transparency ────────────────────────────── */}
          <div className="space-y-2 rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Overlay &amp; transparency
            </div>

            {isMap && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => {
                    const on = e.target.checked;
                    patchScene({ transparentBg: on } as Partial<MapSceneSpec>);
                    // Transparent bg only makes sense with an alpha codec — auto-arm it.
                    if (on) setAlpha(true);
                  }}
                  className="accent-amber mt-0.5"
                />
                <span className="flex-1">
                  <span className="text-sm text-white/80 font-medium">Transparent background (overlay mode)</span>
                  <div className="text-xs text-white/35 mt-1 leading-relaxed">
                    Hides the base map &amp; letterbox — only the highlight, route &amp; labels render.
                    Great for compositing a map over your footage.
                  </div>
                </span>
              </label>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={alpha}
                onChange={(e) => setAlpha(e.target.checked)}
                className="accent-amber mt-0.5"
              />
              <span className="flex-1">
                <span className="inline-flex items-center gap-1.5 text-sm text-white/80 font-medium">
                  <Layers size={13} className="text-amber" />
                  Alpha channel (ProRes 4444 .mov)
                </span>
                <div className="text-xs text-white/35 mt-1 leading-relaxed">
                  Renders with a real transparent channel for DaVinci / After Effects compositing.
                  {transparentBg ? " Required for the overlay above." : ""}
                </div>
              </span>
            </label>
          </div>

          {/* ── Export log ────────────────────────────────────────── */}
          {log.length > 0 && (
            <pre className="max-h-40 overflow-auto rounded-xl border border-ink-700/40 bg-black/50 p-4 font-mono text-[11px] text-white/70 leading-relaxed">
              {log.join("\n")}
            </pre>
          )}

          {/* ── Action buttons ────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-ink-700/50">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={exporting}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {!agentOnline && (
                <Button variant="secondary" size="sm" onClick={() => exportAndQueue(false)} disabled={exporting}
                  title="Download the scene's source code (advanced)">
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download code
                </Button>
              )}
              {agentOnline ? (
                <Button variant="primary" size="sm" onClick={renderOnAgent} disabled={exporting}
                  title={`Render in 4K on ${deviceLabel(agentMachine)}`}>
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <MonitorSmartphone size={13} />}
                  Render in 4K
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => exportAndQueue(true)} disabled={exporting}>
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <ListPlus size={13} />}
                  Queue render
                </Button>
              )}
            </div>
          </div>
          {isSequence && !agentOnline && (
            <p className="text-[10px] text-amber/50 text-right">
              The server queue renders the current scene only. Connect the Render Agent to export
              the whole {scenes.length}-scene sequence in 4K — or use Quick Export for the full sequence.
            </p>
          )}
          <p className="text-[10px] text-white/25 text-right">
            {agentOnline
              ? `Full 4K · saved to ${deviceLabel(agentMachine) === "your computer" ? "your computer" : "your Downloads"}.`
              : "Server render · uses quota · track it in the queue widget, bottom-right."}
          </p>
        </div>
      </div>
    </div>
    </>
  );
};

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, hint, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between">
      <div className="text-[10px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="text-[10px] font-mono text-amber">{hint}</div>
    </div>
    <input
      type="range" min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-amber"
    />
  </div>
);
