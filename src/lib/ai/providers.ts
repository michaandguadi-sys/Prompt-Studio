/**
 * AI provider abstraction for the Mapanisy director.
 *
 * The "director" (the brain that designs a map animation from an idea) is
 * model-agnostic: it just needs a chat completion that returns JSON. This module
 * lets the operator plug in ANY provider via environment config — Anthropic,
 * OpenAI, or any OpenAI-compatible endpoint (Groq, Together, OpenRouter, Mistral,
 * a local server, …). Adding a new provider = one more branch in `aiComplete`.
 *
 * Configure with env vars (server-only):
 *   AI_PROVIDER          anthropic | openai | openai-compatible
 *                        (auto-detected from keys if unset)
 *   AI_MODEL             model id (provider-specific; sensible default per provider)
 *   ANTHROPIC_API_KEY    for provider=anthropic
 *   OPENAI_API_KEY       for provider=openai
 *   AI_BASE_URL          base URL for provider=openai-compatible (e.g. https://api.groq.com/openai/v1)
 *   AI_API_KEY           bearer key for provider=openai-compatible
 *
 * Note on generative media (Higgsfield / image-video models): those are a
 * different capability (text→image/video), not a director. The extension point
 * for them is the `image` layer's source — see `generateImage()` below, which is
 * a thin, optional hook an operator can wire to any image-gen API.
 */

export type AIProvider = "anthropic" | "openai" | "openai-compatible";

export type AIConfig = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  label: string; // human-readable, surfaced in API responses
};

/** Resolve the active provider from env (explicit AI_PROVIDER wins; else infer). */
export function resolveAIConfig(): AIConfig | null {
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase() as AIProvider | "";
  const inferred: AIProvider | "" =
    explicit ||
    (process.env.ANTHROPIC_API_KEY ? "anthropic" :
      process.env.AI_BASE_URL && (process.env.AI_API_KEY || process.env.OPENAI_API_KEY) ? "openai-compatible" :
        process.env.OPENAI_API_KEY ? "openai" : "");
  if (!inferred) return null;

  if (inferred === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const model = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    return { provider: "anthropic", model, apiKey, label: `Anthropic · ${model}` };
  }
  if (inferred === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    return { provider: "openai", model, apiKey, label: `OpenAI · ${model}` };
  }
  // openai-compatible
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  const model = process.env.AI_MODEL || "";
  return { provider: "openai-compatible", model, apiKey, baseUrl, label: `Custom · ${model || baseUrl}` };
}

/** Is ANY director provider configured? (cheap check for response flags) */
export function aiConfigured(): boolean {
  return resolveAIConfig() !== null;
}

/** Build a config from a USER-supplied object (BYO key, sent from the client).
 *  Returns null if incomplete so callers fall back to server env / heuristic. */
export type UserAIConfig = { provider?: string; model?: string; apiKey?: string; baseUrl?: string };
export function configFromUser(u?: UserAIConfig): AIConfig | null {
  if (!u || !u.apiKey || !u.provider) return null;
  const provider = u.provider.toLowerCase() as AIProvider;
  if (provider === "anthropic") return { provider, model: u.model || "claude-sonnet-4-5", apiKey: u.apiKey, label: `Anthropic · ${u.model || "claude-sonnet-4-5"}` };
  if (provider === "openai") return { provider, model: u.model || "gpt-4o-mini", apiKey: u.apiKey, label: `OpenAI · ${u.model || "gpt-4o-mini"}` };
  if (provider === "openai-compatible") {
    if (!u.baseUrl) return null;
    return { provider, model: u.model || "", apiKey: u.apiKey, baseUrl: u.baseUrl.replace(/\/$/, ""), label: `Custom · ${u.model || u.baseUrl}` };
  }
  return null;
}

/**
 * Run one system+user completion on the configured provider and return the raw
 * text (the caller extracts JSON). Returns null on any failure so callers can
 * fall back to the heuristic planner. We deliberately DON'T set a JSON
 * response_format — many OpenAI-compatible providers reject it; instead the
 * system prompt demands JSON and callers slice between the outer braces.
 */
export type AIResult = { text: string | null; error?: string };

export async function aiComplete(system: string, user: string, cfg = resolveAIConfig()): Promise<AIResult> {
  if (!cfg) return { text: null, error: "No AI provider configured." };
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        // Lean on tokens: ~1k output is plenty for a plan; keep input tight.
        body: JSON.stringify({ model: cfg.model, max_tokens: 1100, system, messages: [{ role: "user", content: user }] }),
      });
      if (!res.ok) return { text: null, error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 180)}` };
      const d = await res.json();
      return { text: d?.content?.[0]?.text ?? null };
    }

    // openai + openai-compatible share the Chat Completions shape.
    const base = cfg.provider === "openai" ? "https://api.openai.com/v1" : (cfg.baseUrl || "").replace(/\/$/, "");
    if (!base) return { text: null, error: "Missing base URL for openai-compatible provider." };
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.6,
        max_tokens: 1100,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return { text: null, error: `${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 180)}` };
    const d = await res.json();
    return { text: d?.choices?.[0]?.message?.content ?? null };
  } catch (e: any) {
    return { text: null, error: String(e?.message ?? e) };
  }
}

/**
 * OPTIONAL generative-image hook (extension point for Higgsfield-style models).
 * An operator can set AI_IMAGE_URL (an OpenAI-images-compatible endpoint) +
 * AI_IMAGE_KEY to let the studio generate imagery for `image` layers. Returns a
 * URL (or data URI) or null. Left unwired by default — purely a seam.
 */
export async function generateImage(prompt: string): Promise<string | null> {
  const url = process.env.AI_IMAGE_URL;
  const key = process.env.AI_IMAGE_KEY || process.env.OPENAI_API_KEY;
  if (!url || !key || !prompt) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.AI_IMAGE_MODEL || "gpt-image-1", prompt, n: 1, size: "1024x1024" }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.data?.[0]?.url ?? d?.data?.[0]?.b64_json ? (d.data[0].url ?? `data:image/png;base64,${d.data[0].b64_json}`) : null;
  } catch {
    return null;
  }
}
