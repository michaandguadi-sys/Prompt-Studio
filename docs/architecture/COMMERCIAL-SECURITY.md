> **Part of the Mapinsy master architecture proposal.** Read [ARCHITECTURE.md](../../ARCHITECTURE.md) first — it holds the reconciliation decisions where the four deliverables differ, and its canonical choices supersede this document.
> Superseded by reconciliation: the sketched `render_jobs` table in §2.4 is replaced by the richer `renders` table (DB-SCHEMA.md) extended with `tier_at_render`, `price_credits`, `ledger_entry_id`. `credit_ledger`, `user_ai_keys`, `user_devices` here ARE the canonical designs.

# Mapinsy — Commercial Logic, Security & Token Economics

**Deliverable scope:** commercial and security architecture layered on the existing Clerk + Stripe + quota/tier code. Everything here **extends** working subsystems (`src/lib/tiers.ts`, `src/lib/quota.ts`, `src/lib/stripe.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/v2/render/route.ts`) rather than replacing them. All enforcement is **server-authoritative**: the render queue and the v2 API routes are the only trust boundaries; nothing billed or branded is decided client-side.

---

## 0. Design principles

1. **One choke point per money decision.** Every render passes through `POST /api/v2/render` (`app/api/v2/render/route.ts`) before it reaches either queue (`src/lib/serverRender.ts` cloud, `src/lib/agentBridge.ts` agent). That route already does auth → `checkQuota` → watermark derivation → enqueue. All new commercial logic (complexity pricing, token debits, resolution clamps, outro flags) is inserted at that same point, plus the mirrored legacy point `app/api/agent/render/route.ts`.
2. **The agent path is untrusted.** Renders on the self-hosted agent (`packages/agent/agent.mjs` via `app/api/agent/script/route.ts`) execute on the user's machine against the public bundle `public/remotion-bundle/`. Any flag delivered there (watermark, scale) is advisory. Consequence: **free-tier and PAYG renders are forced onto the cloud path**; the agent path is a paid-tier benefit only.
3. **Proportionate security.** Passkeys + session caps + coarse hashed device signals. No canvas/audio fingerprinting, no raw-IP retention, no behavioral tracking.
4. **Flag, don't overwrite.** Where the brief conflicts with shipped code (§7), the conflict is surfaced as a product decision, not silently patched.

---

## 1. Current state (verified in repo)

