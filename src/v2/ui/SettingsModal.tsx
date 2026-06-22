"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Sparkles, Wand2, ShieldCheck } from "lucide-react";

const AI_KEY = "mapanisy-ai";
const RESTYLE_KEY = "mapanisy-restyle";
const GOOGLE_KEY = "mapanisy-google";

/** The user's Google Maps Platform key for Photorealistic 3D Tiles (preview). */
export function loadGoogleKey(): string {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(localStorage.getItem(GOOGLE_KEY) || "null")?.apiKey || ""; } catch { return ""; }
}

export type AISettings = { provider: string; model: string; apiKey: string; baseUrl: string };
export type RestyleSettings = { provider: string; model: string; apiKey: string; baseUrl: string };

const EMPTY_AI: AISettings = { provider: "", model: "", apiKey: "", baseUrl: "" };
const EMPTY_RS: RestyleSettings = { provider: "", model: "", apiKey: "", baseUrl: "" };

function load<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ? { ...fallback, ...v } : fallback; } catch { return fallback; }
}
/** Read the stored AI director config (for sending with /api/v2/generate). */
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

const field = "w-full rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-sm text-graphite focus:outline-none focus:border-iris/60";
const lbl = "text-[11px] font-medium text-graphite-muted";

/** BYO-provider settings — the user picks their AI provider and pastes a token.
 *  Stored in the browser only; sent per-request so the server uses THEIR key. */
export const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [ai, setAi] = useState<AISettings>(EMPTY_AI);
  const [rs, setRs] = useState<RestyleSettings>(EMPTY_RS);
  const [googleKey, setGoogleKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (open) { setAi(load(AI_KEY, EMPTY_AI)); setRs(load(RESTYLE_KEY, EMPTY_RS)); setGoogleKey(loadGoogleKey()); setSaved(false); } }, [open]);
  if (!open || typeof document === "undefined") return null;

  const save = () => {
    try { localStorage.setItem(AI_KEY, JSON.stringify(ai)); localStorage.setItem(RESTYLE_KEY, JSON.stringify(rs)); localStorage.setItem(GOOGLE_KEY, JSON.stringify({ apiKey: googleKey.trim() })); } catch {}
    setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-graphite/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl card-light" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2"><KeyRound size={15} className="text-iris" /><h2 className="text-sm font-semibold text-graphite">AI providers — bring your own key</h2></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-graphite/40 hover:text-graphite hover:bg-paper-100"><X size={16} /></button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-5">
          {/* AI director */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-graphite"><Sparkles size={13} className="text-iris" /> AI director (idea → animation)</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={lbl}>Provider</span>
                <select className={field} value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value })}>
                  <option value="">None (use built-in heuristic)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="openai-compatible">OpenAI-compatible (Groq, OpenRouter…)</option>
                </select>
              </label>
              <label className="block"><span className={lbl}>Model</span>
                <input className={field} value={ai.model} placeholder={ai.provider === "anthropic" ? "claude-3-5-sonnet-latest" : ai.provider === "openai" ? "gpt-4o-mini" : "exact model id"} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
              </label>
            </div>
            {ai.provider && (
              <p className="text-[10px] leading-relaxed text-graphite/45">
                Use an EXACT model id your account can access — e.g. {ai.provider === "anthropic" ? "claude-3-5-sonnet-latest / claude-sonnet-4-5" : ai.provider === "openai" ? "gpt-4o / gpt-4o-mini" : "the id your provider lists"}. A wrong id makes the AI fall back to the quick draft (you'll see the exact error after generating).
              </p>
            )}
            {ai.provider === "openai-compatible" && (
              <label className="block"><span className={lbl}>Base URL</span>
                <input className={field} value={ai.baseUrl} placeholder="https://api.groq.com/openai/v1" onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} />
              </label>
            )}
            {ai.provider && (
              <label className="block"><span className={lbl}>API key / token</span>
                <input className={field} type="password" value={ai.apiKey} placeholder="paste your key…" onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} />
              </label>
            )}
          </section>

          {/* Restyle */}
          <section className="space-y-2.5 border-t border-line pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-graphite"><Wand2 size={13} className="text-iris" /> AI restyle (re-style your render)</div>
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
          </section>

          {/* Google Photorealistic 3D Tiles (Earth-style world) */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-graphite"><Sparkles size={13} className="text-cyan" /> Photoreal 3D world (Google Earth)</div>
            <div className="space-y-1">
              <span className={lbl}>Google Maps Platform API key</span>
              <input value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIza…" className={field} />
              <p className="text-[10.5px] leading-relaxed text-graphite/45">
                Enables the &ldquo;Photoreal 3D&rdquo; toggle in the editor — Google&apos;s real Earth 3D world in the preview. Create a key in Google Cloud with the <span className="text-graphite/65">Map Tiles API</span> enabled (billing required). Restrict it to your domains. Preview-only for now; exports fall back to satellite + terrain.
              </p>
            </div>
          </section>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-graphite/50">
            <ShieldCheck size={13} className="mt-px shrink-0 text-emerald-500" />
            Keys are stored in your browser only and sent securely with each request so the server uses your account. Leave a provider empty to fall back to the app's built-in director.
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
