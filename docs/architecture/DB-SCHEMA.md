> **Part of the Mapinsy master architecture proposal.** Read [ARCHITECTURE.md](../../ARCHITECTURE.md) first — it holds the reconciliation decisions where the four deliverables differ, and its canonical choices supersede this document.
> Superseded by reconciliation: `token_ledger` → merged `credit_ledger`; `byok_keys` → `user_ai_keys` (envelope encryption); `webauthn_credentials` + `active_sessions` + `device_fingerprints` → Clerk-native passkeys + Clerk session API + a single `user_devices` table. See ARCHITECTURE.md §7 for the canonical definitions. Everything else in this document is canonical.

# Mapinsy — Database Schema & Data Contracts

**Deliverable owner:** Data layer (Layer 4 persistence, Layer 7 look config, Layer 8 memory, Layer 9 planning records, commercial/anti-sharing tables)
**Dialect ground truth:** PostgreSQL via `drizzle-orm/pg-core` `pgTable` (drizzle-orm ^0.45.2), postgres.js driver (`drizzle(postgres(DATABASE_URL, { prepare: false }), { schema })` — `src/lib/db/index.ts`), schema file `src/lib/db/schema.ts`, drizzle-kit ^0.18.1 flat config (`drizzle.config.ts`).
**Idiom rules honored** (from the existing `src/lib/db/schema.ts`): camelCase TS keys with explicit snake_case column names; `uuid("id").primaryKey().defaultRandom()`; enums as `text` + a `/** 'a' | 'b' */` doc comment (no `pgEnum` — matches `renderLogs.status`, `subscriptions.tier`); FKs always `references(() => users.id, { onDelete: "cascade" })`; indexes via the `(t) => [index(...).on(...)]` array form; `$inferSelect` type exports at the bottom.

---

## 0. Table inventory (NEW / ALTERED / UNCHANGED)

