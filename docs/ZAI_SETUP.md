# Z.ai — the built-in AI story engine

Mapanisy ships with a **built-in AI Director** powered by Z.ai's GLM models.
`glm-4.5-flash` is Z.ai's **free-tier model**, so every user gets a working AI
story engine with zero setup — and power users can still bring their own
favorite model (Anthropic, OpenAI, Gemini, Groq, …) in **Settings → AI keys**
to upgrade quality.

## What you need to do (one time, ~2 minutes)

1. **Get the API key** — log in at [z.ai](https://z.ai), open
   **API Keys** (https://z.ai/manage-apikey/apikey-list) and create a key.
2. **Add it to the server env** (`.env.local` for dev, `.env.production` on the
   VPS — never committed):

   ```bash
   ZAI_API_KEY=sk-...          # ← the only REQUIRED line
   # Optional overrides:
   # AI_MODEL=glm-4.5-flash    # default — the free model
   # AI_MODEL=glm-4.6          # flagship GLM for premium quality (paid per token)
   # AI_PROVIDER=zai           # only needed if OTHER AI keys are also set
   ```

3. Restart the app. `GET /api/health` should now report `"ai": {"configured": true}`.

That's it. No code changes, no base URL, no model list — `ZAI_API_KEY` alone
activates the engine.

## How it's wired (for reference)

- **Endpoint:** `https://api.z.ai/api/paas/v4/chat/completions` (OpenAI-compatible).
- **Resolution order** (`src/lib/ai/providers.ts` → `resolveAIConfig`):
  explicit `AI_PROVIDER` → `ZAI_API_KEY` (built-in default) → Anthropic →
  Gemini → custom base URL → OpenAI.
- **Verified live (2026-07-09, glm-4.5-flash):** clean parseable JSON for both
  the director and interview flows, `{` as the first character, ~6s warm
  latency. Disabling GLM's default "thinking" phase is **essential** — measured
  ~60% faster (5.6–6.5s vs 13.5–15.7s) AND it prevents truncation (thinking
  otherwise eats the whole token budget → cut-off JSON). GLM ignores the
  "no fences" instruction and still wraps output in ```json — the provider layer
  strips it, so downstream `JSON.parse` always sees clean JSON.
- **Per-request tuning for GLM** (automatic when the base URL is `api.z.ai`):
  - `thinking: { type: "disabled" }` — GLM-4.5+ are hybrid-reasoning models that
    default to a slow thinking phase; the Director's prompts already carry the
    reasoning, so disabling it makes responses fast.
  - Temperature defaults to **0.3** (structured-JSON reliability).
  - A hard **output contract** is appended to every system prompt (JSON only,
    no fences, no `<think>`, no preamble), and any leaked `<think>` block or
    markdown fence is stripped before parsing.
- **BYO upgrade:** users add their own key in Settings (Z.ai is also in that
  list). A user config always wins over the built-in engine for their requests:
  `configFromUser(body.ai) ?? resolveAIConfig()` in every AI route.
- **Strict AI mode** is unchanged: when a user selects "AI-directed", failures
  error loudly — they never silently fall back to the heuristic engine.

## Model guidance

| Model | Cost | Use |
|---|---|---|
| `glm-4.5-flash` | **Free** | The built-in default — fast, good JSON discipline |
| `glm-4.5-air` | Very low | Slightly better quality, still fast |
| `glm-4.6` | Paid | Flagship — consider for the Pro tier's "premium AI Director" |

> Verify the current free-tier model name in the Z.ai console when you create
> the key — Z.ai promotes newer `-flash` models over time; if the free model has
> a newer name, set it via `AI_MODEL=` (no code change needed).

## Rate-limit reality (free tier)

Free-tier GLM has modest rate/concurrency limits. The app already:
- rate-limits every AI route per user (10–30 req/min),
- retries transient 429/5xx with backoff (`withRetries`),
- times out hung requests (90s hard abort, client-side too).

If launch traffic outgrows the free tier, either upgrade the Z.ai plan or set
`AI_MODEL=glm-4.5-air` — no code change either way.
