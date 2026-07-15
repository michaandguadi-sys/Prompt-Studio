/**
 * AI provider abstraction for the Mapanisy director.
 *
 * The "director" (the brain that designs a map animation from an idea) is
 * model-agnostic: it just needs a chat completion that returns JSON. This module
 * lets the operator plug in ANY provider via environment config — Anthropic,
 * OpenAI, Google Gemini, Groq, Mistral, Together, Perplexity, xAI/Grok,
 * OpenRouter, Ollama, or any OpenAI-compatible endpoint.
 *
 * All providers except Anthropic and Gemini share the Chat Completions format
 * (they are normalised to provider="openai-compatible" with the right base URL).
 *
 * Configure with env vars (server-only):
 *   AI_PROVIDER          anthropic | openai | gemini | openai-compatible
 *   AI_MODEL             model id (provider-specific; sensible default per provider)
 *   ANTHROPIC_API_KEY    for provider=anthropic
 *   OPENAI_API_KEY       for provider=openai
 *   GOOGLE_AI_KEY        for provider=gemini
 *   AI_BASE_URL          base URL for provider=openai-compatible
 *   AI_API_KEY           bearer key for provider=openai-compatible
 */

export type AIProvider = "anthropic" | "openai" | "gemini" | "openai-compatible";

export type AIConfig = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  label: string;
};

