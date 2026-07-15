"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Sparkles, Wand2, ShieldCheck, Mic, Check, ChevronDown, ChevronUp, Loader2, PlugZap } from "lucide-react";
import { PRESET_VOICES, DEFAULT_VOICEOVER_SETTINGS, type VoiceoverSettings } from "@/lib/voiceover";

const AI_KEY       = "mapanisy-ai";
const RESTYLE_KEY  = "mapanisy-restyle";
const GOOGLE_KEY   = "mapanisy-google";
const VOICEOVER_KEY = "mapanisy-voiceover";

export function loadGoogleKey(): string {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(localStorage.getItem(GOOGLE_KEY) || "null")?.apiKey || ""; } catch { return ""; }
}

export type AISettings = { provider: string; model: string; apiKey: string; baseUrl: string };
export type RestyleSettings = { provider: string; model: string; apiKey: string; baseUrl: string };
export type { VoiceoverSettings };

const EMPTY_AI: AISettings = { provider: "", model: "", apiKey: "", baseUrl: "" };
const EMPTY_RS: RestyleSettings = { provider: "", model: "", apiKey: "", baseUrl: "" };

function load<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ? { ...fallback, ...v } : fallback; } catch { return fallback; }
}
export function loadAISettings(): AISettings | null {
  if (typeof window === "undefined") return null;
  const v = load(AI_KEY, EMPTY_AI);
  return v.provider && v.apiKey ? v : null;
}
export function loadRestyleSettings(): RestyleSettings | null {
  if (typeof window === "undefined") return null;
  const v = load(RESTYLE_KEY, EMPTY_RS);
  return v.provider && v.apiKey ? v : null;
}

// ─── AI provider catalogue ────────────────────────────────────────────────────

type ProviderDef = {
  id: string;
  name: string;
  sub: string;
  color: string;       // accent color for glow/ring
  initial: string;     // fallback initials badge
  defaultModel: string;
  keyPlaceholder: string;
  baseUrl?: string;    // pre-filled for known endpoints; undefined = user must supply
  keyOptional?: boolean;
  models?: { id: string; label: string }[];
  keyLink?: string;    // deep-link to the provider's API key page
};

