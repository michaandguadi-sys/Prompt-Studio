"use client";

import React, { useState, useEffect } from "react";

// ── Canvas-based dominant-color extraction ──────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function sqDist(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Samples an image via an off-screen Canvas, then runs k-means++ to find
 * the k most dominant colours. Returns hex strings sorted by cluster size.
 */
function extractDominantColors(img: HTMLImageElement, k = 5): string[] {
  // Downsample for speed — 150px on the longest side is plenty.
  const MAX = 150;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample every 4th pixel; skip transparent, near-white and near-black.
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    if (r > 235 && g > 235 && b > 235) continue;
    if (r < 20 && g < 20 && b < 20) continue;
    pixels.push([r, g, b]);
  }
  if (pixels.length < k) return pixels.map(([r, g, b]) => rgbToHex(r, g, b));

  // k-means++ initialisation: each new center chosen with prob ∝ dist².
  const centers: [number, number, number][] = [
    pixels[Math.floor(Math.random() * pixels.length)],
  ];
  while (centers.length < k) {
    const dists = pixels.map(p => Math.min(...centers.map(c => sqDist(p, c))));
    const total = dists.reduce((s, d) => s + d, 0);
    if (total === 0) { centers.push(pixels[Math.floor(Math.random() * pixels.length)]); continue; }
    let rand = Math.random() * total;
    let chosen = pixels[pixels.length - 1];
    for (let i = 0; i < pixels.length; i++) { rand -= dists[i]; if (rand <= 0) { chosen = pixels[i]; break; } }
    centers.push(chosen);
  }

  // 12 k-means iterations.
  for (let iter = 0; iter < 12; iter++) {
    const sums: [number, number, number][] = centers.map(() => [0, 0, 0]);
    const counts = new Array<number>(k).fill(0);
    for (const [pr, pg, pb] of pixels) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) { const d = sqDist([pr, pg, pb], centers[j]); if (d < bestD) { bestD = d; best = j; } }
      sums[best][0] += pr; sums[best][1] += pg; sums[best][2] += pb; counts[best]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0)
        centers[j] = [Math.round(sums[j][0] / counts[j]), Math.round(sums[j][1] / counts[j]), Math.round(sums[j][2] / counts[j])];
    }
  }

  // Sort by cluster size descending (recount once more after final iteration).
  const finalCounts = new Array<number>(k).fill(0);
  for (const p of pixels) {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < k; j++) { const d = sqDist(p, centers[j]); if (d < bestD) { bestD = d; best = j; } }
    finalCounts[best]++;
  }
  const sorted = centers
    .map((c, i) => ({ c, n: finalCounts[i] }))
    .sort((a, b) => b.n - a.n)
    .map(({ c: [r, g, b] }) => rgbToHex(r, g, b));

  return sorted;
}
import {
  Upload,
  Sparkles,
  Palette,
  Type,
  FileImage,
  AlertCircle,
  Wand2,
  FileVideo,
  FileCode,
  CheckCircle,
} from "lucide-react";
import { useStudio } from "@/store/studio";
import type { Palette as BrandPalette } from "@/lib/types";

/** Map the 5 extracted hex strings to the Palette's named fields. */
function colorsToPalette(colors: string[]): BrandPalette {
  const c = (i: number, fallback: string) => colors[i] ?? fallback;
  return {
    name: "Brand Custom",
    tone: "custom",
    borderColor: c(0, "#f4b942"),
    glowColor:   c(1, "#ffc266"),
    fillColor:   c(2, "#f4b942"),
    countryStroke: c(3, "#3a5878"),
    dotColor:    "#ffffff",
    ringColor:   c(0, "#f4b942"),
  };
}

/**
 * Brand Import — vision page.
 *
 * The goal: a creator drops in images + fonts + 1-2 sentences describing
 * their brand → an LLM tunes the entire style preset (palette, typography,
 * vignette, glow intensity) → they get a ready-to-use studio with everything
 * dialed in for their show.
 *
 * Current state: scaffolded UI + manual color/font import. The LLM tuning
 * and tri-platform XML export (DaVinci .drp / FCPXML / Premiere .prproj) are
 * documented as the v2 roadmap below — both are substantial integrations.
 */