| Table | Status | Brief requirement served |
|---|---|---|
| `users` | UNCHANGED | account identity (Clerk-synced) |
| `subscriptions` | **ALTERED** | tiers: Free / PAYG / $11.99 token pool / €60 lifetime; BYOK billing shift |
| `render_logs` | UNCHANGED (deprecated-in-place) | legacy quota meter; superseded by `renders` |
| `scenes` | UNCHANGED (frozen legacy) | v1 SceneSpec store — no migration path exists (`GAPS` #11 scene-graph subsystem); freeze, do not extend |
| `projects_v2` | **ALTERED** | Layer 4 scene-graph document + Layer 7 holistic look config |
| `project_versions` | NEW | Layer 4 versioning / undo checkpoints / rollback |
| `story_dna` | NEW | Layer 1 Story DNA + Layer 2 vertical classification per project |
| `arc_memory` | NEW | Story-Arc continuity memory (multi-sequence "one film") |
| `user_preferences` | NEW | Layer 8 learned preferences — structured columns |
| `taste_events` | NEW | Layer 8 raw evidence stream (server home for `src/lib/taste.ts`) |
| `planning_sessions` | NEW | Layer 9 conversational planning record |
| `planning_turns` | NEW | Layer 9 interview Q&A turns |
| `user_assets` | NEW | asset injection (photo → route marker) + moderation/size |
| `renders` | NEW | durable render queue + resolution/watermark/complexity for PAYG |
| `token_ledger` | NEW | append-only token grants/consumption, BYOK-discounted rows |
| `byok_keys` | NEW | BYOK provider keys, encrypted at rest, last-verified |
| `webauthn_credentials` | NEW | anti-credential-sharing: passkeys |
| `device_fingerprints` | NEW | anti-credential-sharing: client fingerprinting |
| `active_sessions` | NEW | anti-credential-sharing: session-concurrency tracking |
| `showcase_entries` | NEW | free-tier showcase gallery inclusion (with consent) |
| `share_tokens` | NEW (extends, does not replace, `projects_v2.share_token`) | public share links with expiry/analytics |

Operational prerequisite: **no `drizzle/` migrations directory exists today** (push-only workflow, `drizzle.config.ts` points at `./drizzle/migrations`). Everything below assumes we start a real migration ladder (`npm run db:generate`) with this change-set as migration `0000_baseline` + `0001_mapinsy_master`. Also note `drizzle.config.ts` itself warns drizzle-kit must be bumped before the modern `dialect`/`dbCredentials` config shape.

---

## 1. Key design decision — Layer 4 storage: JSONB document, not normalized scenes

**Decision: keep the scene graph as one versioned JSONB document per project (extend `projects_v2`), and do NOT normalize scenes/layers into rows.** Rationale, grounded in the code:

1. **The Zod document already IS the contract.** `Project`/`Scene`/`Composition`/`Layer` (`src/v2/doc/schema.ts`, `SCHEMA_VERSION = 1`, `parseProject`/`safeParseProject`) is a 21-way discriminated union with deep defaults (`Timing`, `Transform`, `Keyframe`, per-layer fields like `TrackLayer.points`). Normalizing would require ~25 tables that no query ever joins — every consumer (editor store `src/v2/store/editor.ts`, Remotion `MapComposition`, `/api/v2/render`, the public viewer `/v/[token]`) loads and validates the **whole** document. Row-level access patterns don't exist.
2. **Undo is a client concern, versioning is a server concern.** The editor already keeps 80 immutable in-memory snapshots (`past`/`future`, `MAX_HISTORY=80`, `src/v2/store/editor.ts`); we must not move keystroke-level undo into the DB. What the DB adds is *checkpoint* versioning (`project_versions`): one row per explicit save / AI regeneration / pre-render snapshot, enabling rollback, "restore the version I rendered", and the migration ladder the current `schemaVersion: z.literal(1)` + silent `createDefaultProject()` fallback lacks (scene-graph gap #12).
3. **JSONB (not `text`) buys real integrity + queryability** we need elsewhere in this proposal: server-side complexity scoring for PAYG (`jsonb_array_length(doc->'composition'->'layers')`, `doc->'composition'->>'durationSec'`), a CHECK that `schemaVersion` matches the extracted column, and future partial indexes — none possible on the current `doc: text` JSON string.
4. **Story-arc continuity memory is the one thing that must NOT live inside the doc**, because it is cross-sequence orchestration state (the `prior: string[]` summaries built by `summarizeSequence`, `src/lib/parse/storyArc.ts`) consumed at *generation* time, not render time → dedicated `arc_memory` rows.

**Prerequisite fix (blocking):** `narrationLines` is currently written as `(composition as any).narrationLines` and **stripped by every Zod parse** (confirmed defect, scene-graph gap #1). Before the DB ever becomes source of truth, add `narrationLines: z.array(z.object({ text: z.string(), startSec: z.number() })).default([])` to `Composition` in `src/v2/doc/schema.ts` — otherwise multi-beat captions are silently destroyed on save.

**Migration note for `doc` text→jsonb:** `ALTER TABLE projects_v2 ALTER COLUMN doc TYPE jsonb USING doc::jsonb;` plus a one-line change in `/api/v2/projects` (stop `JSON.stringify`/`JSON.parse`; drizzle `jsonb` mode returns objects).

---

## 2. Complete Drizzle schema (`src/lib/db/schema.ts`)

```ts
import {
  pgTable, uuid, text, integer, decimal, timestamp, index,
  jsonb, boolean, bigint, uniqueIndex,
} from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════
// UNCHANGED — Users (synced from Clerk via webhook, app/api/webhooks/clerk)
// Brief: account identity. Anti-sharing state lives in webauthn_credentials /
// active_sessions / device_fingerprints, NOT here — keeps the Clerk sync dumb.
// ═══════════════════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  id:        uuid("id").primaryKey().defaultRandom(),
  clerkId:   text("clerk_id").notNull().unique(),
  email:     text("email").notNull(),
  name:      text("name"),
  /** Unique token the Render Agent uses to authenticate with this account. */
  agentKey:  text("agent_key").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// ALTERED — Subscriptions
// Brief: tiers = Free (3 renders/mo, 720p, outro, showcase) + pay-as-you-go +
// $11.99/mo-yearly token pool + EUR 60 lifetime beta unlimited + BYOK shift.
// Existing columns untouched (Stripe webhook sync in app/api/webhooks/stripe
// keeps working). New columns extend src/lib/tiers.ts Tier union with
// "payg" | "pool" | "lifetime".
// ═══════════════════════════════════════════════════════════════════════════

export const subscriptions = pgTable("subscriptions", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 'free' | 'payg' | 'pool' | 'lifetime' | legacy: 'creator' | 'teams' | 'custom' | 'agency' */
  tier:                 text("tier").notNull().default("free"),
  status:               text("status").notNull().default("active"),
  minutesLimit:         integer("minutes_limit").notNull().default(50), // legacy meter, cosmetic on new tiers
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId:        text("stripe_price_id"),
  currentPeriodStart:   timestamp("current_period_start"),
  currentPeriodEnd:     timestamp("current_period_end"),
  // ── NEW columns ──
  /** 'subscription' | 'payg' | 'lifetime' — which billing engine applies. */
  billingModel:         text("billing_model").notNull().default("subscription"),
  /** Tokens granted per period on the 'pool' tier ($11.99/mo-yearly). 0 elsewhere. */
  tokenPoolMonthly:     integer("token_pool_monthly").notNull().default(0),
  /** Set once when the EUR 60 lifetime-beta one-time payment lands (Stripe
   *  mode:"payment" checkout — a NEW path; current checkout is subscription-only). */
  lifetimePurchasedAt:  timestamp("lifetime_purchased_at"),
  /** True while the user has an active verified BYOK key (denormalized from
   *  byok_keys for fast quota branching in src/lib/quota.ts). BYOK shifts
   *  metering from AI tokens to workflow value: renders still meter, AI calls
   *  get the byok discount in token_ledger. */
  byokActive:           boolean("byok_active").notNull().default(false),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// UNCHANGED — render_logs (deprecated in place)
// Stays as the free-tier quota meter (src/lib/quota.ts counts completed rows)
// until checkQuota is repointed at `renders`. New code writes BOTH during the
// transition; then this becomes read-only history. Do not extend.
// ═══════════════════════════════════════════════════════════════════════════

export const renderLogs = pgTable("render_logs", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sceneName:       text("scene_name"),
  durationSeconds: decimal("duration_seconds", { precision: 10, scale: 2 }).notNull(),
  tierAtRender:    text("tier_at_render"),
  /** 'started' | 'completed' | 'failed' */
  status:          text("status").notNull().default("completed"),
  outputUrl:       text("output_url"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("render_logs_user_period_idx").on(t.userId, t.createdAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// UNCHANGED (frozen) — Saved v1 scenes. Legacy SceneSpec JSON strings.
// Nothing converts SceneSpec → Project; freeze rather than migrate.
// ═══════════════════════════════════════════════════════════════════════════

export const scenes = pgTable("scenes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  kind:      text("kind").notNull(),
  spec:      text("spec").notNull(), // JSON string of SceneSpec (src/lib/types.ts)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("scenes_user_idx").on(t.userId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// ALTERED — Mapinsy v2 projects: THE Layer 4 scene-graph document store.
// Brief: L4 Scene Graph JSON as the intermediate contract; L7 ONE holistic
// look config per project (never per-scene).
// Changes: doc text→jsonb; + schemaVersion extracted column; + currentVersion
// (points into project_versions); + lookConfig (L7). share_token retained as
// the single ACTIVE token for back-compat with /api/v2/projects/share and the
// /v/[token] viewer; richer tokens live in share_tokens below.
// ═══════════════════════════════════════════════════════════════════════════

export const projectsV2 = pgTable("projects_v2", {
  id:         text("id").primaryKey(),                 // = Project.id (proj_xxx)
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),
  /** The validated scene-graph Project document (src/v2/doc/schema.ts,
   *  parseProject). ALTERED from text: `USING doc::jsonb`. Always the LATEST
   *  state; history lives in project_versions. */
  doc:        jsonb("doc").notNull(),
  /** Extracted from doc.schemaVersion for cheap migration queries
   *  ("how many v1 docs remain"). Kept in sync by the save route. */
  schemaVersion: integer("schema_version").notNull().default(1),
  /** Monotonic checkpoint counter; equals the highest project_versions.version. */
  currentVersion: integer("current_version").notNull().default(1),
  /** L7 HOLISTIC LOOK CONFIG — one per project, never per-scene. Canonical
   *  JSON shape: LookConfig (see Data Contracts). Scenes inside `doc` keep
   *  their per-composition theme/look/basemap as the COMPILED result; this
   *  column is the source of intent the compiler re-applies on every scene
   *  add/edit (fixes scene-graph gap #5 / camera-styles gap #4 without
   *  breaking the existing Composition schema). */
  lookConfig: jsonb("look_config"),
  shareToken: text("share_token").unique(),            // active public token (shr_…)
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("projects_v2_user_idx").on(t.userId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Project versions (Layer 4 versioning / rollback / render provenance)
// One row per CHECKPOINT: explicit save, AI regeneration (generate/edit full
// replace), pre-render snapshot. Keystroke undo stays client-side (zustand
// past/future, MAX_HISTORY=80 — do not move it here). Full-doc snapshots, not
// deltas: docs are 10–200 KB, checkpoints are rare (~10/project), and full
// snapshots make rollback and "render exactly version N" trivial.
// ═══════════════════════════════════════════════════════════════════════════

export const projectVersions = pgTable("project_versions", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: text("project_id").notNull().references(() => projectsV2.id, { onDelete: "cascade" }),
  version:   integer("version").notNull(),             // 1, 2, 3, …
  doc:       jsonb("doc").notNull(),                   // full validated Project snapshot
  /** 'save' | 'ai-generate' | 'ai-edit' | 'pre-render' | 'restore' */
  origin:    text("origin").notNull().default("save"),
  label:     text("label"),                            // optional user note
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("project_versions_unique_idx").on(t.projectId, t.version),
  index("project_versions_project_idx").on(t.projectId, t.createdAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Story DNA + classification (Layers 1 + 2), per generation.
// Brief: L1 {story_type, emotion, pace, focus, camera_feel, target_audience};
// L2 four verticals with editing conventions. Today this data is recomputed
// per request and echoed in the /api/v2/generate response, never stored
// (intent-parse gap L1). One row per generate call → full provenance history;
// latest row per project is the project's DNA. Structured columns (queryable:
// "all history/military films for the showcase"), full raw context in jsonb.
// ═══════════════════════════════════════════════════════════════════════════

export const storyDna = pgTable("story_dna", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId:     text("project_id").references(() => projectsV2.id, { onDelete: "cascade" }),
  idea:          text("idea").notNull(),               // the raw prompt
  // ── L1 canonical DNA (see StoryDNA contract) ──
  /** Canonical story_type — reconciles the 3 existing taxonomies (see contract). */
  storyType:     text("story_type").notNull(),
  /** L2 vertical: 'travel-vlog' | 'history-military' | 'flight-logistics'
   *  | 'data-comparison' | 'general' */
  vertical:      text("vertical").notNull().default("general"),
  emotion:       text("emotion"),                      // 'wonder'|'tension'|'triumph'|'melancholy'|'urgency'|'calm'
  /** 'slow' | 'medium' | 'fast' — maps to DirectorBeat.pacing vocabulary. */
  pace:          text("pace"),
  focus:         text("focus"),                        // primary subject/place (Plan.focus)
  /** 'documentary' | 'dynamic' | 'locked' | 'orbital' | 'chase' — camera_feel. */
  cameraFeel:    text("camera_feel"),
  targetAudience: text("target_audience"),             // 'general'|'filmmakers'|'journalists'|'educators'|'social'
  // ── Provenance: the three source taxonomies, kept verbatim ──
  archetype:     text("archetype"),                    // matchArchetype().name (src/lib/ai/directorDoctrine.ts)
  dirArc:        text("dir_arc"),                      // DirectorScript.arc: journey|reveal|contrast|scale|data|conflict
  storyboardPattern: text("storyboard_pattern"),       // Storyboard.pattern (src/lib/parse/director.ts STORY_PATTERNS)
  confidence:    decimal("confidence", { precision: 4, scale: 3 }), // Interpretation.confidence 0–1
  /** 'ai' | 'heuristic' — which engine produced the DNA (strict-mode audit). */
  source:        text("source").notNull().default("heuristic"),
  provider:      text("provider"),                     // aiCfg.label when source='ai'
  /** Full raw context: { interpretation, storyboard, dirScript, plan,
   *  verification, interviewAnswers } — everything the generate response
   *  computes today and throws away. Replay/debug/re-generate fuel. */
  raw:           jsonb("raw"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("story_dna_project_idx").on(t.projectId, t.createdAt),
  index("story_dna_user_idx").on(t.userId),
  index("story_dna_vertical_idx").on(t.vertical),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Story-Arc continuity memory (multi-sequence = ONE film)
// Persists what today lives only in the client request loop: StoryArc from
// /api/v2/storyarc + the per-sequence summarizeSequence() strings that give
// chapter K+1 knowledge of what K showed (src/lib/parse/storyArc.ts). Enables
// resuming an arc generation after a refresh/crash and re-generating one
// chapter with full continuity.
// ═══════════════════════════════════════════════════════════════════════════

export const arcMemory = pgTable("arc_memory", {
  id:            uuid("id").primaryKey().defaultRandom(),
  projectId:     text("project_id").notNull().references(() => projectsV2.id, { onDelete: "cascade" }),
  sequenceIndex: integer("sequence_index").notNull(),  // 0-based; row -1 = arc header
  /** Row 0..n: ArcSequence fields. Header row: { subject, goal, thesis,
   *  lockedStyleId, count, source } (StoryArc minus sequences). */
  idea:          text("idea"),
  role:          text("role"),                         // "Opening — establish the world" …
  intent:        text("intent"),
  beats:         jsonb("beats"),                       // string[] ≤8×160
  /** summarizeSequence() continuity line, written AFTER the chapter generates. */
  summary:       text("summary"),
  arcHeader:     jsonb("arc_header"),                  // header row only
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("arc_memory_unique_idx").on(t.projectId, t.sequenceIndex),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Layer 8: learned user preferences — STRUCTURED COLUMNS, not a JSON
// dump. Server-side home for what src/lib/taste.ts keeps in localStorage
// ("mapanisy-taste", per-device, wiped on clear — ai-pipeline gap #5 /
// camera-styles gap #5). One row per user; recomputed from taste_events by a
// fold job (same exp(-ageDays/30) recency decay taste.ts uses). Read by
// /api/v2/generate server-side (replacing the client-passed `taste` string)
// and by /api/v2/edit, which today gets no taste at all.
// ═══════════════════════════════════════════════════════════════════════════

export const userPreferences = pgTable("user_preferences", {
  userId:            uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  // ── style ──
  preferredStyleId:  text("preferred_style_id"),       // top PRO_MAP_STYLES / MAP3D_STYLES / signature id
  preferredPalette:  text("preferred_palette"),        // THEME_PRESETS name (src/v2/doc/themes.ts)
  preferredAccent:   text("preferred_accent"),         // hex
  // ── typography ──
  preferredFontDisplay: text("preferred_font_display"), // FONT_CHOICES name
  preferredFontBody:    text("preferred_font_body"),
  // ── pace & camera (TasteKind gains 'camera' + 'pace' kinds — today missing) ──
  /** 'slow' | 'medium' | 'fast' */
  preferredPace:     text("preferred_pace"),
  /** 'documentary' | 'dynamic' | 'locked' | 'orbital' | 'chase' */
  preferredCameraFeel: text("preferred_camera_feel"),
  preferredEasing:   text("preferred_easing"),         // Easing enum value
  // ── format ──
  preferredAspect:   text("preferred_aspect"),         // '16:9' | '9:16' | '1:1'
  avgDurationSec:    integer("avg_duration_sec"),
  preferredMode:     text("preferred_mode"),           // 'film' | 'still'
  // ── bounded aggregate counters (supplementary evidence, not the API) ──
  /** { [styleId]: decayedWeight } — top-10 only, pruned on fold. */
  styleAffinity:     jsonb("style_affinity"),
  /** { [layerType]: decayedWeight } — which layer kinds the user reaches for. */
  layerAffinity:     jsonb("layer_affinity"),
  eventsCount:       integer("events_count").notNull().default(0),
  lastEventAt:       timestamp("last_event_at"),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
});

// NEW — Layer 8 raw evidence stream. Mirrors TasteEvent { k, v, t } from
// src/lib/taste.ts so the client can dual-write (localStorage + POST) with
// zero shape change. Append-only; fold job aggregates into user_preferences.
export const tasteEvents = pgTable("taste_events", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** TasteKind: 'style'|'signature'|'font'|'accent'|'aspect'|'mode'
   *  |'renderPreset'|'layer'|'duration' + NEW 'camera'|'pace'. */
  kind:      text("kind").notNull(),
  value:     text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("taste_events_user_idx").on(t.userId, t.createdAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Layer 9: conversational planning records (interview Q&A).
// Today /api/v2/interview questions + answers exist only in client state and
// ride along a single generate POST (interview / interviewText), then vanish.
// Two tables so L9 can grow from single-shot menus into real 1–4-question
// adaptive conversations (the brief's "never tedious menus") without a schema
// change: a session per prompt, a row per turn.
// ═══════════════════════════════════════════════════════════════════════════

export const planningSessions = pgTable("planning_sessions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId:   text("project_id").references(() => projectsV2.id, { onDelete: "set null" }),
  storyDnaId:  uuid("story_dna_id").references(() => storyDna.id, { onDelete: "set null" }),
  idea:        text("idea").notNull(),
  /** detectInputType(): 'voiceover' | 'brief' | 'idea' */
  inputType:   text("input_type"),
  /** Why the interview ran: 'vague' (needsClarification, confidence < 0.55)
   *  | 'always' (legacy unconditional trigger) | 'user-requested'. Lets us
   *  measure the L9 fix: precise prompts should stop being interviewed. */
  trigger:     text("trigger").notNull().default("always"),
  /** 'ai' | 'heuristic' — question source. */
  provider:    text("provider").notNull().default("heuristic"),
  thesisHint:  text("thesis_hint"),
  /** 'open' | 'answered' | 'skipped' | 'expired' */
  status:      text("status").notNull().default("open"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("planning_sessions_user_idx").on(t.userId, t.createdAt),
]);

export const planningTurns = pgTable("planning_turns", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   uuid("session_id").notNull().references(() => planningSessions.id, { onDelete: "cascade" }),
  turnIndex:   integer("turn_index").notNull(),
  /** 'question' | 'answer' */
  role:        text("role").notNull(),
  /** IVQuestion.id for question rows and the answer rows that reply to them:
   *  'tone' | 'energy' | 'focus' | 'length' | free-form ids. */
  questionId:  text("question_id"),
  /** Question rows: the full IVQuestion { id, question, options[] }
   *  (app/api/v2/interview/route.ts shape, ≤4 options). */
  question:    jsonb("question"),
  /** Answer rows: the chosen IVOption.value. */
  answerValue: text("answer_value"),
  /** Answer rows: optional free text (future conversational L9). */
  freeText:    text("free_text"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("planning_turns_unique_idx").on(t.sessionId, t.turnIndex),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — User assets (Layer 6 asset planner + mandated media injection:
// "user uploads photo → becomes route marker icon"). Also brand logos,
// sticker sources, profile photos. Sized + moderated because free-tier
// showcase inclusion makes user media public.
// Consumed by: RouteLayer (needs a NEW `customIconUrl`/`customIconAssetId`
// field — v2 lost v1's RouteSpec.icon.customUrl, scene-graph gap #10),
// ImageLayer.url, brand kits.
// ═══════════════════════════════════════════════════════════════════════════

export const userAssets = pgTable("user_assets", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 'upload' (we host it) | 'url' (external reference, e.g. pasted link). */
  kind:             text("kind").notNull().default("upload"),
  /** Serving URL (CDN/public bucket for approved, signed for pending). */
  url:              text("url").notNull(),
  /** Object-store key for uploads; null for kind='url'. */
  storageKey:       text("storage_key"),
  /** 'route-marker' | 'image-layer' | 'brand-logo' | 'profile' | 'sticker' | 'other' */
  purpose:          text("purpose").notNull().default("other"),
  mimeType:         text("mime_type").notNull(),
  sizeBytes:        bigint("size_bytes", { mode: "number" }).notNull(),
  width:            integer("width"),
  height:           integer("height"),
  /** sha256 of the bytes — dedupe + moderation cache key. */
  contentHash:      text("content_hash"),
  /** 'pending' | 'approved' | 'rejected' — renders/share/showcase may only
   *  reference approved assets; pending assets preview privately. */
  moderationStatus: text("moderation_status").notNull().default("pending"),
  /** Machine label from the moderation pass ('nsfw', 'violence', …). */
  moderationLabel:  text("moderation_label"),
  moderatedAt:      timestamp("moderated_at"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("user_assets_user_idx").on(t.userId, t.createdAt),
  index("user_assets_hash_idx").on(t.contentHash),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Renders: the DURABLE render queue + billing source of truth.
// Replaces the three in-memory job Maps (src/lib/serverRender.ts,
// src/lib/agentBridge.ts, src/lib/renderQueue.ts — all lost on restart,
// rendering gap #7). Field names deliberately mirror the existing
// ServerRenderJob / QueueJob shapes so /api/v2/render GET keeps its response
// contract. Carries the brief's commercial fields: resolution class, server-
// decided watermark/outro flags, and the SERVER-SIDE complexity score for
// PAYG pricing (the only scorer today, complexityOf() in
// src/lib/renderHistory.ts, is client-side and reads legacy v1 fields —
// rendering gap #8).
// ═══════════════════════════════════════════════════════════════════════════

export const renders = pgTable("renders", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId:       text("project_id").references(() => projectsV2.id, { onDelete: "set null" }),
  /** Which checkpoint rendered — provenance for "re-render exactly this". */
  projectVersion:  integer("project_version"),
  name:            text("name").notNull(),
  /** 'cloud' | 'agent' — which pipeline. */
  mode:            text("mode").notNull(),
  /** 'MapanisyV2' | 'MapanisyStory' (src/remotion/root.tsx ids). */
  compositionId:   text("composition_id").notNull(),
  /** 'queued' | 'running' | 'done' | 'failed' | 'cancelled' */
  status:          text("status").notNull().default("queued"),
  paused:          boolean("paused").notNull().default(false),
  progress:        integer("progress").notNull().default(0),   // 0–100
  message:         text("message"),
  error:           text("error"),
  /** RenderSettings JSON: { scale, videoBitrate, x264Preset, alpha } —
   *  SERVER-CLAMPED before insert (free tier: scale forced to the 720p class;
   *  today settings pass through untouched, rendering gap #1). */
  settings:        jsonb("settings").notNull(),
  /** '720p' | '1080p' | '4k' — derived from dimsFor(aspect) × settings.scale;
   *  a PAYG price input and the free-tier cap enforcement record. */
  resolutionClass: text("resolution_class").notNull(),
  aspect:          text("aspect").notNull(),                    // '16:9' | '9:16' | '1:1'
  durationSec:     decimal("duration_sec", { precision: 8, scale: 2 }).notNull(),
  /** Server-decided free-tier corner watermark (today derived at enqueue in
   *  app/api/v2/render/route.ts; persisting it makes it auditable). */
  watermark:       boolean("watermark").notNull().default(false),
  /** Free-tier "Made with Mapinsy" OUTRO card (new tail <Sequence>; distinct
   *  from watermark). Agent-path caveat: advisory only off-server — free
   *  renders should be forced onto the cloud path. */
  outroRequired:   boolean("outro_required").notNull().default(false),
  /** Server-side complexity score 1–100 (see RenderJob contract) — PAYG price
   *  = f(complexityScore, resolutionClass, durationSec). */
  complexityScore: integer("complexity_score"),
  /** Scorer inputs, auditable: { layerCount, dataLayerCount, terrain,
   *  buildings3d, photoreal3d, trackPoints, ohmYearSweep, frames }. */
  complexityBreakdown: jsonb("complexity_breakdown"),
  /** Tokens charged; mirrors the token_ledger consumption row (refId = this id). */
  costTokens:      integer("cost_tokens"),
  outputUrl:       text("output_url"),                 // null on agent renders (file stays local)
  fileExt:         text("file_ext"),                   // 'mp4' | 'mov'
  enqueuedAt:      timestamp("enqueued_at").defaultNow().notNull(),
  startedAt:       timestamp("started_at"),
  finishedAt:      timestamp("finished_at"),
}, (t) => [
  index("renders_user_idx").on(t.userId, t.enqueuedAt),
  index("renders_status_idx").on(t.status, t.enqueuedAt), // worker poll: queued ordered FIFO
  index("renders_project_idx").on(t.projectId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Token ledger (append-only, single-entry with signed deltas).
// Brief: token pool grants, per-render/AI consumption, BYOK-discounted rows.
// DESIGN CHOICE — append-only signed ledger, NOT double-entry: there is one
// internal account per user and one counterparty (the platform); double-entry
// adds a mirrored row per event with zero extra information. Discipline
// instead: rows are NEVER updated or deleted; corrections are new 'adjust'
// rows; monthly pool expiry is an explicit negative 'expire' row written by
// cron (keeps SUM(delta) == balance trivially true); balanceAfter is
// denormalized under a per-user advisory lock for O(1) reads.
// ═══════════════════════════════════════════════════════════════════════════

export const tokenLedger = pgTable("token_ledger", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Signed token amount: + grants, − consumption/expiry. */
  delta:        integer("delta").notNull(),
  /** 'grant.pool' (monthly $11.99 grant) | 'grant.signup' | 'grant.promo'
   *  | 'grant.payg-topup' | 'consume.render' | 'consume.ai'
   *  | 'expire.pool' | 'adjust' | 'refund' */
  reason:       text("reason").notNull(),
  /** What this row points at: 'render' | 'generation' | 'stripe-invoice' | null. */
  refType:      text("ref_type"),
  refId:        text("ref_id"),
  /** True when BYOK discounted this row: user's own AI key paid for the model
   *  call, so we charge workflow value only (camera-script compile, style
   *  layers, cloud render pipeline), not AI tokens. */
  byokApplied:  boolean("byok_applied").notNull().default(false),
  /** Discount applied when byokApplied (e.g. 100 = AI metering fully waived). */
  discountPct:  integer("discount_pct").notNull().default(0),
  /** Running balance after this row (denormalized; recomputable as SUM(delta)). */
  balanceAfter: integer("balance_after").notNull(),
  /** Grant rows only: when the granted tokens lapse (pool tokens don't roll
   *  over); the expiry cron converts the unspent remainder into 'expire.pool'. */
  expiresAt:    timestamp("expires_at"),
  meta:         jsonb("meta"),                          // { model, tokensUsed (_meta.tokensUsed), … }
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("token_ledger_user_idx").on(t.userId, t.createdAt),
  index("token_ledger_ref_idx").on(t.refType, t.refId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — BYOK provider keys, encrypted at rest.
// Today BYO keys live ONLY in browser localStorage ("mapanisy-ai" etc.,
// src/v2/ui/SettingsModal.tsx) and travel per-request as body.ai — the server
// has no record a user is BYOK (data-auth-billing gap #5). This table gives
// billing its BYOK signal and lets server-initiated jobs (arc chapters,
// re-renders) use the user's key. Encryption: AES-256-GCM with a key from
// env/KMS (BYOK_MASTER_KEY), ciphertext+iv+tag stored, plaintext NEVER logged
// or returned (only keyLast4). localStorage remains as a client cache; the
// per-request body.ai path keeps working unchanged (configFromUser() in
// src/lib/ai/providers.ts) — this table is the fallback + billing flag.
// ═══════════════════════════════════════════════════════════════════════════

export const byokKeys = pgTable("byok_keys", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Provider id accepted by configFromUser(): 'anthropic' | 'openai' |
   *  'gemini' | 'openai-compatible' | NAMED_PROVIDERS keys (groq, mistral,
   *  together, perplexity, grok, openrouter, ollama, cohere, deepseek,
   *  fireworks) | 'elevenlabs' | 'google-3dtiles' | 'restyle'. */
  provider:       text("provider").notNull(),
  model:          text("model"),
  /** SSRF-checked with isSsrfSafeUrl() BEFORE insert (same guard as runtime). */
  baseUrl:        text("base_url"),
  keyCiphertext:  text("key_ciphertext").notNull(),     // AES-256-GCM, base64
  keyIv:          text("key_iv").notNull(),
  keyTag:         text("key_tag").notNull(),
  keyLast4:       text("key_last4").notNull(),          // display only
  label:          text("label"),
  /** 'active' | 'invalid' | 'revoked' */
  status:         text("status").notNull().default("active"),
  /** Set by the /api/ai/test one-token ping (maxTokens 8) on save + weekly re-check. */
  lastVerifiedAt: timestamp("last_verified_at"),
  lastErrorAt:    timestamp("last_error_at"),
  lastError:      text("last_error"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("byok_keys_user_idx").on(t.userId),
  uniqueIndex("byok_keys_user_provider_idx").on(t.userId, t.provider),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Anti-credential-sharing trio (brief: Passkey/WebAuthn + session-
// concurrency + client fingerprinting). Zero WebAuthn/fingerprint/session
// code exists today (data-auth-billing gaps #1–3); Clerk remains the primary
// authenticator — these tables ADD step-up + telemetry, they don't replace it.
// ═══════════════════════════════════════════════════════════════════════════

// Passkeys: one row per registered WebAuthn credential. Paid tiers require at
// least one passkey; step-up challenge on new device_fingerprints.
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** base64url credential ID from the authenticator — globally unique. */
  credentialId: text("credential_id").notNull().unique(),
  publicKey:    text("public_key").notNull(),           // COSE key, base64
  /** Signature counter — MUST be monotonically increasing; a regression is
   *  the classic cloned-authenticator (= shared credential) signal. */
  counter:      bigint("counter", { mode: "number" }).notNull().default(0),
  transports:   jsonb("transports"),                    // ['internal','hybrid',…]
  /** 'platform' | 'cross-platform' */
  deviceType:   text("device_type"),
  backedUp:     boolean("backed_up").notNull().default(false),
  aaguid:       text("aaguid"),
  nickname:     text("nickname"),
  lastUsedAt:   timestamp("last_used_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("webauthn_user_idx").on(t.userId),
]);

// Client fingerprints: coarse, privacy-bounded device signatures. The
// cross-ACCOUNT index is the sharing detector: one fingerprint appearing
// under many userIds ⇒ shared machine or resold account.
export const deviceFingerprints = pgTable("device_fingerprints", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** sha256 of the canonicalized component vector — never raw components alone. */
  fingerprintHash: text("fingerprint_hash").notNull(),
  /** Coarse components only: { uaFamily, platform, timezone, screenClass,
   *  languages, gpuVendorClass } — no canvas/audio supercookies. */
  components:      jsonb("components"),
  trusted:         boolean("trusted").notNull().default(false), // passed a passkey step-up
  seenCount:       integer("seen_count").notNull().default(1),
  firstSeenAt:     timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt:      timestamp("last_seen_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("device_fp_user_hash_idx").on(t.userId, t.fingerprintHash),
  index("device_fp_hash_idx").on(t.fingerprintHash),    // cross-account sharing scan
]);

// Active sessions: one row per Clerk session, heartbeat-updated by middleware.
// Concurrency policy = COUNT(*) WHERE revokedAt IS NULL AND lastActiveAt >
// now() - interval '15 min'; exceeding tier limit (e.g. 3) forces the oldest
// session's revocation + passkey step-up. Distinct from the render-agent
// heartbeat (agentBridge AgentSession), which stays as-is.
export const activeSessions = pgTable("active_sessions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clerkSessionId: text("clerk_session_id").notNull().unique(),
  fingerprintId:  uuid("fingerprint_id").references(() => deviceFingerprints.id, { onDelete: "set null" }),
  /** sha256(ip + daily salt) — correlation without storing raw IPs. */
  ipHash:         text("ip_hash"),
  country:        text("country"),                      // coarse geo for "2 countries at once" signal
  city:           text("city"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  lastActiveAt:   timestamp("last_active_at").defaultNow().notNull(),
  revokedAt:      timestamp("revoked_at"),
  /** null | 'concurrency' | 'admin' | 'user' | 'expired' */
  revokedReason:  text("revoked_reason"),
}, (t) => [
  index("active_sessions_user_idx").on(t.userId, t.lastActiveAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Showcase gallery (brief: free tier includes showcase inclusion).
// Explicit consent recorded (free ToS grants it, but keep the receipt);
// entries only publishable when the project's referenced assets are all
// moderationStatus='approved'.
// ═══════════════════════════════════════════════════════════════════════════

export const showcaseEntries = pgTable("showcase_entries", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId:   text("project_id").notNull().references(() => projectsV2.id, { onDelete: "cascade" }),
  renderId:    uuid("render_id").references(() => renders.id, { onDelete: "set null" }),
  title:       text("title").notNull(),
  description: text("description"),
  /** Denormalized from story_dna for gallery filters (Travel / History / …). */
  vertical:    text("vertical"),
  posterUrl:   text("poster_url"),
  videoUrl:    text("video_url"),
  /** 'pending' | 'published' | 'removed' */
  status:      text("status").notNull().default("pending"),
  consentAt:   timestamp("consent_at").notNull(),       // when the user/ToS granted inclusion
  featured:    boolean("featured").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("showcase_status_idx").on(t.status, t.featured, t.sortOrder),
  index("showcase_user_idx").on(t.userId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NEW — Public share tokens. EXTENDS projects_v2.share_token (which remains
// the single ACTIVE token so /api/v2/projects/share and /v/[token] keep
// working untouched); this table adds expiry, revocation, and view analytics,
// and allows multiple historical tokens per project. The share route writes
// both; the public lookup can migrate here later without breaking old links.
// ═══════════════════════════════════════════════════════════════════════════

export const shareTokens = pgTable("share_tokens", {
  id:           uuid("id").primaryKey().defaultRandom(),
  projectId:    text("project_id").notNull().references(() => projectsV2.id, { onDelete: "cascade" }),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:        text("token").notNull().unique(),       // shr_…
  /** Whether the public viewer shows the free-tier branding (today
   *  SharedViewer hardcodes watermark: false — surfaces gap #6). */
  branded:      boolean("branded").notNull().default(true),
  expiresAt:    timestamp("expires_at"),
  revokedAt:    timestamp("revoked_at"),
  viewCount:    integer("view_count").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("share_tokens_project_idx").on(t.projectId),
]);

// ── Inferred row types ─────────────────────────────────────────────────────
export type User               = typeof users.$inferSelect;
export type Subscription       = typeof subscriptions.$inferSelect;
export type RenderLog          = typeof renderLogs.$inferSelect;
export type Scene              = typeof scenes.$inferSelect;
export type ProjectV2          = typeof projectsV2.$inferSelect;
export type ProjectVersion     = typeof projectVersions.$inferSelect;
export type StoryDnaRow        = typeof storyDna.$inferSelect;
export type ArcMemoryRow       = typeof arcMemory.$inferSelect;
export type UserPreferences    = typeof userPreferences.$inferSelect;
export type TasteEventRow      = typeof tasteEvents.$inferSelect;
export type PlanningSession    = typeof planningSessions.$inferSelect;
export type PlanningTurn       = typeof planningTurns.$inferSelect;
export type UserAsset          = typeof userAssets.$inferSelect;
export type RenderRow          = typeof renders.$inferSelect;
export type TokenLedgerRow     = typeof tokenLedger.$inferSelect;
export type ByokKey            = typeof byokKeys.$inferSelect;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type DeviceFingerprint  = typeof deviceFingerprints.$inferSelect;
export type ActiveSession      = typeof activeSessions.$inferSelect;
export type ShowcaseEntry      = typeof showcaseEntries.$inferSelect;
export type ShareToken         = typeof shareTokens.$inferSelect;
```

---

## 3. DATA CONTRACTS — canonical JSON shapes, storage column, validating schema

Validation reality check first: `src/lib/schemas.ts` only holds **boundary** schemas for legacy v1 routes (`ExportSpecPayload`, `RenderPayload`, `RoutePayload`, `SearchQuery`, `PresetUpsertPayload`, `parseOrError`) — none of the shapes below. The real document validator is `src/v2/doc/schema.ts`. Where no validator exists today, the contract below names the **new** Zod module to create (each a small file mirroring the `src/v2/doc/schema.ts` idiom).

### 3.1 Story DNA (Layer 1 + Layer 2)

```ts
/** Canonical Story DNA — NEW module: src/lib/parse/storyDna.ts */
export type StoryVertical =
  | "travel-vlog" | "history-military" | "flight-logistics" | "data-comparison" | "general";

export type StoryDNA = {
  /** Canonical story_type — the RECONCILIATION of the three existing taxonomies:
   *  Storyboard.pattern (8 STORY_PATTERNS, src/lib/parse/director.ts),
   *  DirectorScript.arc (6 values, inline in app/api/v2/generate/route.ts),
   *  Archetype.name (10 entries, src/lib/ai/directorDoctrine.ts).
   *  Canonical values: "journey" | "expansion" | "contraction" | "spread"
   *  | "conflict" | "comparison" | "scale" | "reveal" | "data" | "environment" */
  story_type: string;
  vertical: StoryVertical;                       // L2 classification
  emotion: "wonder" | "tension" | "triumph" | "melancholy" | "urgency" | "calm" | null;
  pace: "slow" | "medium" | "fast" | null;       // = DirectorBeat.pacing vocabulary
  focus: string | null;                          // = Plan.focus subject
  camera_feel: "documentary" | "dynamic" | "locked" | "orbital" | "chase" | null;
  target_audience: "general" | "filmmakers" | "journalists" | "educators" | "social" | null;
  confidence: number;                            // 0–1, from Interpretation.confidence
  source: "ai" | "heuristic";
};
```

- **Stored in:** `story_dna` structured columns (`story_type`, `vertical`, `emotion`, `pace`, `focus`, `camera_feel`, `target_audience`, `confidence`, `source`); full generation context in `story_dna.raw` jsonb (`{ interpretation, storyboard, dirScript, plan, verification, interviewAnswers }`).
- **Validated by:** nothing today — this object does not exist in code (intent-parse gap L1; nearest fragments: `StyleProfile` in `src/lib/parse/intent.ts` covers pace/camera_feel, `Interpretation.action/locations` cover focus). **Create `StoryDnaSchema` (zod) in `src/lib/parse/storyDna.ts`**; the generate route populates it from `framework.interpretation` + `matchArchetype` + `dirScript` and inserts the row alongside the response.

### 3.2 Camera Goal (Layer 5)

```ts
/** High-level camera intent the AI emits — NEW module: src/v2/doc/cameraGoal.ts */
export type CameraGoal =
  | { kind: "orbit";        target: PlaceRef; degrees?: number; pitch?: number }   // default sweep 75° (renderHelpers.ts poseAt)
  | { kind: "pan";          target: PlaceRef; direction?: "e" | "w" }
  | { kind: "reveal";       target: PlaceRef }                                      // compiles to zoom-out
  | { kind: "fly-to";       target: PlaceRef; zoom?: number; pitch?: number }       // compiles to fly-in / push-in
  | { kind: "route-follow"; routeLayerId: string; mode?: "follow" | "chase" | "orbit" | "frame" }
  | { kind: "hold";         target: PlaceRef };
type PlaceRef = { place: string } | { lon: number; lat: number };

export type CameraGoalTrack = {
  goals: CameraGoal[];                 // ordered; compiler assigns dwell via documentaryPath weights
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "cinematic"
        | { bezier: [number, number, number, number] };   // NEW cubic-bezier option
};
```

- **Stored in:** the scene-graph document (`projects_v2.doc` / `project_versions.doc`) as a NEW optional `goals: CameraGoalTrack` field **on the existing `CameraLayer`** (`src/v2/doc/schema.ts:99-119`) — the compiled `start/end/waypoints/style/moveFraction` stay authoritative for the renderer; `goals` preserves the AI's intent so edits/regenerations can recompile instead of guessing (fixes ai-pipeline gap #3: today the Composer is forced to emit literal `{zoom,pitch,bearing}` numbers via `cameraPoses`). The raw AI-emitted goals also land in `story_dna.raw.plan`.
- **Validated by:** today only the *compiled* form is validated (`CameraLayer` in `src/v2/doc/schema.ts`; poses clamped by `fixPose` in `src/v2/doc/validate.ts` and `sanitizePose` in `src/v2/render/layers/renderHelpers.ts`). **Create `CameraGoalSchema` in `src/v2/doc/cameraGoal.ts`** and add `goals: CameraGoalSchema.optional()` to `CameraLayer` (unknown-key-safe: additive with a default, so `schemaVersion` stays 1). Note the mandated 90° pitch requires coordinated raises at `schema.ts:30`, `validate.ts:27`, `renderHelpers.ts:71`, plus `maxPitch={90}` on the render `<Map>`.

### 3.3 Scene Graph node (Layer 4)

```ts
/** The Scene Graph node contract — EXISTING types, src/v2/doc/schema.ts */
export type SceneGraphDocument = Project;   // { id, name, schemaVersion: 1, composition, scenes[], activeSceneId, shareToken, createdAt, updatedAt }
export type SceneGraphScene    = Scene;     // { id, name, narration, transition, transitionDuration, composition }
export type SceneGraphNode     = Layer;     // z.discriminatedUnion("type", [...21 layer schemas]) — camera|highlight|route|label|flag|title|chart|choropleth|bubble|flow|heatmap|earthlayer|image|marker|annotation|connections|spotlight|track|radius|timestamp|atmosphere
```

- **Stored in:** `projects_v2.doc` (latest) and `project_versions.doc` (checkpoints), both jsonb. `projects_v2.schema_version` mirrors `doc.schemaVersion` for migration queries.
- **Validated by:** **existing** `ProjectSchema` / `parseProject` / `safeParseProject` in `src/v2/doc/schema.ts` — already enforced at all four boundaries: generate output (`buildFromPlan` returns `ProjectSchema.parse(project)`), save (`/api/v2/projects` `safeParse`), render (`/api/v2/render` `safeParse` + `validateProject` in `src/v2/doc/validate.ts`), and store rehydrate (`src/v2/store/editor.ts` persist migrate). **Two required schema additions before DB-as-source-of-truth:** (a) `narrationLines` on `Composition` (see §1 — currently stripped, live defect); (b) a real migration ladder replacing the `safeParseProject ?? createDefaultProject()` data-loss fallback, keyed off `project_versions` history.
- **Note:** the AI-side `Plan`/`PlanLayer` (inline TS types in `app/api/v2/generate/route.ts:92-185`, never Zod-validated — ai-pipeline gap #1) is *not* the persisted contract; it is provenance and belongs in `story_dna.raw.plan`. Recommend extracting it into a versioned `src/v2/doc/plan.ts` Zod module, which also removes the `_registerPlanBuilder` side-effect coupling in `app/api/v2/addon/apply/route.ts`.

### 3.4 Look Config (Layer 7)

```ts
/** ONE holistic look per project — NEW module: src/v2/doc/lookConfig.ts */
export type LookConfig = {
  version: 1;
  paletteName: string;                 // THEME_PRESETS name → compiles to Theme (src/v2/doc/themes.ts)
  accent?: string;                     // hex override
  fontDisplay: string;                 // FONT_CHOICES name
  fontBody: string;
  lineBehavior: {                      // compiles onto RouteLayer/ConnectionsLayer defaults
    width: number; glow: number;       // glow 0–1.5 (schema ranges)
    dashStyle: "solid" | "dashed" | "dotted";
    smoothness: number;                // 0–1
  };
  labelDensity: "none" | "countries" | "cities" | "all";   // = Basemap.labelDetail
  terrainDimension: { enabled: boolean; strength: number };  // Basemap.terrain + terrainStrength 0–5
  easingProfile: "linear" | "easeIn" | "easeOut" | "easeInOut" | "cinematic"
               | { bezier: [number, number, number, number] };
  grade?: Partial<Look>;               // optional pro-only extras (letterbox/grain/wheels) — UI-gated per aesthetic-pruning mandate
  basemapStyleId?: string;             // PRO_MAP_STYLES / MAP3D_STYLES id
};
```

- **Stored in:** `projects_v2.look_config` jsonb — exactly one per project, satisfying "never per-scene". The per-scene `Composition.theme/look/basemap` inside `doc` remain the **compiled output** (the renderer contract is untouched); a `applyLookConfig(project, lookConfig)` compiler re-stamps every scene on add/edit, which fixes the scene-divergence gap (today only `addScene` clones the look forward, `src/v2/store/editor.ts:245-248`).
- **Validated by:** the compiled pieces are validated today by `Theme`, `Look`, `Basemap` in `src/v2/doc/schema.ts`. The config itself has no validator — **create `LookConfigSchema` in `src/v2/doc/lookConfig.ts`**, composing the existing enums (`Basemap.labelDetail`, `Easing`, `Look` partial) so ranges stay single-sourced.

### 3.5 Render Job

```ts
/** Durable render job — row shape of `renders`; NEW module src/lib/renderJob.ts */
export type RenderJob = {
  id: string;
  userId: string;
  projectId: string | null;
  projectVersion: number | null;
  mode: "cloud" | "agent";
  compositionId: "MapanisyV2" | "MapanisyStory";
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  paused: boolean;
  progress: number;                    // 0–100
  message: string | null;
  error: string | null;
  settings: { scale: number; videoBitrate?: string; x264Preset?: string; alpha?: boolean };
  resolutionClass: "720p" | "1080p" | "4k";
  aspect: "16:9" | "9:16" | "1:1";
  durationSec: number;
  watermark: boolean;
  outroRequired: boolean;
  complexityScore: number | null;      // 1–100: f(layerCount, dataLayers, terrain, buildings3d, photoreal3d, trackPoints, ohmYearSweep, frames×scale)
  complexityBreakdown: Record<string, number | boolean> | null;
  costTokens: number | null;           // mirrors token_ledger row (refType 'render', refId = id)
  outputUrl: string | null;            // null on agent renders
  fileExt: "mp4" | "mov" | null;
  enqueuedAt: string; startedAt: string | null; finishedAt: string | null;
};
```

- **Stored in:** the `renders` table (columns 1:1 with the type; `settings`/`complexityBreakdown` jsonb). Field names deliberately mirror `ServerRenderJob` (`src/lib/serverRender.ts`) and the GET `/api/v2/render` `QueueJob` response so the client contract survives the in-memory→DB move unchanged.
- **Validated by:** nothing today — `ServerRenderJob`/`AgentJob`/`RenderJob` are TS-only in-memory types, and `settings` arrives unvalidated at `POST /api/v2/render` (the only render Zod in `src/lib/schemas.ts`, `RenderPayload`, guards the *legacy* `/api/render` route). **Create `RenderSettingsSchema` + `RenderJobSchema` (zod) in `src/lib/renderJob.ts`**, and make the route clamp `settings.scale` by tier there (free → 720p class) before insert. The complexity scorer must be a **new server-side function over the v2 `Composition`** — the existing `complexityOf()` (`src/lib/renderHistory.ts`) is client-side and reads legacy v1 fields, so it cannot feed billing.

### 3.6 Contract ↔ storage matrix (summary)

| Contract | Canonical column | Validating Zod (today) | Validating Zod (to create) |
|---|---|---|---|
| Story DNA | `story_dna.*` structured cols + `story_dna.raw` | — (does not exist; fragments in `src/lib/parse/intent.ts` `StyleProfile`) | `StoryDnaSchema` — `src/lib/parse/storyDna.ts` |
| Camera Goal | `projects_v2.doc` → camera layer `goals` (+ provenance in `story_dna.raw.plan`) | compiled poses: `CameraLayer` in `src/v2/doc/schema.ts` | `CameraGoalSchema` — `src/v2/doc/cameraGoal.ts` |
| Scene Graph node | `projects_v2.doc`, `project_versions.doc` | **`Layer` / `Composition` / `Project` + `parseProject` — `src/v2/doc/schema.ts`** (add `narrationLines`) | — (extend existing) |
| Look Config | `projects_v2.look_config` | compiled: `Theme`/`Look`/`Basemap` in `src/v2/doc/schema.ts` | `LookConfigSchema` — `src/v2/doc/lookConfig.ts` |
| Render Job | `renders` row (`settings`, `complexity_breakdown` jsonb) | — (`RenderPayload` in `src/lib/schemas.ts` covers legacy route only) | `RenderJobSchema` / `RenderSettingsSchema` — `src/lib/renderJob.ts` |
| Interview Q&A | `planning_turns.question` jsonb / `answer_value` | — (`IVQuestion` TS-only in `app/api/v2/interview/route.ts`, sanitized ad hoc) | `IVQuestionSchema` — extract into `src/lib/parse/interview.ts` |
| Token ledger meta | `token_ledger.meta` | — | inline zod in the ledger writer (`src/lib/billing/ledger.ts`) |

---

## 4. Migration & rollout order

1. **Baseline migration** — snapshot current five tables into `drizzle/migrations/0000_baseline` (none committed today; bump drizzle-kit per the `drizzle.config.ts` warning first).
2. **Schema-additive migration `0001`** — all NEW tables + `subscriptions` new columns + `projects_v2` new columns; `doc text→jsonb` via `USING doc::jsonb` (transactional, table is small pre-launch).
3. **Code fixes bundled with `0001`:** `narrationLines` into `Composition` (`src/v2/doc/schema.ts`); `/api/v2/projects` stops stringifying `doc`; `/api/v2/render` writes `renders` rows (dual-write `render_logs` during transition) and clamps free-tier `settings.scale`.
4. **Repoint `checkQuota`** (`src/lib/quota.ts`) at `renders` + `token_ledger`; retire the honor-system `/api/render-log` self-reporting; exclude `BYPASS_QUOTA` from production.
5. **Fold job + cron:** taste fold (`taste_events` → `user_preferences`), pool-grant/expiry ledger rows, BYOK weekly re-verification, session-concurrency sweep.
6. Naming: tables are product-name-neutral, so the Mapinsy-vs-Mapanisy decision (surfaces gap #10) costs nothing at the DB layer.