const AI_PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic", name: "Anthropic", sub: "Claude",
    color: "#D4764D", initial: "A",
    defaultModel: "claude-sonnet-5",
    keyPlaceholder: "sk-ant-…",
    keyLink: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 (recommended)" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (legacy)" },
    ],
  },
  {
    id: "openai", name: "OpenAI", sub: "GPT",
    color: "#10a37f", initial: "O",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
    keyLink: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini (recommended)" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "o4-mini", label: "o4-mini (reasoning)" },
    ],
  },
  {
    id: "gemini", name: "Google", sub: "Gemini",
    color: "#4285f4", initial: "G",
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIza…",
    keyLink: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (recommended)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  },
  {
    id: "zai", name: "Z.ai", sub: "GLM · built-in engine",
    color: "#3b82f6", initial: "Z",
    baseUrl: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4.5-flash",
    keyPlaceholder: "sk-…",
    keyLink: "https://z.ai/manage-apikey/apikey-list",
    models: [
      { id: "glm-4.5-flash", label: "GLM-4.5 Flash (free — the built-in engine)" },
      { id: "glm-4.5-air", label: "GLM-4.5 Air (fast, low cost)" },
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4.6", label: "GLM-4.6 (most capable)" },
    ],
  },
  {
    id: "groq", name: "Groq", sub: "Llama · Mixtral",
    color: "#f97316", initial: "G",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_…",
    keyLink: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (recommended)" },
      { id: "llama3-8b-8192", label: "Llama 3 8B (fastest)" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8×7B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
  },
  {
    id: "mistral", name: "Mistral", sub: "Mistral AI",
    color: "#fe6b01", initial: "M",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyPlaceholder: "…",
    keyLink: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small (recommended)" },
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "open-mixtral-8x7b", label: "Mixtral 8×7B" },
    ],
  },
  {
    id: "grok", name: "xAI", sub: "Grok",
    color: "#1da1f2", initial: "X",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    keyPlaceholder: "xai-…",
    keyLink: "https://console.x.ai",
    models: [
      { id: "grok-3-mini", label: "Grok 3 Mini (recommended)" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-2", label: "Grok 2" },
    ],
  },
  {
    id: "together", name: "Together", sub: "Open models",
    color: "#7c3aed", initial: "T",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    keyPlaceholder: "…",
    keyLink: "https://api.together.ai/settings/api-keys",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Turbo (recommended)" },
      { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8×7B Instruct" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
    ],
  },
  {
    id: "perplexity", name: "Perplexity", sub: "Sonar",
    color: "#20b2aa", initial: "P",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    keyPlaceholder: "pplx-…",
    keyLink: "https://www.perplexity.ai/settings/api",
    models: [
      { id: "sonar-pro", label: "Sonar Pro (recommended)" },
      { id: "sonar", label: "Sonar" },
    ],
  },
  {
    id: "openrouter", name: "OpenRouter", sub: "Any model",
    color: "#6e7bff", initial: "R",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-haiku",
    keyPlaceholder: "sk-or-…",
    keyLink: "https://openrouter.ai/keys",
  },
  {
    id: "deepseek", name: "DeepSeek", sub: "R1 · V3",
    color: "#2563eb", initial: "D",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keyPlaceholder: "sk-…",
    keyLink: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3 (recommended)" },
      { id: "deepseek-reasoner", label: "DeepSeek R1 (reasoning)" },
    ],
  },
  {
    id: "ollama", name: "Ollama", sub: "Local / offline",
    color: "#6b7280", initial: "O",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    keyPlaceholder: "(leave blank)",
    keyOptional: true,
  },
  {
    id: "openai-compatible", name: "Custom", sub: "Any endpoint",
    color: "#94a3b8", initial: "?",
    defaultModel: "",
    keyPlaceholder: "your bearer key…",
  },
];

const field = "w-full rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-sm text-graphite focus:outline-none focus:border-iris/60";
const lbl = "text-[11px] font-medium text-graphite-muted block mb-1";

// ─── Provider card ────────────────────────────────────────────────────────────