export default function BrandPage() {
  const [colors, setColors] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const setBrandPalette = useStudio((s) => s.setBrandPalette);
  const brandPalette = useStudio((s) => s.brandPalette);

  // Restore swatches from the persisted brand palette on first mount.
  useEffect(() => {
    if (brandPalette && colors.length === 0) {
      setColors([
        brandPalette.borderColor,
        brandPalette.glowColor,
        brandPalette.fillColor,
        brandPalette.countryStroke,
        brandPalette.ringColor,
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToStudios = () => {
    setBrandPalette(colors.length > 0 ? colorsToPalette(colors) : null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setRefImageUrl(url);

    const img = new window.Image();
    img.onload = () => setColors(extractDominantColors(img));
    img.src = url;
  };

  return (
    <div className="h-full overflow-y-auto bg-paper-50">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-line/40 px-10 pt-12 pb-10">
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-[280px] w-[500px] rounded-full bg-amber/[0.04] blur-[80px]" />
        <div className="relative max-w-3xl mx-auto">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px w-8 bg-amber/60" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber/80">Brand Import · v2 roadmap</span>
          </div>
          <h1 className="text-4xl font-light tracking-tight text-graphite mb-2">
            Your brand — every scene
          </h1>
          <p className="text-sm text-graphite/40 max-w-lg leading-relaxed">
            Drop a brand bible, a screenshot of a video you love, your existing palette, your fonts.
            The studio auto-tunes every dial across all scene types. Still manually tweakable.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-10 py-8 space-y-5">

        {/* ── Step 1: Visual reference ─────────────────────────────────── */}
        <Step number={1} title="Reference visuals" icon={<FileImage />}>
          <label className="block">
            <input type="file" accept="image/*" onChange={onImage} className="hidden" />
            <div className="cursor-pointer rounded-xl border-2 border-dashed border-line/60 bg-paper-100 p-10 text-center hover:border-amber/40 hover:bg-black/50 transition-all duration-200">
              {refImageUrl ? (
                <img src={refImageUrl} alt="" className="mx-auto max-h-48 rounded-lg shadow-card" />
              ) : (
                <>
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-paper-100 border border-line">
                    <Upload size={20} className="text-graphite/40" />
                  </div>
                  <div className="text-sm text-graphite/60 font-medium">Drop reference frames or brand mood boards</div>
                  <div className="text-xs text-graphite/30 mt-1">PNG/JPG · extracts 5 dominant colors via k-means</div>
                </>
              )}
            </div>
          </label>
        </Step>

        {/* ── Step 2: Palette ─────────────────────────────────────────── */}
        <Step number={2} title="Brand colors" icon={<Palette />}>
          <div className="flex flex-wrap gap-2.5">
            {colors.map((c, i) => (
              <label key={i} className="group relative cursor-pointer">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => { const next = [...colors]; next[i] = e.target.value; setColors(next); }}
                  className="sr-only"
                />
                <div
                  className="h-12 w-12 rounded-xl border-2 border-transparent group-hover:border-black/40 transition-all shadow-inner"
                  style={{ background: c }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-graphite/30 whitespace-nowrap">{c}</span>
              </label>
            ))}
            <button
              onClick={() => setColors([...colors, "#f4b942"])}
              className="h-12 w-12 rounded-xl border-2 border-dashed border-line text-graphite/40 hover:border-amber/60 hover:text-amber transition-all"
            >
              +
            </button>
          </div>
          <div className="mt-6" />
          <div className="text-[11px] text-graphite/40">
            {refImageUrl
              ? "Colors extracted from your reference image via Canvas k-means — edit any swatch manually."
              : "Upload a reference image above to auto-extract 5 dominant colors."}
          </div>
          {colors.length > 0 && (
            <button
              onClick={saveToStudios}
              className="inline-flex items-center gap-2 rounded-lg bg-amber/15 border border-amber/35 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/25 hover:border-amber/60 transition-all"
            >
              {saved ? <CheckCircle size={14} /> : <Palette size={14} />}
              {saved ? "Saved — all studios updated" : "Apply to all studios"}
            </button>
          )}
        </Step>

        {/* ── Step 3: Fonts ──────────────────────────────────────────── */}
        <Step number={3} title="Fonts" icon={<Type />}>
          <p className="text-sm text-graphite/60">
            Use the <span className="text-amber">Custom Fonts</span> uploader
            inside any scene studio (Map / Title / L3rd / Data) — those uploads
            are saved organisation-wide and will appear as suggestions here once
            the LLM tuner is wired up.
          </p>
        </Step>

        {/* ── Step 4: Describe ──────────────────────────────────────── */}
        <Step number={4} title="Describe your show in 2 sentences" icon={<Wand2 />}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='e.g. "A travel documentary by a couple exploring conflict zones. Cinematic, restrained, warm amber accents, voiceover-led, the visuals should feel like a Vox / Johnny Harris piece."'
            rows={4}
            className="w-full rounded-md bg-white border border-line p-3 text-sm text-graphite placeholder:text-graphite/30 focus:border-amber/60 focus:outline-none"
          />
        </Step>

        {/* ── Step 5: AI tune ──────────────────────────────────────── */}
        <div className="rounded-xl border border-amber/25 bg-amber/[0.04] p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/15 border border-amber/25 text-amber shrink-0 mt-0.5">
              <Sparkles size={15} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-graphite mb-1">AI auto-tune <span className="text-amber/60 text-xs font-normal ml-1">coming v2</span></div>
              <p className="text-sm text-graphite/50 leading-relaxed">
                Sends colors + reference + description to Claude, which returns a complete{" "}
                <code className="text-amber/80">StylePreset</code> — palette weighted toward dominant
                brand color, typography sized to formality, motion blur tuned to the &ldquo;cinematic&rdquo;
                keyword. Lands in your preset library as <em className="text-graphite/60">{description.split(" ").slice(0, 3).join(" ") || "AI Suggested"}</em>.
              </p>
              <button disabled
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber/10 border border-amber/25 px-3.5 py-2 text-xs text-amber/50 cursor-not-allowed"
                title="Coming in v2"
              >
                <Sparkles size={12} />
                Auto-tune my brand
              </button>
            </div>
          </div>
        </div>

        {/* ── Export to NLE ───────────────────────────────────────── */}
        <div className="rounded-xl border border-line/60 bg-paper-100 p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-graphite">
            <FileVideo size={16} className="text-graphite/50" />
            <span className="text-sm font-semibold">Export to your NLE — roadmap</span>
          </div>
          <p className="text-sm text-graphite/60 leading-relaxed">
            The current export pipeline renders a flat 4K MP4 (or ProRes 4444
            .mov with alpha). You wanted XML for DaVinci / Final Cut / Premiere
            so you can tweak fonts, colors, glow, and strokes inside the NLE.
            Status per platform:
          </p>
          <ul className="text-sm text-graphite/70 space-y-1.5 ml-2">
            <li><span className="text-amber">●</span> <strong>Final Cut Pro X (FCPXML)</strong> — open spec, straight-forward. Title/Lower3rd scenes map cleanly to FCP&apos;s built-in Title generator with editable text + color params. Map scenes export as a referenced .mov + the title overlays as separate adjustable layers.</li>
            <li><span className="text-amber">●</span> <strong>DaVinci Resolve</strong> — accepts FCPXML imports. Plus a separate Fusion .setting export would let you fully editable titles in Fusion. Two-step deliverable.</li>
            <li><span className="text-graphite/40">○</span> <strong>Premiere Pro</strong> — uses .prproj (proprietary) or a deprecated XML format. The MOGRT (.mogrt) format with Essential Graphics params is the modern approach but undocumented. Workaround: deliver FCPXML and let Premiere&apos;s importer handle the conversion (lossy).</li>
          </ul>
          <p className="text-sm text-graphite/60 leading-relaxed">
            <strong className="text-amber">v2 ship plan:</strong> FCPXML emitter for Title + Lower3rd
            (~2 days). DaVinci Fusion emitter (~3 days). Premiere via FCPXML
            bridge. Map scenes always rendered to clip + accompanied by a
            <code className="text-amber mx-1">.styles.json</code> sidecar for
            external tools.
          </p>
          <div className="flex gap-2 pt-1">
            <DisabledBtn label=".fcpxml" />
            <DisabledBtn label=".fusion" />
            <DisabledBtn label=".prproj" />
          </div>
        </div>

        <div className="rounded-xl border border-line/40 bg-paper-100/20 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={14} className="text-amber/70 shrink-0 mt-0.5" />
            <p className="text-xs text-graphite/45 leading-relaxed">
              <span className="text-graphite/70 font-medium">Today:</span>{" "}
              pick a palette in the Map studio, search a place, set easing/motion blur, export .tsx → render.
              AI auto-tune and XML emitters land in v2.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const Step: React.FC<{
  number: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ number, title, icon, children }) => (
  <section className="rounded-xl border border-line/60 bg-paper-100 p-6 space-y-4 hover:border-line transition-colors">
    <header className="flex items-center gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-semibold">
        {number}
      </div>
      <div className="text-amber/70">{icon}</div>
      <h2 className="text-sm font-semibold text-graphite">{title}</h2>
    </header>
    <div className="space-y-3 pl-10">{children}</div>
  </section>
);

const DisabledBtn: React.FC<{ label: string }> = ({ label }) => (
  <button
    disabled
    className="rounded-md bg-white border border-line px-3 py-1.5 text-xs font-mono text-graphite/30 cursor-not-allowed"
    title="v2 roadmap"
  >
    <FileCode size={11} className="inline mr-1" />
    {label}
  </button>
);
