"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Zap, Clock, TrendingUp, CreditCard, ArrowUpRight, Settings, CheckCircle2, Film, Download, Copy, Check, RefreshCw, Cpu, MonitorSmartphone, Sparkles, KeyRound, Wand2 } from "lucide-react";
import type { QuotaResult } from "@/lib/quota";
import { TIERS } from "@/lib/tiers";
import { useUser } from "@clerk/nextjs";
import { SettingsModal, loadAISettings, type AISettings } from "@/v2/ui/SettingsModal";
import { confirmDialog, alertDialog } from "@/v2/ui/dialogs";
import { ProjectLibrary } from "@/components/dashboard/ProjectLibrary";
import { tasteProfile, clearTaste, type TasteProfile } from "@/lib/taste";
import { loadElements } from "@/lib/elements";
import Link from "next/link";

/** ── Creative DNA — what the studio has learned about your taste ─────────
 * Fed by the taste engine (styles you apply, fonts you pick, formats you
 * render). The same profile rides with every generation, so the AI director
 * personalises toward it. One click forgets everything. */
const CreativeDNA: React.FC = () => {
  const [p, setP] = useState<TasteProfile | null>(null);
  const [elCount, setElCount] = useState(0);
  useEffect(() => { setP(tasteProfile()); setElCount(loadElements().length); }, []);
  if (!p) return null;
  const rows: [string, string][] = [];
  if (p.styles.length) rows.push(["Favourite looks", p.styles.join(" · ")]);
  if (p.fonts.length) rows.push(["Fonts", p.fonts.join(" · ")]);
  if (p.aspect) rows.push(["Usual format", p.aspect]);
  if (p.mode) rows.push(["Creates mostly", p.mode === "still" ? "still images" : "films"]);
  if (p.layers.length) rows.push(["Go-to elements", p.layers.join(" · ")]);
  if (elCount) rows.push(["Saved elements", `${elCount} in My Elements`]);
  return (
    <div className="rounded-2xl border border-line bg-white/[0.02] p-6">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-iris/15 text-iris"><Sparkles size={14} /></span>
          <div className="text-sm font-semibold text-graphite">Creative DNA</div>
        </div>
        {p.events > 0 && (
          <button
            onClick={async () => { if (await confirmDialog({ title: "Reset Creative DNA?", message: "Forget everything the studio has learned about your taste.", confirmLabel: "Reset", danger: true })) { clearTaste(); setP(tasteProfile()); } }}
            className="text-[11px] text-graphite/40 transition-colors hover:text-red-400"
          >
            Reset
          </button>
        )}
      </div>
      <p className="mb-4 text-[12px] text-graphite/50">
        The studio learns your taste from every choice and quietly feeds it to the AI director — so each film starts closer to <em>yours</em>.
      </p>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="shrink-0 text-graphite/45">{k}</span>
              <span className="truncate text-right font-medium text-graphite/85">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-graphite/40">
          Nothing learned yet — make a few films and watch this fill up.
        </div>
      )}
    </div>
  );
};

type AgentStatus = { online: boolean; machine?: string };