const ProviderCard: React.FC<{ def: ProviderDef; selected: boolean; hasKey: boolean; onClick: () => void }> = ({ def, selected, hasKey, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="relative flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-all"
    style={{
      borderColor: selected ? def.color : "rgba(0,0,0,0.08)",
      background: selected ? `${def.color}0f` : "transparent",
      boxShadow: selected ? `0 0 0 2px ${def.color}40` : "none",
    }}
  >
    {/* Initials badge */}
    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-[13px] font-black text-white" style={{ background: def.color, boxShadow: selected ? `0 0 12px ${def.color}80` : "none" }}>
      {def.initial}
    </div>
    <div className="text-[11px] font-semibold leading-tight text-graphite">{def.name}</div>
    <div className="text-[9px] text-graphite/50 leading-none">{def.sub}</div>
    {/* Connected dot */}
    {hasKey && <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 6px #22c55e" }} />}
    {selected && <div className="absolute top-1.5 left-1.5"><Check size={9} className="text-graphite/60" /></div>}
  </button>
);

// ─── Main modal ───────────────────────────────────────────────────────────────

export const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [ai, setAi] = useState<AISettings>(EMPTY_AI);
  const [rs, setRs] = useState<RestyleSettings>(EMPTY_RS);
  const [googleKey, setGoogleKey] = useState("");
  const [vo, setVo] = useState<VoiceoverSettings>(DEFAULT_VOICEOVER_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; detail?: string }>({ state: "idle" });
  const [restyleOpen, setRestyleOpen] = useState(false);
  const [voOpen, setVoOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setAi(load(AI_KEY, EMPTY_AI));
      setRs(load(RESTYLE_KEY, EMPTY_RS));
      setGoogleKey(loadGoogleKey());
      setVo(load(VOICEOVER_KEY, DEFAULT_VOICEOVER_SETTINGS));
      setSaved(false);
    }
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const save = () => {
    try {
      localStorage.setItem(AI_KEY, JSON.stringify(ai));
      localStorage.setItem(RESTYLE_KEY, JSON.stringify(rs));
      localStorage.setItem(GOOGLE_KEY, JSON.stringify({ apiKey: googleKey.trim() }));
      localStorage.setItem(VOICEOVER_KEY, JSON.stringify(vo));
      // Live consumers (the preview's Photoreal 3D) re-read keys on this event —
      // no reload needed after pasting a key.
      window.dispatchEvent(new Event("mapanisy-google-key"));
    } catch {}
    setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  const testConnection = async () => {
    setTest({ state: "busy" });
    try {
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai }),
      });
      const d = await r.json();
      if (d.ok) setTest({ state: "ok", detail: `${d.label} · ${(d.latencyMs / 1000).toFixed(1)}s` });
      else setTest({ state: "fail", detail: d.error || "Connection failed." });
    } catch {
      setTest({ state: "fail", detail: "Network error — is the app online?" });
    }
  };

  const selectProvider = (def: ProviderDef) => {
    setTest({ state: "idle" });
    setAi({
      provider: def.id,
      model: ai.provider === def.id ? (ai.model || def.defaultModel) : def.defaultModel,
      apiKey: ai.provider === def.id ? ai.apiKey : "",
      baseUrl: def.baseUrl || (ai.provider === def.id ? ai.baseUrl : ""),
    });
  };

  const selDef = AI_PROVIDERS.find((p) => p.id === ai.provider);
  const hasCustomUrl = ai.provider === "openai-compatible" || ai.provider === "ollama";
  // Providers that have a pre-filled base URL but let users override it
  const hasOverridableUrl = !!(selDef?.baseUrl) || hasCustomUrl;

  // Which providers already have a key saved (for the "connected" green dot)
  const savedAI = load<AISettings>(AI_KEY, EMPTY_AI);

  const Collapse: React.FC<{ label: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ label, icon, open: isOpen, onToggle, children }) => (
    <section className="border-t border-line pt-4">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-graphite mb-3" onClick={onToggle}>
        <div className="flex items-center gap-1.5">{icon}{label}</div>
        {isOpen ? <ChevronUp size={14} className="text-graphite/40" /> : <ChevronDown size={14} className="text-graphite/40" />}
      </button>
      {isOpen && <div className="space-y-3">{children}</div>}
    </section>
  );

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-graphite/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl card-light" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2"><KeyRound size={15} className="text-iris" /><h2 className="text-sm font-semibold text-graphite">Connect your AI — bring your own key</h2></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-graphite/40 hover:text-graphite hover:bg-paper-100"><X size={16} /></button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-4 space-y-5">
          {/* AI director — provider grid */}
          <section className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
              <Sparkles size={13} className="text-iris" /> AI Director — idea → animation
            </div>
            <p className="text-[11px] text-graphite/50">Pick your AI provider. Your key is stored locally and sent securely with each request.</p>

            {/* Provider grid */}
            <div className="grid grid-cols-4 gap-2">
              {AI_PROVIDERS.map((def) => (
                <ProviderCard
                  key={def.id}
                  def={def}
                  selected={ai.provider === def.id}
                  hasKey={savedAI.provider === def.id && !!savedAI.apiKey}
                  onClick={() => selectProvider(def)}
                />
              ))}
            </div>

            {/* Credentials for selected provider */}
            {ai.provider && selDef && (
              <div className="space-y-2.5 rounded-xl border border-line bg-paper-50 p-3.5">
                <div className="text-[11px] font-semibold text-graphite mb-1" style={{ color: selDef.color }}>
                  {selDef.name} · {selDef.sub}
                </div>

                {/* Model picker */}
                <label className="block">
                  <span className={lbl}>Model</span>
                  {selDef.models ? (
                    <select className={field} value={ai.model || selDef.defaultModel} onChange={(e) => setAi({ ...ai, model: e.target.value })}>
                      {selDef.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      <option value={ai.model && !selDef.models.find(m => m.id === ai.model) ? ai.model : ""}>Custom model ID…</option>
                    </select>
                  ) : (
                    <input className={field} value={ai.model} placeholder={selDef.defaultModel || "exact model id"} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
                  )}
                </label>

                {/* API key */}
                <div className="block">
                  <div className="flex items-center justify-between mb-1">
                    <span className={lbl} style={{ marginBottom: 0 }}>
                      API key{selDef.keyOptional ? " (optional)" : ""}
                    </span>
                    {selDef.keyLink && (
                      <a
                        href={selDef.keyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-medium text-iris hover:text-iris/80 transition-colors flex items-center gap-0.5"
                      >
                        Get your API key →
                      </a>
                    )}
                  </div>
                  <input className={field} type="password" value={ai.apiKey} placeholder={selDef.keyPlaceholder} onChange={(e) => { setTest({ state: "idle" }); setAi({ ...ai, apiKey: e.target.value }); }} />
                  <p className="mt-1 text-[9.5px] text-graphite/40">
                    Your key is stored only in this browser and used solely to relay your requests to {selDef.name} — it is never saved on our servers.
                  </p>
                </div>

                {/* Test connection — prove the plan/key works before relying on it */}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={test.state === "busy" || (!ai.apiKey && !selDef.keyOptional)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-graphite hover:border-iris/50 disabled:opacity-40 transition-colors"
                  >
                    {test.state === "busy" ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} className="text-iris" />}
                    Test connection
                  </button>
                  {test.state === "ok" && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check size={12} /> Connected — {test.detail}</span>}
                  {test.state === "fail" && <span className="text-[11px] font-medium text-rose-600 leading-tight">{test.detail}</span>}
                </div>

                {/* Base URL override — show for providers that have a URL or require one */}
                {hasOverridableUrl && (
                  <label className="block">
                    <span className={lbl}>
                      Base URL{selDef.baseUrl ? " (pre-filled, override if needed)" : " (required)"}
                    </span>
                    <input className={field} value={ai.baseUrl || selDef.baseUrl || ""} placeholder={selDef.baseUrl || "https://your-endpoint.com/v1"} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} />
                  </label>
                )}

                {/* Provider-specific hints */}
                {selDef.id === "ollama" && (
                  <p className="text-[10px] text-graphite/45">Ollama must be running locally with OLLAMA_ORIGINS=* set. No key required.</p>
                )}
                {selDef.id === "gemini" && (
                  <p className="text-[10px] text-graphite/45">Gemini 2.0 Flash is free-tier — create a project in AI Studio and generate a key in under 30 seconds.</p>
                )}
                {selDef.id === "groq" && (
                  <p className="text-[10px] text-graphite/45">Groq offers a generous free tier — Llama 3.3 70B is the best open model for AI Director tasks.</p>
                )}
                {selDef.id === "openrouter" && (
                  <p className="text-[10px] text-graphite/45">OpenRouter gives you access to 200+ models with one key — great for switching between Claude, GPT, Llama, and others.</p>
                )}
              </div>
            )}
          </section>

          {/* Collapsible sections */}
          <Collapse label="AI restyle (re-style your render)" icon={<Wand2 size={13} className="text-iris" />} open={restyleOpen} onToggle={() => setRestyleOpen(!restyleOpen)}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={lbl}>Provider</span>
                <select className={field} value={rs.provider} onChange={(e) => setRs({ ...rs, provider: e.target.value })}>
                  <option value="">None</option>
                  <option value="replicate">Replicate</option>
                  <option value="generic">Custom (Higgsfield / Runway / your endpoint)</option>
                </select>
              </label>
              <label className="block"><span className={lbl}>Model / version</span>
                <input className={field} value={rs.model} placeholder="model id / version" onChange={(e) => setRs({ ...rs, model: e.target.value })} />
              </label>
            </div>
            {rs.provider === "generic" && (
              <label className="block"><span className={lbl}>Endpoint URL</span>
                <input className={field} value={rs.baseUrl} placeholder="https://api.your-provider.com/restyle" onChange={(e) => setRs({ ...rs, baseUrl: e.target.value })} />
              </label>
            )}
            {rs.provider && (
              <label className="block"><span className={lbl}>API key / token</span>
                <input className={field} type="password" value={rs.apiKey} placeholder="paste your key…" onChange={(e) => setRs({ ...rs, apiKey: e.target.value })} />
              </label>
            )}
          </Collapse>

          <Collapse label="AI voiceover (ElevenLabs TTS)" icon={<Mic size={13} className="text-iris" />} open={voOpen} onToggle={() => setVoOpen(!voOpen)}>
            <label className="block"><span className={lbl}>ElevenLabs API key</span>
              <input className={field} type="password" value={vo.apiKey} placeholder="paste ElevenLabs key…" onChange={(e) => setVo({ ...vo, apiKey: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={lbl}>Voice</span>
                <select className={field} value={vo.voiceId} onChange={(e) => setVo({ ...vo, voiceId: e.target.value })}>
                  {PRESET_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.desc}</option>)}
                  <option value="">Custom (enter ID below)</option>
                </select>
              </label>
              <label className="block"><span className={lbl}>Model</span>
                <select className={field} value={vo.modelId} onChange={(e) => setVo({ ...vo, modelId: e.target.value })}>
                  <option value="eleven_multilingual_v2">Multilingual v2 (best quality)</option>
                  <option value="eleven_turbo_v2_5">Turbo v2.5 (fastest)</option>
                  <option value="eleven_monolingual_v1">English v1 (classic)</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={lbl}>Stability: {Math.round(vo.stability * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={vo.stability} onChange={(e) => setVo({ ...vo, stability: parseFloat(e.target.value) })} className="w-full accent-iris" />
              </label>
              <label className="block"><span className={lbl}>Similarity: {Math.round(vo.similarityBoost * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={vo.similarityBoost} onChange={(e) => setVo({ ...vo, similarityBoost: parseFloat(e.target.value) })} className="w-full accent-iris" />
              </label>
            </div>
            <p className="text-[10px] text-graphite/45">Documentary-quality voiceovers baked into exported videos. Free tier at elevenlabs.io: ~10 min/month.</p>
          </Collapse>

          <Collapse label="Photoreal 3D world (Google Earth tiles)" icon={<Sparkles size={13} className="text-cyan" />} open={googleOpen} onToggle={() => setGoogleOpen(!googleOpen)}>
            <label className="block"><span className={lbl}>Google Maps Platform API key</span>
              <input value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIza…" className={field} />
            </label>
            <p className="text-[10px] text-graphite/45">
              Enables the &ldquo;Photoreal 3D&rdquo; toggle in the editor — Google&apos;s real Earth 3D world. Create a key in Google Cloud with the <span className="text-graphite/65">Map Tiles API</span> enabled (billing required). Preview-only; exports fall back to satellite + terrain.
            </p>
          </Collapse>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-graphite/50">
            <ShieldCheck size={13} className="mt-px shrink-0 text-emerald-500" />
            All keys are stored in your browser only — never on our servers. They travel with each AI request so the server uses your account quota.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-graphite/60 hover:text-graphite">Cancel</button>
          <button onClick={save} className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition">{saved ? "Saved ✓" : "Save"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