// Named providers that use the OpenAI Chat Completions shape — auto-fill base URL.
export const NAMED_PROVIDERS: Record<string, { baseUrl: string; defaultModel: string; label: string }> = {
  // Z.ai (Zhipu GLM) — the BUILT-IN engine: glm-4.5-flash is free-tier, so every
  // user gets a working AI Director with zero setup. Set AI_MODEL=glm-4.6 (paid)
  // for the premium tier. OpenAI-compatible endpoint.
  zai:         { baseUrl: "https://api.z.ai/api/paas/v4",           defaultModel: "glm-4.5-flash",                                     label: "Z.ai (GLM)" },
  groq:        { baseUrl: "https://api.groq.com/openai/v1",        defaultModel: "llama-3.3-70b-versatile",                           label: "Groq" },
  mistral:     { baseUrl: "https://api.mistral.ai/v1",              defaultModel: "mistral-small-latest",                              label: "Mistral" },
  together:    { baseUrl: "https://api.together.xyz/v1",            defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",           label: "Together AI" },
  perplexity:  { baseUrl: "https://api.perplexity.ai",              defaultModel: "sonar-pro",                                         label: "Perplexity" },
  grok:        { baseUrl: "https://api.x.ai/v1",                    defaultModel: "grok-3-mini",                                       label: "xAI Grok" },
  openrouter:  { baseUrl: "https://openrouter.ai/api/v1",           defaultModel: "anthropic/claude-3.5-haiku",                        label: "OpenRouter" },
  ollama:      { baseUrl: "http://localhost:11434/v1",              defaultModel: "llama3.2",                                          label: "Ollama (local)" },
  cohere:      { baseUrl: "https://api.cohere.com/compatibility/v1", defaultModel: "command-r-plus-08-2024",                           label: "Cohere" },
  deepseek:    { baseUrl: "https://api.deepseek.com/v1",            defaultModel: "deepseek-chat",                                     label: "DeepSeek" },
  "fireworks": { baseUrl: "https://api.fireworks.ai/inference/v1",  defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", label: "Fireworks AI" },
};

export function resolveAIConfig(): AIConfig | null {
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  // ZAI_API_KEY is the BUILT-IN engine and wins inference (it's what the
  // platform ships with); an explicit AI_PROVIDER always overrides.
  const inferred: string =
    explicit ||
    (process.env.ZAI_API_KEY ? "zai" :
      process.env.ANTHROPIC_API_KEY ? "anthropic" :
        process.env.GOOGLE_AI_KEY ? "gemini" :
          process.env.AI_BASE_URL && (process.env.AI_API_KEY || process.env.OPENAI_API_KEY) ? "openai-compatible" :
            process.env.OPENAI_API_KEY ? "openai" : "");
  if (!inferred) return null;

  if (inferred === "zai") {
    const apiKey = process.env.ZAI_API_KEY || process.env.AI_API_KEY; if (!apiKey) return null;
    const named = NAMED_PROVIDERS.zai;
    const model = process.env.AI_MODEL || named.defaultModel;
    return { provider: "openai-compatible", model, apiKey, baseUrl: named.baseUrl, label: `${named.label} · ${model}` };
  }

  if (inferred === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
    const model = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    return { provider: "anthropic", model, apiKey, label: `Anthropic · ${model}` };
  }
  if (inferred === "gemini") {
    const apiKey = process.env.GOOGLE_AI_KEY; if (!apiKey) return null;
    const model = process.env.AI_MODEL || "gemini-2.0-flash";
    return { provider: "gemini", model, apiKey, label: `Google Gemini · ${model}` };
  }
  if (inferred === "openai") {
    const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return null;
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

export function aiConfigured(): boolean { return resolveAIConfig() !== null; }

export type UserAIConfig = { provider?: string; model?: string; apiKey?: string; baseUrl?: string };

/**
 * Validate a custom AI base URL against SSRF risks.
 * Blocks private IP ranges, link-local, cloud metadata endpoints.
 * Allows localhost only (needed for Ollama / local LLM runners).
 */
function isSsrfSafeUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  // Allow localhost for Ollama and local LLM runners
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  // Block private/RFC-1918 ranges and link-local
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return false;
  // Block IPv6 private ranges (fc00::/7)
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return false;
  // Block cloud metadata endpoints (AWS, GCP, Azure)
  if (["169.254.169.254", "metadata.google.internal", "169.254.170.2"].includes(host)) return false;
  return true;
}

/** Build a config from a user-supplied object (BYO key).
 *  Named providers (groq, mistral, etc.) auto-fill their base URL. */
export function configFromUser(u?: UserAIConfig): AIConfig | null {
  if (!u || !u.provider) return null;
  const provId = u.provider.toLowerCase();

  if (provId === "anthropic") {
    if (!u.apiKey) return null;
    const model = u.model || "claude-sonnet-5";
    return { provider: "anthropic", model, apiKey: u.apiKey, label: `Anthropic · ${model}` };
  }
  if (provId === "openai") {
    if (!u.apiKey) return null;
    const model = u.model || "gpt-4o-mini";
    return { provider: "openai", model, apiKey: u.apiKey, label: `OpenAI · ${model}` };
  }
  if (provId === "gemini") {
    if (!u.apiKey) return null;
    const model = u.model || "gemini-2.0-flash";
    return { provider: "gemini", model, apiKey: u.apiKey, label: `Google Gemini · ${model}` };
  }
  // Named providers that use the OpenAI-compatible shape
  const named = NAMED_PROVIDERS[provId];
  if (named) {
    // Ollama doesn't require an API key
    const apiKey = u.apiKey || (provId === "ollama" ? "ollama" : "");
    if (!apiKey) return null;
    // User may supply a custom base URL to override the default (e.g. self-hosted).
    // Validate it to prevent SSRF — named providers' built-in URLs are always trusted.
    const rawBase = u.baseUrl || named.baseUrl;
    if (u.baseUrl && !isSsrfSafeUrl(u.baseUrl)) return null;
    const baseUrl = rawBase.replace(/\/$/, "");
    const model = u.model || named.defaultModel;
    return { provider: "openai-compatible", model, apiKey, baseUrl, label: `${named.label} · ${model}` };
  }
  // Generic openai-compatible / custom — validate base URL to prevent SSRF
  if (provId === "openai-compatible" || provId === "custom") {
    if (!u.apiKey || !u.baseUrl) return null;
    if (!isSsrfSafeUrl(u.baseUrl)) return null;
    const baseUrl = u.baseUrl.replace(/\/$/, "");
    return { provider: "openai-compatible", model: u.model || "", apiKey: u.apiKey, baseUrl, label: `Custom · ${u.model || baseUrl}` };
  }
  return null;
}

export type AIResult = {
  text: string | null;
  error?: string;
  /** True when the model hit max_tokens and output was cut off — caller should repair or warn. */
  truncated?: boolean;
  /** Actual token usage if the provider returned it. */
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type AICallOpts = {
  /** Max output tokens. Defaults to 4096 — enough for a complete Composer Plan JSON.
   *  Director calls can use 1400; repair calls can use 600 to reduce cost. */
  maxTokens?: number;
  /** Sampling temperature. Lower = more deterministic (better for JSON generation).
   *  Defaults to provider's usual value; set 0.2-0.3 for structured output. */
  temperature?: number;
  /** Hard per-request timeout. A hung provider must never hang generation. */
  timeoutMs?: number;
  /** Automatic retries on transient failures (429/5xx/network). Default 2. */
  retries?: number;
};

/** fetch with a hard timeout — a stalled provider connection aborts cleanly. */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** Retry transient failures (429, 5xx, network/timeout) with short backoff.
 *  4xx config errors (bad key, bad model) fail immediately — retrying can't fix them. */
async function withRetries(
  attempt: () => Promise<AIResult>,
  retries: number,
): Promise<AIResult> {
  let last: AIResult = { text: null, error: "No attempts made" };
  for (let i = 0; i <= retries; i++) {
    last = await attempt();
    if (last.text !== null) return last;
    const transient = !last.error || /\b(429|5\d\d)\b|timed out|network|fetch failed|ECONNRESET|ETIMEDOUT|aborted/i.test(last.error);
    if (!transient) return last;
    if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1) + Math.random() * 400));
  }
  return last;
}

export async function aiComplete(
  system: string,
  user: string,
  cfg = resolveAIConfig(),
  opts: AICallOpts = {},
): Promise<AIResult> {
  if (!cfg) return { text: null, error: "No AI provider configured." };
  return withRetries(() => aiCompleteOnce(system, user, cfg, opts), opts.retries ?? 2);
}

async function aiCompleteOnce(
  system: string,
  user: string,
  cfg: AIConfig,
  opts: AICallOpts,
): Promise<AIResult> {
  const maxTok = opts.maxTokens ?? 4096;
  const temp = opts.temperature;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  try {
    if (cfg.provider === "anthropic") {
      const body: Record<string, unknown> = {
        model: cfg.model, max_tokens: maxTok, system,
        messages: [{ role: "user", content: user }],
      };
      if (temp !== undefined) body.temperature = temp;
      const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      }, timeoutMs);
      if (!res.ok) return { text: null, error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 180)}` };
      const d = await res.json();
      const truncated = d?.stop_reason === "max_tokens";
      const usage = { inputTokens: d?.usage?.input_tokens, outputTokens: d?.usage?.output_tokens };
      return { text: d?.content?.[0]?.text ?? null, truncated, usage };
    }

    if (cfg.provider === "gemini") {
      const model = cfg.model || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTok, temperature: temp ?? 0.7 },
        }),
      }, timeoutMs);
      if (!res.ok) return { text: null, error: `Gemini ${res.status}: ${(await res.text()).slice(0, 180)}` };
      const d = await res.json();
      const finishReason = d?.candidates?.[0]?.finishReason;
      const truncated = finishReason === "MAX_TOKENS";
      const usage = { inputTokens: d?.usageMetadata?.promptTokenCount, outputTokens: d?.usageMetadata?.candidatesTokenCount };
      return { text: d?.candidates?.[0]?.content?.parts?.[0]?.text ?? null, truncated, usage };
    }

    // openai + openai-compatible share the Chat Completions shape.
    const base = cfg.provider === "openai" ? "https://api.openai.com/v1" : (cfg.baseUrl || "").replace(/\/$/, "");
    if (!base) return { text: null, error: "Missing base URL for openai-compatible provider." };

    // ── Z.ai (GLM) tuning — the built-in engine must be FAST and emit clean JSON ──
    // GLM-4.5+ are hybrid-reasoning models that default to a slow "thinking"
    // phase; the Director doesn't need it (our prompts carry the reasoning), so
    // disable it via Z.ai's `thinking` extension. GLM is also prone to markdown
    // fences / preamble, so pin an explicit output contract on the system prompt.
    const isZai = base.includes("api.z.ai");
    const sys = isZai
      ? `${system}\n\nOUTPUT CONTRACT (CRITICAL): Reply with the requested output ONLY. No markdown fences, no commentary, no <think> tags, no preamble — the FIRST character of your reply must be the first character of the answer itself (e.g. '{' or '[' for JSON).`
      : system;
    const body: Record<string, unknown> = {
      model: cfg.model,
      // GLM flash is most reliable for structured output near-deterministic.
      temperature: temp ?? (isZai ? 0.3 : 0.6),
      max_tokens: maxTok,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    };
    if (isZai) body.thinking = { type: "disabled" };

    const res = await fetchWithTimeout(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    }, timeoutMs);
    if (!res.ok) return { text: null, error: `${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 180)}` };
    const d = await res.json();
    const truncated = d?.choices?.[0]?.finish_reason === "length";
    const usage = { inputTokens: d?.usage?.prompt_tokens, outputTokens: d?.usage?.completion_tokens };
    let text: string | null = d?.choices?.[0]?.message?.content ?? null;
    // Load-bearing for GLM: it ignores "no fences / no <think>" in the prompt and
    // STILL wraps JSON in ```json fences (verified live) — so strip them here or
    // every downstream JSON.parse fails. Handles any language tag / case, and
    // any leaked reasoning block.
    if (text && isZai) {
      text = text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")   // leaked reasoning block
        .replace(/^\s*```[a-z]*\s*\r?\n?/i, "")        // opening fence: ```json / ```JSON / ```
        .replace(/\r?\n?\s*```\s*$/i, "")               // closing fence
        .trim() || null;
    }
    return { text, truncated, usage };
  } catch (e: any) {
    return { text: null, error: String(e?.message ?? e) };
  }
}

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
    return d?.data?.[0]?.url ?? (d?.data?.[0]?.b64_json ? `data:image/png;base64,${d.data[0].b64_json}` : null);
  } catch { return null; }
}