export default function DashboardPage() {
  const { user } = useUser();
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [aiOpen, setAiOpen]         = useState(false);
  const [quota, setQuota]           = useState<QuotaResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgraded, setUpgraded]     = useState(false);
  const [barWidth, setBarWidth]     = useState(0);
  const barTimerRef                 = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Agent key + status state
  const [agentKey, setAgentKey]       = useState<string | null>(null);
  const [agentKeyLoading, setAgentKeyLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ online: false });
  const [copied, setCopied]           = useState(false);
  const [rotating, setRotating]       = useState(false);
  const [agentKeyError, setAgentKeyError] = useState<string | null>(null);
  const [agentOs, setAgentOs] = useState<"mac" | "win" | "linux">("mac");
  const [outFolder, setOutFolder] = useState("");
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setAgentOs(/Win/i.test(ua) ? "win" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "mac");
  }, []);
  const statusIntervalRef             = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchAgentKey = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-key");
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setAgentKey(d.agentKey ?? null); setAgentKeyError(null); }
      else { setAgentKeyError(d.error ?? `Couldn't load key (${r.status})`); }
    } catch {
      setAgentKeyError("Network error loading agent key");
    } finally { setAgentKeyLoading(false); }
  }, []);

  const pollAgentStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/status");
      if (r.ok) { const d = await r.json(); setAgentStatus({ online: d.online, machine: d.machine }); }
    } catch { /* silent */ }
  }, []);

  const copyKey = async () => {
    if (!agentKey) return;
    await navigator.clipboard.writeText(agentKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rotateKey = async () => {
    setRotating(true);
    setAgentKeyError(null);
    try {
      const r = await fetch("/api/agent-key", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setAgentKey(d.agentKey ?? null); }
      else { setAgentKeyError(d.error ?? `Regenerate failed (${r.status})`); }
    } catch {
      setAgentKeyError("Network error — could not regenerate key");
    } finally { setRotating(false); }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url, error } = await res.json();
    if (url) window.location.href = url;
    else { await alertDialog({ title: "Couldn't open billing", message: error ?? "Could not open billing portal. Please try again." }); setPortalLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      setUpgraded(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      window.history.replaceState({}, "", url.toString());
    }
    fetch("/api/quota")
      .then(async (r) => { if (!r.ok) throw new Error("quota fetch failed"); return r.json(); })
      .then((d: QuotaResult) => {
        setQuota(d);
        barTimerRef.current = setTimeout(() => setBarWidth(Math.round(d.fraction * 100)), 120);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    setAiSettings(loadAISettings());
    fetchAgentKey();
    pollAgentStatus();
    statusIntervalRef.current = setInterval(pollAgentStatus, 30_000);

    return () => {
      clearTimeout(barTimerRef.current);
      clearInterval(statusIntervalRef.current);
    };
  }, [fetchAgentKey, pollAgentStatus]);

  const tierCfg         = quota ? TIERS[quota.tier] : null;
  const unlimited       = !!tierCfg?.unlimited;
  const remainingMin    = quota ? Math.max(0, quota.limitMinutes - quota.usedMinutes) : 0;
  const pctUsed         = quota ? Math.min(100, Math.round(quota.fraction * 100)) : 0;
  // Free tier is metered by animation count; paid tiers by render minutes.
  const isCount         = quota?.unit === "animation";
  const animWord        = quota && quota.maxRenders === 1 ? "animation" : "animations";
  const usedValue       = quota ? (isCount ? `${quota.usedRenders}` : `${quota.usedMinutes.toFixed(1)} min`) : "—";
  const usedSub         = quota ? (unlimited ? "rendered this period" : isCount ? `of ${quota.maxRenders} free ${animWord}` : `of ${quota.limitMinutes} min`) : "";
  const remainingValue  = quota ? (unlimited ? "Unlimited" : isCount ? `${Math.max(0, (quota.maxRenders ?? 0) - quota.usedRenders)}` : `${remainingMin.toFixed(1)} min`) : "—";
  const statusColor     = pctUsed >= 90 ? "bg-red-500" : pctUsed >= 70 ? "bg-amber" : "bg-emerald-500";
  const statusText      = pctUsed >= 90 ? "text-red-400" : pctUsed >= 70 ? "text-amber" : "text-emerald-400";

  // Render-agent connect command — per-OS, with the chosen output folder. The
  // renderer is plain Node + Remotion, so it runs on macOS, Windows and Linux.
  const agentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const agentKeyStr = agentKey ?? "YOUR_KEY";
  const outArg      = outFolder.trim() ? ` --output "${outFolder.trim()}"` : "";
  const connectCmd  = agentOs === "win"
    ? `mkdir "$HOME\\.mapanisy-agent" -Force; curl.exe -fsSL "${agentOrigin}/api/agent/script" -o "$HOME\\.mapanisy-agent\\agent.mjs"; node "$HOME\\.mapanisy-agent\\agent.mjs" --key ${agentKeyStr}${outArg}`
    : `mkdir -p ~/.mapanisy-agent && curl -fsSL '${agentOrigin}/api/agent/script' -o ~/.mapanisy-agent/agent.mjs && node ~/.mapanisy-agent/agent.mjs --key ${agentKeyStr}${outArg}`;
  const restartCmd  = agentOs === "win"
    ? `node "$HOME\\.mapanisy-agent\\agent.mjs" --key ${agentKeyStr}${outArg}`
    : `node ~/.mapanisy-agent/agent.mjs --key ${agentKeyStr}${outArg}`;

  return (
    <div className="h-full overflow-y-auto bg-paper-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-line/40 px-10 pt-12 pb-10">
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-[280px] w-[500px] rounded-full bg-amber/[0.04] blur-[80px]" />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px w-8 bg-amber/60" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber/80">Account</span>
          </div>
          <h1 className="text-4xl font-light tracking-tight text-graphite">Your dashboard</h1>
          {user && (
            <div className="mt-3 flex items-center gap-2.5">
              {user.imageUrl
                ? <img src={user.imageUrl} alt="" className="h-7 w-7 rounded-full border border-line/60 object-cover" />
                : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber/15 text-[11px] font-semibold text-amber">{(user.firstName?.[0] ?? user.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase()}</span>}
              <span className="text-sm text-graphite/55">{user.fullName ? `${user.fullName} · ` : ""}{user.primaryEmailAddress?.emailAddress}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-10 py-8 space-y-6">
        {/* ── Success banner ─────────────────────────────────────────── */}
        {upgraded && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-3.5 anim-fade-up">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            <div className="text-sm">
              <span className="font-semibold text-emerald-400">Plan upgraded.</span>{" "}
              <span className="text-graphite/50">Your new render quota is active — may take a moment to reflect.</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-12 text-graphite/30">
            <div className="h-5 w-5 rounded-full border-2 border-black/10 border-t-iris/70 animate-spin" />
            <span className="text-sm">Loading your usage…</span>
          </div>
        )}

        {!loading && quota && (
          <>
            {/* ── Stat cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                icon={<Zap size={16} />}
                label="Current plan"
                value={tierCfg?.label ?? quota.tier}
                sub={tierCfg?.priceUSD === 0 ? "Free tier" : `$${tierCfg?.priceUSD}/mo`}
                accent
                delay={0}
              />
              <StatCard
                icon={<Clock size={16} />}
                label="Used this period"
                value={usedValue}
                sub={usedSub}
                delay={55}
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Remaining"
                value={remainingValue}
                sub={unlimited ? "no limit" : `${100 - pctUsed}% left`}
                delay={110}
              />
            </div>

            {/* ── Quota bar ──────────────────────────────────────────── */}
            <div className="rounded-xl border border-line/60 bg-paper-100 p-6 anim-fade-up" style={{ animationDelay: "165ms" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-graphite/40" />
                  <span className="text-sm text-graphite/60">Render quota · this billing period</span>
                </div>
                <span className={`text-sm font-mono font-semibold ${statusText}`}>{pctUsed}%</span>
              </div>

              {/* Track */}
              <div className="h-2.5 rounded-full bg-paper-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${statusColor} transition-[width] duration-700 ease-spring`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Sub labels */}
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-graphite/30">
                  {isCount ? `${quota.usedRenders} ${animWord} used` : `${quota.usedMinutes.toFixed(1)} min used`}
                </span>
                <span className="text-[11px] text-graphite/30">
                  {unlimited ? "Unlimited" : isCount ? `${quota.maxRenders} ${animWord} limit` : `${quota.limitMinutes} min limit`}
                </span>
              </div>

              {pctUsed >= 90 && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
                  <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                  <p className="text-sm text-red-400/80">
                    You&apos;re near your limit. Upgrade to keep rendering without interruption.
                  </p>
                </div>
              )}
            </div>

            {/* ── Plan features ──────────────────────────────────────── */}
            <div className="rounded-xl border border-line/60 bg-paper-100 p-6 anim-fade-up" style={{ animationDelay: "220ms" }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-graphite/35 mb-4">Plan features</div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
                {(tierCfg?.features ?? []).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-graphite/60">
                    <span className="h-1 w-1 rounded-full bg-amber/60 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Upgrade CTA (hidden once they're on the top tier) ───── */}
            {quota.tier !== "pro" && (
              <Link
                href="/pricing"
                className="group flex items-center justify-between rounded-xl border border-amber/25 bg-amber/5 hover:bg-amber/8 hover:border-amber/40 px-6 py-5 transition-all duration-200 anim-fade-up"
                style={{ animationDelay: "275ms" }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber/10 border border-amber/20 text-amber">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber">Upgrade your plan</div>
                    <p className="text-xs text-graphite/40 mt-0.5">More render minutes, 4K exports, no watermark.</p>
                  </div>
                </div>
                <ArrowUpRight size={18} className="text-amber/40 group-hover:text-amber transition-colors" />
              </Link>
            )}

            {/* ── Billing portal ─────────────────────────────────────── */}
            {quota.tier !== "free" && (
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="flex items-center gap-2 text-xs text-graphite/30 hover:text-graphite/60 transition-colors disabled:opacity-40"
              >
                <Settings size={13} />
                {portalLoading ? "Opening portal…" : "Manage billing & invoices"}
              </button>
            )}
          </>
        )}

        {!loading && !quota && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-6 text-sm text-amber-400/80">
            {process.env.NODE_ENV === "development" ? (
              <>
                Could not load quota. Set{" "}
                <code className="font-mono text-amber-300">DATABASE_URL</code>
                {" "}in .env.local and run the Clerk webhook to create your user record.
              </>
            ) : (
              <>Your usage info is taking a moment to load — refresh in a few seconds. Everything else works normally.</>
            )}
          </div>
        )}

        {/* ── Project library ────────────────────────────────────────── */}
        <ProjectLibrary />

        {/* ── Creative DNA — the studio's learned taste profile ────────── */}
        <CreativeDNA />

        {/* ── AI engine · which mode you're in ───────────────────────── */}
        <div className="rounded-xl border border-line/60 bg-paper-100 overflow-hidden anim-fade-up" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line/40">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${aiSettings ? "border-iris/30 bg-iris/8 text-iris" : "border-line bg-paper-100 text-graphite/50"}`}>
                {aiSettings ? <Wand2 size={16} /> : <Sparkles size={16} />}
              </div>
              <div>
                <div className="text-sm font-semibold text-graphite">AI engine</div>
                <div className="text-xs text-graphite/35 mt-0.5">{aiSettings ? "AI-directed — your own model writes every scene" : "Smart mode — built-in, works with no key"}</div>
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${aiSettings ? "border-iris/30 bg-iris/8 text-iris" : "border-line/60 bg-paper-100 text-graphite/40"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${aiSettings ? "bg-iris animate-pulse" : "bg-emerald-400"}`} />
              {aiSettings ? `Connected · ${aiSettings.provider}` : "No key needed"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm leading-relaxed text-graphite/55">
              {aiSettings
                ? <>Generation and the in-editor <span className="text-graphite/75">“Edit”</span> bar are powered by your <span className="text-graphite/75">{aiSettings.provider}</span> key{aiSettings.model ? ` (${aiSettings.model})` : ""}. It’s stored only in this browser — never on our servers.</>
                : <>Mapanisy composes every map <span className="text-graphite/75">fully without AI</span> — smart built-in heuristics place the highlights, routes, camera and grade. Connect your own provider for <span className="text-graphite/75">AI-directed</span> nuance, richer stories and free-form edits.</>}
            </p>
            <button
              onClick={() => setAiOpen(true)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${aiSettings ? "border border-line/60 bg-paper-100 text-graphite/60 hover:text-graphite" : "bg-brand text-white shadow-glow-iris hover:-translate-y-0.5"}`}
            >
              <KeyRound size={13} /> {aiSettings ? "Manage key" : "Connect your AI"}
            </button>
          </div>
        </div>

        {/* ── Render Agent ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-line/60 bg-paper-100 overflow-hidden anim-fade-up" style={{ animationDelay: "360ms" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-100 border border-line">
                <Cpu size={16} className="text-graphite/50" />
              </div>
              <div>
                <div className="text-sm font-semibold text-graphite">Render Agent</div>
                <div className="text-xs text-graphite/35 mt-0.5">Full 4K on your machine — zero server cost · uses @remotion/renderer</div>
              </div>
            </div>
            {/* Status badge */}
            <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              agentStatus.online
                ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-400"
                : "border-line/60 bg-paper-100 text-graphite/30"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${agentStatus.online ? "bg-emerald-400 animate-pulse" : "bg-black/20"}`} />
              {agentStatus.online ? `Connected · ${agentStatus.machine ?? "Unknown"}` : "Not connected"}
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Agent Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-graphite/30">Your Agent Key</div>
                <button
                  onClick={rotateKey}
                  disabled={rotating}
                  className="flex items-center gap-1 text-[10px] text-graphite/30 hover:text-graphite/60 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={10} className={rotating ? "animate-spin" : ""} />
                  Regenerate
                </button>
              </div>
              {agentKeyLoading ? (
                <div className="h-10 rounded-lg bg-paper-100 animate-pulse" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-line/60 bg-white px-3 py-2.5 font-mono text-xs text-graphite/60 truncate select-all">
                    {agentKey ?? "—"}
                  </div>
                  <button
                    onClick={copyKey}
                    title="Copy key"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-paper-100 hover:bg-paper-200 text-graphite/40 hover:text-graphite/80 transition-all"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              {agentKeyError && (
                <p className="text-[11px] text-red-400/80">{agentKeyError}</p>
              )}
            </div>

            {/* Connect — one command, any OS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-graphite/30">Connect · one command</div>
                <div className="flex items-center rounded-lg border border-line/60 bg-paper-100 p-0.5">
                  {([["mac", "macOS"], ["win", "Windows"], ["linux", "Linux"]] as const).map(([id, lbl]) => (
                    <button
                      key={id}
                      onClick={() => setAgentOs(id)}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${agentOs === id ? "bg-brand text-white shadow-glow-iris" : "text-graphite/45 hover:text-graphite/70"}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Where to save renders (blank = Downloads) */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-graphite/45">Save renders to</span>
                <input
                  value={outFolder}
                  onChange={(e) => setOutFolder(e.target.value)}
                  placeholder={agentOs === "win" ? "Downloads (default) — or e.g. C:\\Users\\you\\Videos" : "Downloads (default) — or e.g. ~/Movies"}
                  className="flex-1 rounded-lg border border-line/60 bg-white px-3 py-1.5 text-[11px] text-graphite/70 placeholder:text-graphite/30 focus:border-iris/50 focus:outline-none"
                />
              </div>

              <SetupStep n={1} label={agentOs === "win" ? "Paste into PowerShell — that's it (needs Node.js 18+)" : agentOs === "linux" ? "Paste into your terminal — that's it (needs Node.js 18+)" : "Paste into Terminal — that's it (needs Node.js 18+)"}>
                <CopyCmd highlight text={connectCmd} />
              </SetupStep>

              <p className="text-[11px] text-graphite/35 leading-relaxed">
                First run installs the render engine automatically (~200 MB incl. a headless browser) — one time, then instant. Keep the window open; the agent shows as{" "}
                <span className="text-emerald-400/70">Connected</span> above, renders full 4K on your machine, and{" "}
                <span className="text-graphite/50">opens the output folder for you the moment each render finishes</span>.
              </p>

              <details className="group">
                <summary className="cursor-pointer select-none text-[11px] text-graphite/30 hover:text-graphite/50">Restart later · no Node?</summary>
                <div className="mt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-graphite/25">Restart anytime</div>
                  <CopyCmd text={restartCmd} />
                  <p className="text-[11px] leading-relaxed text-graphite/25">
                    No Node yet? Install the LTS from <span className="text-graphite/40">nodejs.org</span>, then re-run. The renderer runs on macOS, Windows and Linux.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
      <SettingsModal open={aiOpen} onClose={() => { setAiOpen(false); setAiSettings(loadAISettings()); }} />
    </div>
  );
}

function SetupStep({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line/50 bg-black/60 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber/15 text-[10px] font-bold text-amber">{n}</span>
        <span className="text-xs text-graphite/50" dangerouslySetInnerHTML={{ __html: label }} />
      </div>
      {children}
    </div>
  );
}

function CopyCmd({ text, highlight = false }: { text: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <pre className={`flex-1 overflow-x-auto rounded border px-3 py-2 font-mono text-[11px] leading-relaxed ${
        highlight
          ? "border-amber/25 bg-amber/5 text-amber/90"
          : "border-line/40 bg-white text-graphite/55"
      }`}>
        {text}
      </pre>
      <button
        onClick={copy}
        title="Copy"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line/50 bg-paper-100 hover:bg-paper-200 text-graphite/40 hover:text-graphite/80 transition-all"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, accent = false, delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <div
      className="rounded-xl border border-line/60 bg-paper-100 p-5 space-y-2 anim-fade-up hover:border-line transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`${accent ? "text-amber" : "text-graphite/30"}`}>{icon}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-graphite/30">{label}</div>
      <div className="text-2xl font-light text-graphite leading-none">{value}</div>
      <div className="text-xs text-graphite/35">{sub}</div>
    </div>
  );
}