| Concern | What exists today | Where |
|---|---|---|
| Tiers | `Tier = "free"\|"creator"\|"teams"\|"custom"\|"agency"`; free `maxRenders: 3`, paid tiers `unlimited: true` at $19/$39/$99; free features literally say `"1080p export"` and `"Watermark"` | `src/lib/tiers.ts` |
| Quota | `checkQuota(userId)` — count mode for free (3 completed `render_logs` rows/period), minutes mode (never-binding `UNLIMITED_MIN` sentinel) for paid; `BYPASS_QUOTA=true` returns tier `"teams"` | `src/lib/quota.ts` |
| Metering source of truth | `render_logs.duration_seconds` decimal(10,2); client self-reports via `POST /api/render-log` (honor system, 7200s cap) and `POST /api/agent/complete` inserts rows for count-metered tiers | `src/lib/db/schema.ts`, `app/api/render-log/route.ts`, `app/api/agent/complete/route.ts` |
| Stripe | Subscriptions only — `mode: "subscription"` hard-coded (`app/api/stripe/checkout/route.ts:67`); webhook `syncSubscription` understands only recurring subs; `tierFromStripePrice` maps env price IDs | `src/lib/stripe.ts`, `app/api/webhooks/stripe/route.ts` |
| Watermark | Server-derived `const watermark = !!db && quota.tier === "free"` (`app/api/v2/render/route.ts:94`, `app/api/agent/render/route.ts:121`); drawn inline at `src/v2/render/MapComposition.tsx:784` and legacy `src/remotion/Watermark.tsx`. **No outro exists.** | as cited |
| Resolution | None. `dimsFor()` is always 4K-class (`src/v2/doc/schema.ts:942`); client-supplied `settings.scale` passes untouched into both queues | `app/api/v2/render/route.ts` |
| Complexity | Client-side only, legacy-schema `complexityOf()` (reads `scene?.mapStyleUrl`, `scene?.terrain?.enabled` — fields that don't exist on v2 `Composition`); feeds localStorage ETA, never billing | `src/lib/renderHistory.ts:70` |
| BYOK | Browser localStorage (`"mapanisy-ai"` etc., `src/v2/ui/SettingsModal.tsx`), sent per-request as `body.ai`; server resolves via `configFromUser(body.ai) ?? resolveAIConfig()` with SSRF guard; **no server record, zero billing effect**; `aiComplete` already returns `usage: {inputTokens, outputTokens}` and generate computes `_meta.tokensUsed` — **never persisted** | `src/lib/ai/providers.ts`, `app/api/v2/generate/route.ts` |
| Anti-sharing | Nothing. No WebAuthn/passkey, no sessions table, no fingerprinting (grep-verified). Agent key is a second credential: 40-hex **plaintext** in `users.agent_key`, authenticated via `?key=` query string | `app/api/agent-key/route.ts`, `app/api/agent/job/route.ts` |

---

## 2. Tier model and enforcement matrix

### 2.1 Tier definitions (extension of `src/lib/tiers.ts`)

Extend the `Tier` union — keep existing ids stable per the file's own comment ("tier IDs are kept stable … so DB rows, the Stripe price env vars, and tierFromStripePrice don't churn"):

```ts
// src/lib/tiers.ts (extended)
export type Tier =
  | "free"          // 3 renders/mo, 720p, outro, showcase
  | "payg"          // no subscription; prepaid credit balance, per-render pricing
  | "pool"          // $11.99/mo or /yr — monthly token pool
  | "lifetime"      // EUR 60 one-time, unlimited (beta cohort)
  | "creator" | "teams" | "custom" | "agency"; // existing — see conflict C2

export type TierConfig = {
  /* existing fields unchanged */
  maxScale: number;            // NEW: hard resolution ceiling, server-clamped
  outro: boolean;              // NEW: Made-with-Mapinsy outro forced on
  showcaseEligible: boolean;   // NEW: renders may enter the public gallery
  agentAllowed: boolean;       // NEW: may render on self-hosted agent (trust gate)
  maxSessions: number;         // NEW: concurrent-session cap (§4.2)
  monthlyCredits: number | null; // NEW: token pool grant per period ("pool" tier)
  billing: "none" | "prepaid" | "subscription" | "onetime";
};
```

Concrete values:

| Tier | Renders | `maxScale` (16:9 base 3840×2160, `dimsFor` in `src/v2/doc/schema.ts`) | Outro | Showcase | Agent | Sessions | Billing |
|---|---|---|---|---|---|---|---|
| `free` | 3/mo (existing `maxRenders: 3`) | **0.34 → 1305×734 ≈ 720p** | yes | yes (opt-out consent, §2.4) | no | 2 | none |
| `payg` | unlimited count, each debits credits | 1.0 | no | no | no (cloud renders are what's being sold) | 2 | prepaid credits |
| `pool` | until pool empty; renders debit pool | 1.0 | no | no | yes | 3 | $11.99 sub (monthly + yearly price IDs) |
| `lifetime` | unlimited | 1.0 | no | no | yes | 3 | EUR 60 one-time |
| existing paid | unchanged until decision C2 | 1.0 | no | no | yes | 3–5 | subscription |

### 2.2 Complexity score and PAYG price formula

**New module `src/lib/billing/complexity.ts`** — a server-side, v2-schema scorer replacing the legacy client `complexityOf()` (`src/lib/renderHistory.ts:70`, which reads fields that don't exist on v2 `Composition` — see rendering gap). It consumes the **post-`validateProject` fixed project** plus the **post-clamp settings**, so it prices exactly what will render.

```ts
export function renderComplexity(project: Project, settings: { scale: number }): {
  score: number; frames: number; pixels: number; factors: Record<string, number>;
} {
  const comps = project.scenes.length ? project.scenes.map(s => s.composition)
                                      : [project.composition];
  let score = 0;
  for (const c of comps) {
    const { width, height } = dimsFor(c.aspect);              // src/v2/doc/schema.ts
    const frames = Math.round(c.durationSec * c.fps);         // fps is z.literal(24)
    const R = (width * height * settings.scale ** 2) / (1280 * 720); // 720p = 1.0; 1080p ≈ 2.25; 4K ≈ 9.0
    const layers = c.layers.filter(l => l.type !== "camera").length;
    const L = 1 + 0.05 * Math.min(layers, 20);                // +5%/layer, cap +100%
    const T = (c.basemap.terrain ? 1.4 : 1)
            * (c.basemap.buildings3d ? 1.15 : 1)
            * ((c.basemap.styleUrl.includes("satellite") || c.basemap.photoreal3d) ? 1.25 : 1)
            * (c.layers.some(l => l.type === "earthlayer") ? 1.15 : 1); // GIBS raster fetch
    score += (frames / 240) * R * L * T;                      // 10 s @720p, flat map, few layers ≈ 1.0
  }
  return { score, /* … */ };
}
```

The multipliers deliberately mirror the empirically tuned legacy ones (satellite 1.3, terrain 1.5, buildings 1.2 in `renderHistory.ts:73-78`), re-based on v2 fields (`basemap.terrain`, `basemap.buildings3d`, `basemap.styleUrl`, `basemap.photoreal3d`).

**Price formula (PAYG, charged in credits; 1 credit = €0.01):**

```
priceCredits = clamp(49, 1999, round(49 × score))
```

- 10 s, 720p, simple map → 49 credits (**€0.49** floor)
- 30 s, 1080p, terrain + 8 layers → ≈ 49 × (3 × 2.25 × 1.4 × 1.4) ≈ 649 credits (**€6.49**)
- 60 s, 4K, terrain + satellite + 15 layers → hits the **€19.99** ceiling (above the ceiling, the UI should push the pool/lifetime tiers instead)

**Where it runs (exact insertion points):**
1. `app/api/v2/render/route.ts` — after `validateProject(project)` and the settings clamp, **before** the enqueue branch at lines ~106–120. The result (`score`, `priceCredits`) is written to the durable job row (§2.4) and returned in the enqueue response so the client can show the price *that was charged*, not estimate it.
2. `app/api/agent/render/route.ts:121` region — same call for the legacy agent path.
3. **Preflight quote endpoint** `POST /api/v2/render/quote` (new, thin): body `{ project, settings }` → `{ score, priceCredits, tierAllows }`. Runs the same function so RenderButton (`src/v2/ui/RenderButton.tsx` presets already carry `scale`) can display "This render: €1.47 / 147 credits" before the user commits. Client display only — the charge is always recomputed server-side at enqueue.
4. **Debit at enqueue, settle at completion:** debit `priceCredits` when the job row is created; on `failed`/`cancelled` (statuses already modeled in `ServerRenderJob`, `src/lib/serverRender.ts`) the completion handler credits it back. Completion hooks: the render worker exit path in `src/lib/serverRender.ts` and `POST /api/agent/complete` (`app/api/agent/complete/route.ts`), which already writes `render_logs`.

### 2.3 Enforcement matrix — exact server points

| Rule | Enforcement point (server-authoritative) | Mechanism |
|---|---|---|
| Free: 3 renders/mo | `app/api/v2/render/route.ts:85-93` — **already shipped**: `checkQuota` count mode + 402 `quota_exceeded`; same check exists in `app/api/agent/render/route.ts` | keep as-is; source of truth `render_logs` (`src/lib/db/schema.ts`) |
| Free: 720p cap | `app/api/v2/render/route.ts` — new clamp `settings.scale = Math.min(settings.scale ?? 1, TIERS[quota.tier].maxScale)` immediately after `checkQuota`, **before** either `enqueueAgentJob(...)` or `enqueueServerRender(...)`; identical clamp in `app/api/agent/render/route.ts` and in `POST /api/v2/snapshot` (`app/api/v2/snapshot/route.ts` already reads `checkQuota(user.id).tier` for its watermark — reuse that lookup) | server clamp; client `RenderButton.tsx` presets become cosmetic |
| Free: outro clip | render pipeline, §6 | composition-level `Sequence`, cloud-only path |
| Free: showcase inclusion | save path `POST /api/v2/projects` + completion hook; new `showcase_opt_out` consent flag (§2.4). Inclusion = free-tier completed render + no opt-out → row in `showcase_entries` referencing the existing `projects_v2.share_token` public-viewer mechanism (`app/v/[token]/page.tsx`, `/api/v2/share/[token]` — already middleware-public) | reuses share-token viewer; consent surfaced at first free render (GDPR: inclusion must be disclosed at signup and revocable from `/dashboard`) |
| PAYG: per-render debit | `app/api/v2/render/route.ts`, same block as the free 402: if `tier === "payg"`, `debitCredits(userId, priceCredits, jobId)` — insufficient balance → 402 `{ error: "insufficient_credits", needed, balance, topUpUrl }` | atomic ledger insert with balance check (single SQL statement, §3.2) |
| PAYG: top-up | `app/api/stripe/checkout/route.ts` — add `mode: "payment"` branch for credit-pack price IDs (`STRIPE_PRICE_CREDITS_5/15/50`); webhook `checkout.session.completed` with `metadata.kind === "credits"` → ledger credit. **Conflict flag:** checkout currently hard-codes `mode: "subscription"` at line 67 and rejects unknown priceIds at line 35 — both lists must be extended | Stripe one-time payment |
| Pool $11.99: monthly grant | `app/api/webhooks/stripe/route.ts` `syncSubscription` — on `customer.subscription.created/updated` for the pool price IDs (`STRIPE_PRICE_POOL_MONTHLY`, `STRIPE_PRICE_POOL_YEARLY`, both mapping to tier `"pool"` via `tierFromStripePrice`), insert a `grant` ledger entry of `monthlyCredits` (proposed: **1 500 credits = €15 face value** at the $11.99 price; yearly grants monthly on `invoice` events or period rollover). Unused credits expire at period end (grant entries carry `expiresAt = currentPeriodEnd`) | reuses existing webhook + `subscriptions.currentPeriodStart/End` columns |
| Pool: render debit | same choke point as PAYG; when the pool is empty mid-period → 402 with "pool exhausted — pay per render or wait for renewal" (fall through to PAYG pricing if the user has topped-up credits) | ledger |
| Lifetime €60 | checkout `mode: "payment"`, currency `eur`, `metadata.kind = "lifetime"`; webhook `checkout.session.completed` → set `subscriptions.tier = "lifetime"`, `status = "active"`, no period columns. **Conflict flag:** `syncSubscription` and `customer.subscription.deleted` handling are recurring-only today — the lifetime branch must live in the `checkout.session.completed` handler, and the `subscription.deleted` handler must never downgrade a lifetime row | Stripe one-time; tier check everywhere else is just `TIERS[tier]` |
| Paid tiers: quota | unchanged (`UNLIMITED_MIN` sentinel) — but see conflict C7: `quota.unit === "animation"` is the only 402 branch today; the credit-debit branch added above becomes the second | |
| AI generation cost | `app/api/v2/generate/route.ts` — persist `_meta.tokensUsed` + `aiComplete` usage into the ledger (§3); free tier additionally rate-limited by the existing `rateLimit("generate", clerkId, {10,60})` | ledger `usage` entries (informational for BYOK, billable for house-key) |

### 2.4 DB changes (drizzle, `src/lib/db/schema.ts`)

```ts
// Durable job + billing record — also fixes rendering gap "all three job stores are in-memory Maps"
export const renderJobs = pgTable("render_jobs", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),                    // 'cloud' | 'agent'
  status: text("status").notNull().default("queued"),
  tierAtRender: text("tier_at_render").notNull(),
  scale: decimal("scale", { precision: 4, scale: 2 }).notNull(),
  complexityScore: decimal("complexity_score", { precision: 8, scale: 3 }).notNull(),
  priceCredits: integer("price_credits").notNull().default(0),
  ledgerEntryId: uuid("ledger_entry_id"),          // the debit; refunded on failure
  brandingOutro: boolean("branding_outro").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export const creditLedger = pgTable("credit_ledger", { /* §3.2 */ });
export const userAiKeys   = pgTable("user_ai_keys",  { /* §5.1 */ });
export const userDevices  = pgTable("user_devices",  { /* §4.3 */ });

// users: + showcaseOptOut boolean default false
// subscriptions: + billingMode text ('subscription'|'onetime'|'prepaid'|'none')
```

`checkQuota` (`src/lib/quota.ts`) gains a third mode: `unit: "credit"` for `payg`/`pool`, reading `SUM(delta)` from `credit_ledger` instead of `render_logs`. `render_logs` stays as the free-tier count meter and audit trail. **Note:** `drizzle/migrations/` does not exist (push-only workflow, `drizzle.config.ts`) — these tables are the moment to start committed migrations.

---

## 3. BYOK token economics

### 3.1 The billing split

When a **verified** user AI key exists (server-stored per §5, verified via the existing `POST /api/ai/test` one-token ping), the AI calls in `app/api/v2/generate`, `edit`, `interview`, `storyarc` run on the user's key (`configFromUser` already prefers `body.ai` over env — this preference order is kept; the server-stored key becomes the source instead of the per-request localStorage payload). What changes is **which line items bill**:

| Line item | Ledger `kind` | House key | Verified BYOK | Measured where |
|---|---|---|---|---|
| Raw AI tokens (Director + Composer + repair calls) | `ai_tokens` | billed at provider cost + margin | **drops to 0** (user pays their provider directly) | `AIResult.usage.{inputTokens,outputTokens}` from `aiComplete` (`src/lib/ai/providers.ts`); summed as `_meta.tokensUsed` in `app/api/v2/generate/route.ts` — today computed, returned, **never persisted** |
| Camera-script conversion (Director script → composer context → camera keyframes) | `fee_camera_script` | included in token margin | **remains** — flat workflow fee per successful generate that ran Phase 1 (`shouldRunDirector` true) | generate route, at the point the 200 response is assembled |
| Style layers (signature style lock, pro-style application, place grounding/geocode) | `fee_style_layers` | included | **remains** — flat fee per generate that invoked `signatureStyleById`/`groundPlaces` | same |
| Cloud render minutes | `fee_render_minutes` | complexity price (§2.2) | **remains unchanged** — BYOK never discounts rendering; the GPU is ours | `render_jobs` completion |
| Voiceover TTS | `ai_voiceover` | n/a (already BYOK-only: ElevenLabs key required in `POST /api/v2/voiceover` body) | 0 | — |

Proposed workflow-fee numbers (product decision, encoded as constants in `src/lib/billing/fees.ts`): `fee_camera_script` = 5 credits, `fee_style_layers` = 2 credits per generate; free tier's 3 monthly renders include their generates fee-free (rate limit is the abuse control there).

### 3.2 Token ledger — concrete stored parameters

```ts
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),          // 'grant' | 'topup' | 'render_debit' | 'render_refund'
                                         // | 'ai_tokens' | 'fee_camera_script' | 'fee_style_layers' | 'expiry'
  delta: integer("delta").notNull(),     // credits; + credit, − debit
  balanceAfter: integer("balance_after").notNull(),
  // provenance
  jobId: text("job_id"),                 // render_jobs.id for render entries
  projectId: text("project_id"),         // projects_v2.id
  route: text("route"),                  // '/api/v2/generate' etc.
  provider: text("provider"),            // AIConfig.label ('anthropic', 'openai-compatible:groq', …)
  model: text("model"),
  byok: boolean("byok").notNull().default(false),   // true → ai token entries are 0-delta informational
  aiTokensIn: integer("ai_tokens_in"),
  aiTokensOut: integer("ai_tokens_out"),
  complexityScore: decimal("complexity_score", { precision: 8, scale: 3 }),
  renderSeconds: decimal("render_seconds", { precision: 10, scale: 2 }),
  stripeRef: text("stripe_ref"),         // payment_intent / invoice id for topup/grant
  expiresAt: timestamp("expires_at"),    // pool grants only
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("credit_ledger_user_idx").on(t.userId, t.createdAt)]);
```

Rules: balance is `SUM(delta)` scoped to non-expired entries; debits execute as a single `INSERT … SELECT` guarded by `balanceAfter >= 0` (atomic — no read-then-write race across serverless instances); **BYOK `ai_tokens` entries are always written with `delta: 0`** so the usage dashboard ("your key did 1.2M tokens this month") works without billing. This directly closes the audit gap "`_meta.tokensUsed` is computed and returned yet never persisted" (ai-pipeline map, gap 10).

---

## 4. Anti-credential-sharing (proportionate)

### 4.1 Passkey/WebAuthn — via Clerk, not a parallel stack

Clerk (already the sole auth layer: `middleware.ts` `clerkMiddleware`, `app/layout.tsx` `ClerkProvider`) ships first-party passkey support. **Do not build a custom `passkey_credentials` table** — that would be a parallel auth system alongside a working one. Instead:

- Enable passkeys in the Clerk dashboard; enrollment UI via Clerk's `user.createPasskey()` surfaced in `/dashboard` (which already hosts "AI keys" settings per `app/(studio)/dashboard/page.tsx`).
- **Policy, enforced server-side where value concentrates:**
  - `lifetime` purchase and BYOK key registration (§5) require a passkey-verified or freshly re-authenticated session (Clerk step-up / `sessionClaims` check inside `app/api/stripe/checkout/route.ts` and the new key route).
  - `pool`/`lifetime` users are prompted (not forced) to enroll at first render; enrollment lifts the session cap by +1 (carrot, not stick).
  - Abuse-heuristic triggers (§4.4) demand a passkey step-up before the next render instead of blocking outright.

### 4.2 Session-concurrency limits

Clerk is the session store; there is deliberately no home-grown session table. Concurrency check = Clerk Backend API `sessions.getSessionList({ userId, status: "active" })`.

- **N per tier** (from `TIERS[tier].maxSessions`, §2.1): free/payg **2**, pool/lifetime **3** (+1 with passkey enrolled), studio/agency **5**.
- **Enforcement point:** not per-request middleware (too chatty, and Clerk session listing is a network call). Checked at the three expensive choke points, where a shared account actually costs money: `POST /api/v2/generate`, `POST /api/v2/render`, `POST /api/v2/snapshot` — cached per user for 5 minutes in the same in-process pattern as `src/lib/rateLimit.ts` (upgraded to Upstash/Redis together with it, conflict C8).
- **Eviction UX:** when a sign-in would exceed N, the **oldest-activity session is revoked** via Clerk `sessions.revokeSession()`. The evicted device gets Clerk's standard signed-out redirect to `/sign-in?reason=device-limit`, which renders: "You were signed out because your account reached its device limit (N). Manage devices in your dashboard." The dashboard gains a device list (Clerk session list: browser, OS, city-level location, last active) with per-session "sign out" buttons — visibility is itself the deterrent.

### 4.3 Client fingerprinting — privacy-proportionate

**Signals (coarse, stable, non-invasive):** user-agent family + major version, platform, timezone, language, screen-size *bucket* (small/medium/large/xlarge), device-pixel-ratio bucket. Explicitly excluded: canvas/WebGL/audio fingerprinting, font enumeration, raw IP, precise geolocation.

**Hashing:** client computes nothing; signals post to `POST /api/session/device` on sign-in, server computes `deviceHash = SHA-256(userId_salt || signals)` truncated to 16 hex chars, where `userId_salt` is a per-user random salt column — hashes are **not comparable across users**, so no cross-user tracking is possible even with DB access.

```ts
export const userDevices = pgTable("user_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceHash: text("device_hash").notNull(),     // salted SHA-256, 16 hex chars
  label: text("label"),                          // "Chrome · macOS" — display only
  geoCity: text("geo_city"),                     // from edge geo headers; city granularity, never raw IP
  geoCountry: text("geo_country"),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
}, (t) => [index("user_devices_user_idx").on(t.userId, t.lastSeen)]);
```

**Retention:** rows with `lastSeen` older than **90 days** are deleted by a daily cron; deleting the user cascades (FK). Disclosed in the privacy policy as device-limit enforcement, legal basis: legitimate interest / contract enforcement.

### 4.4 Abuse-detection heuristic

Evaluated at the same three choke points (piggybacking on the cached session check), producing a per-user `riskScore`:

| Signal | Trigger | Weight |
|---|---|---|
| Concurrent-geo | ≥2 *active* sessions whose `geoCity` centroids are >500 km apart with activity inside the same 10-minute window | +3 |
| Device-count velocity | >5 distinct `deviceHash` values first-seen within 7 days | +2 |
| Render-source spread | completed `render_jobs` from ≥3 distinct devices within 24 h on a single-seat tier | +2 |
| Agent-key multi-host | `heartbeat()` (`src/lib/agentBridge.ts`) sees the same `users.agentKey` from >2 distinct `machine` values in 24 h | +1 |

**Response ladder (proportionate — never auto-ban):** score ≥3 → email notice ("new sign-in pattern") + device list link; ≥5 → passkey/re-auth step-up required before the next render or generate (402-style JSON `{ error: "step_up_required" }`, client redirects to Clerk re-verification); ≥7 → renders queue-held and flagged for manual review. Travel and legit multi-device use pass the step-up in seconds; sharing an account with a stranger doesn't.

---

## 5. BYOK key security

### 5.1 Server-side storage with envelope encryption

Today keys live only in localStorage and travel in every request body — workable, but §3's "verified BYOK" billing state needs a durable, server-side record. New table:

```ts
export const userAiKeys = pgTable("user_ai_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),        // 'ai' | 'restyle' | 'google' | 'voiceover'
                                             // (matching the four SettingsModal slots)
  provider: text("provider").notNull(),      // NAMED_PROVIDERS / AIProvider ids from src/lib/ai/providers.ts
  model: text("model"),
  baseUrl: text("base_url"),                 // re-validated with isSsrfSafeUrl on write AND on read
  keyCiphertext: text("key_ciphertext").notNull(), // AES-256-GCM(DEK, apiKey) — iv||tag||ct, base64
  dekWrapped: text("dek_wrapped").notNull(),       // AES-256-GCM(KEK, DEK)
  kekId: text("kek_id").notNull(),                 // 'v1', 'v2' … enables rotation
  keyLast4: text("key_last4").notNull(),           // ONLY plaintext-derived value ever stored/displayed
  verifiedAt: timestamp("verified_at"),            // set by the /api/ai/test ping on save
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Envelope scheme:** per-key random 256-bit DEK encrypts the API key (AES-256-GCM, Node `crypto`, random 12-byte IV, auth tag stored); DEK is wrapped by a KEK. **KEK management matched to the actual deploy targets:**

- **KVM4 Docker** (`Dockerfile` + compose, per project memory): KEK supplied as a Docker secret file (`/run/secrets/mapinsy_kek`) or `MAPINSY_KEK_V1` env — 32 random bytes, base64. No cloud-KMS dependency on a bare VPS.
- **Vercel:** `MAPINSY_KEK_V1` as a Vercel *sensitive* environment variable (encrypted at rest by Vercel, exposed only at runtime).
- **Rotation:** ship `MAPINSY_KEK_V2`, background job re-wraps every `dekWrapped` (DEK unwrap with old, wrap with new, bump `kekId`) — API keys themselves are never re-encrypted, so rotation is O(rows) and cheap. No AWS KMS is required, but the `kekId` indirection means a later move to KMS-wrapped KEKs changes only the unwrap function in `src/lib/crypto/envelope.ts` (new module).

### 5.2 Handling rules (non-negotiable invariants)

1. **Server-side only.** Decryption happens exclusively inside route handlers at call time (feeding the existing `configFromUser()` shape); the plaintext key is never included in any response, log, ledger row, or error message. `GET /api/keys` returns `{ provider, model, keyLast4, verifiedAt }` only.
2. **Never logged.** Add a redaction wrapper for the AI-call error paths in `src/lib/ai/providers.ts` (provider errors can echo auth headers). **Two shipped leaks to fix under this heading (flagged, not new design):**
   - `GET /api/v2/restyle?…&apiKey=…` passes the user's key **as a URL query parameter** (`app/api/v2/restyle/route.ts:39`) — lands in access logs and browser history. Move polling to POST body or an `x-restyle-key` header.
   - `users.agent_key` is stored **plaintext** and authenticated via `?key=` query string (`app/api/agent-key/route.ts`, `app/api/agent/job/route.ts`). Store `sha256(agentKey)` instead (generate route compares hashes), move the agent to an `Authorization: Bearer` header (`packages/agent/agent.mjs` is served by us via `/api/agent/script`, so both ends change together), and add expiry + rotation timestamps.
3. **Verification = billing switch.** A key row only flips the BYOK billing split (§3) after `verifiedAt` is set by the existing `POST /api/ai/test` one-token ping (`maxTokens: 8, retries: 0`). Unverified keys behave like today's per-request `body.ai` (used if present, no billing effect).
4. **Precedence:** server-stored verified key > per-request `body.ai` (kept for backward compat and Ollama/localhost users) > env `resolveAIConfig()`. The per-request path never earns the BYOK billing discount, closing the "spoof a key string to dodge token billing" hole — verification and billing state are server-side facts.
5. **Client migration:** `src/v2/ui/SettingsModal.tsx` gains "Save to account (encrypted)"; localStorage remains a cache for the modal UI only.

---

## 6. Watermark / outro enforcement in the render pipeline

### 6.1 Where the outro is injected (cannot be bypassed client-side)

The free-tier "Made with Mapinsy" outro is a **composition-level tail sequence**, decided server-side, rendered inside the same Remotion tree every pipeline path uses:

1. **Decision (server):** `app/api/v2/render/route.ts:94` already computes `const watermark = !!db && quota.tier === "free"`. Extend to a branding object derived from `TIERS[quota.tier]`: `const branding = { watermark, outro: TIERS[quota.tier].outro }`, passed into `inputProps` (lines 112–113) and persisted on the job row (`render_jobs.brandingOutro`) for audit. Same change in `app/api/agent/render/route.ts:121` and `app/api/v2/snapshot/route.ts` (stills keep the existing corner watermark only — no outro on a still).
2. **Composition (render tree):**
   - `src/v2/render/MapComposition.tsx` — alongside the existing watermark pill at line 784, append `{outro && <Sequence from={contentFrames} durationInFrames={OUTRO_FRAMES}><MadeWithMapinsyOutro theme={comp.theme} /></Sequence>}` (new component `src/v2/render/Outro.tsx`; `OUTRO_FRAMES = 60` = 2.5 s at the schema-locked 24 fps, animated logo + URL, themed via the composition `Theme` so it doesn't look like a slap-on).
   - `src/v2/render/StoryComposition.tsx` — outro appended once after the last scene, not per scene.
   - `src/remotion/root.tsx` — both `calculateMetadata` functions ("MapanisyV2" `Math.round(durationSec × fps)` and "MapanisyStory" `storyFrames(scenes)`, root.tsx:83) must add `OUTRO_FRAMES` when `inputProps.branding?.outro`, otherwise the encoder truncates the tail.
   - **Operational requirement:** `npm run build:agent-bundle` (`scripts/build-bundle.mjs`) after these changes — cloud worker (`scripts/render-worker.mjs`), agent, and snapshot all render from the prebuilt `public/remotion-bundle/` (documented stale-bundle incident).
3. **Why it can't be bypassed client-side:** the flag is computed inside the route from `checkQuota` (DB), never read from the request body; the cloud worker (`src/lib/serverRender.ts` → `scripts/render-worker.mjs`) reads `inputProps` from the server-written `.renders/{id}.job.json`, which no client can touch.

### 6.2 Closing the known bypass surfaces

| Surface | Risk | Fix |
|---|---|---|
| **Agent path** | `AgentJob.watermark` (`src/lib/agentBridge.ts`) is delivered to a self-hosted agent on the user's machine — trivially patched out (rendering gap 9) | `TIERS.free.agentAllowed = false` / `TIERS.payg.agentAllowed = false`: in `app/api/v2/render/route.ts` skip the `sessionForUser(userId)` agent branch (lines ~106–107) whenever `branding.outro || branding.watermark`, forcing `enqueueServerRender`. Free tier is 3 renders/mo at 720p — cloud cost is bounded by design. |
| **In-browser quick export** | `src/v2/ui/ExportButton.tsx` captures the canvas with client-supplied `inputProps { comp, watermark }` — client-tamperable | Accept as residual: the capture is realtime screen-recording quality, watermark pill still renders for honest clients, and 720p/4K clean output only exists via server render. Optionally gate ExportButton behind `useTier().watermark === false`. |
| **Public share viewer** | `src/v2/ui/SharedViewer.tsx` hardcodes `watermark: false` in the Player inputProps — a free user's share link plays clean (surfaces gap 6) | `/api/v2/share/[token]` response gains `branding` derived from the **owner's** tier; SharedViewer passes it through. The existing "Made with Mapanisy" footer stays regardless of tier. |
| **`!!db` escape hatch** | Watermark silently disappears whenever `DATABASE_URL` is unset (`!!db &&` at route.ts:94) | Invert the failure mode in production: `db ? tierBranding : { watermark: true, outro: true }` — no database, no clean render. Keep the permissive behavior only behind `NODE_ENV !== "production"`. |
| **`BYPASS_QUOTA=true`** | `checkQuota` returns tier `"teams"` → no watermark, no metering (`src/lib/quota.ts:33-40`) | Guard with `NODE_ENV !== "production"`; refuse to boot production with it set. |

---

## 7. Conflicts between the brief and existing code (decisions required — nothing overwritten)

| # | Conflict | Evidence | Recommendation |
|---|---|---|---|
| C1 | Brief: free = **720p**. Code: `TIERS.free.features` says `"1080p export"` (`src/lib/tiers.ts`) and no resolution gate exists anywhere | verified above | Adopt 720p (`maxScale 0.34`); update the features copy and the three price surfaces (C4) in the same commit |
| C2 | Brief's ladder (Free / PAYG / $11.99 pool / €60 lifetime) **omits** the shipped $19/$39/$99 unlimited subscriptions, whose rationale is documented in-file ("the moat is the self-hosted render agent — renders cost us nothing") | `src/lib/tiers.ts` header comment | Do **not** delete creator/teams/custom — Stripe price IDs, `tierFromStripePrice`, `subscriptions.tier` rows and `PRO_TIERS` gating all reference them. Add the new tiers alongside; decide separately whether $19/$39/$99 stay purchasable or become grandfathered. Note the economic tension: PAYG sells *cloud* renders while paid tiers were priced around *agent* (zero-marginal-cost) renders. |
| C3 | Brief: watermark = **outro clip**. Code: corner overlay pill only (`src/v2/render/MapComposition.tsx:784`, `src/remotion/Watermark.tsx`); no outro exists | rendering map, verified | Ship **both** for free tier: pill (in-frame, screenshot-proof) + outro (§6). |
| C4 | Three inconsistent hardcoded price surfaces: `LandingExperience.tsx` (Free/$19/$39), `app/page.tsx` JSON-LD (adds $99), `app/pricing/page.tsx` `DISPLAY_ORDER` — none matches the brief | surfaces map, gap 9 | Single source: all three render from `TIERS`; JSON-LD generated, not hand-written. |
| C5 | `POST /api/v2/data` pro-gates on `PRO_TIERS = ["teams","custom","agency"]` — undefined for `payg`/`pool`/`lifetime` | ai-pipeline map | Replace the hardcoded set with a `TierConfig.dataLayers: boolean` capability flag (pool/lifetime: true). |
| C6 | Stripe checkout hard-codes `mode: "subscription"` (`app/api/stripe/checkout/route.ts:67`); webhook has no one-time-payment branch; `Tier` union has no payg/lifetime | verified | Extend per §2.3; `customer.subscription.deleted` must never downgrade `lifetime`. |
| C7 | Quota 402 fires only for `unit === "animation"` (`app/api/v2/render/route.ts:87`); paid tiers are never blocked; `render_logs` durations are **client-self-reported** via `/api/render-log` | data-auth-billing map, gap 11 | Credit debit (§2.3) becomes the second blocking branch. For billing-grade metering, durations must come from the completion hooks (`serverRender` worker exit, `/api/agent/complete`) — keep `/api/render-log` for legacy UI only, never for money. |
| C8 | `src/lib/rateLimit.ts` and all three job stores are in-process memory — resets on restart, meaningless across instances | data-auth-billing gap 7, rendering gap 7 | `render_jobs` table (§2.4) is the billing-critical part; move rate limiting + session-check cache to Upstash/Redis before Vercel multi-instance deploys. In-memory ledgers must never hold money state. |
| C9 | `subscriptions.minutes_limit` schema default 50 vs Clerk-webhook seed 10 (`TIERS.free.minutesPerMonth`) — two sources of truth for a cosmetic number | `src/lib/db/schema.ts:24` vs `app/api/webhooks/clerk/route.ts` | Credits ledger supersedes minutes for new tiers; align the default when the migration lands. |
| C10 | Naming: every surface renders "Mapanisy"; brief says "Mapinsy"; localStorage keys are `mapanisy-*` | surfaces map, gap 10 | Decide before shipping the outro clip and showcase gallery — the brand name gets baked into rendered MP4s. |

---

## 8. Implementation order

1. **Migrations bootstrap** — commit drizzle migrations for `render_jobs`, `credit_ledger`, `user_ai_keys`, `user_devices`, `users.showcase_opt_out` (unblocks everything; fixes the no-migrations gap).
2. **Server clamps** (small, high-leverage, no new tables needed): free 720p `maxScale` clamp + agent-path denial + `!!db`/`BYPASS_QUOTA` production hardening in `app/api/v2/render/route.ts` + `app/api/agent/render/route.ts` + `app/api/v2/snapshot/route.ts`.
3. **Outro** — `src/v2/render/Outro.tsx`, MapComposition/StoryComposition sequences, `calculateMetadata` extension in `src/remotion/root.tsx`, SharedViewer branding, `npm run build:agent-bundle`.
4. **Complexity + ledger** — `src/lib/billing/complexity.ts`, `/api/v2/render/quote`, debit-at-enqueue/settle-at-complete, persist `_meta.tokensUsed`.
5. **Stripe extension** — payg credit packs + pool prices + lifetime SKU; webhook branches; `TIERS` entries; unify the three pricing surfaces.
6. **BYOK vault** — `src/lib/crypto/envelope.ts`, key CRUD route with `/api/ai/test` verification, provider-resolution precedence change, restyle/agent-key credential-leak fixes.
7. **Anti-sharing** — Clerk passkeys + step-up policy, session-cap check at the three choke points, device beacon + 90-day retention cron, abuse ladder.
8. **Showcase gallery** — consent flag, `showcase_entries` over the existing `share_token` viewer.