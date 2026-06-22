import {
  pgTable, uuid, text, integer, decimal, timestamp, index,
} from "drizzle-orm/pg-core";

// ── Users (synced from Clerk via webhook) ─────────────────────────────────

export const users = pgTable("users", {
  id:        uuid("id").primaryKey().defaultRandom(),
  clerkId:   text("clerk_id").notNull().unique(),
  email:     text("email").notNull(),
  name:      text("name"),
  /** Unique token the Render Agent uses to authenticate with this account. */
  agentKey:  text("agent_key").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Subscriptions ─────────────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tier:                 text("tier").notNull().default("free"),
  status:               text("status").notNull().default("active"),
  minutesLimit:         integer("minutes_limit").notNull().default(50),
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId:        text("stripe_price_id"),
  currentPeriodStart:   timestamp("current_period_start"),
  currentPeriodEnd:     timestamp("current_period_end"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});

// ── Render logs (one row per render job) ─────────────────────────────────
// duration_seconds is the source of truth; quota is checked by summing this
// per billing period and converting to minutes (÷60).

export const renderLogs = pgTable("render_logs", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sceneName:       text("scene_name"),
  /** Wall-clock seconds the render took (from Remotion Lambda metadata). */
  durationSeconds: decimal("duration_seconds", { precision: 10, scale: 2 }).notNull(),
  tierAtRender:    text("tier_at_render"),
  /** 'started' | 'completed' | 'failed' */
  status:          text("status").notNull().default("completed"),
  outputUrl:       text("output_url"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("render_logs_user_period_idx").on(t.userId, t.createdAt),
]);

// ── Saved scenes (replaces localStorage) ─────────────────────────────────

export const scenes = pgTable("scenes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  kind:      text("kind").notNull(),
  spec:      text("spec").notNull(), // JSON string of SceneSpec
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("scenes_user_idx").on(t.userId),
]);

// ── Saved Mapanisy v2 projects (per-user; replaces the FS / localStorage store) ─
// The primary key is the project document's own id (proj_xxx) so re-saving a
// project updates the same row and a rename never forks a duplicate. `doc` is
// the JSON-stringified validated Project.

export const projectsV2 = pgTable("projects_v2", {
  id:        text("id").primaryKey(),                 // = Project.id (proj_xxx)
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  doc:       text("doc").notNull(),                   // JSON string of Project
  /** Public share token (`shr_…`) — set when the owner publishes a read-only
   *  viewer link, cleared on un-share. Source of truth for the public lookup
   *  (indexed/unique) so a normal save never has to touch it. */
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("projects_v2_user_idx").on(t.userId),
]);

export type User         = typeof users.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type RenderLog    = typeof renderLogs.$inferSelect;
export type Scene        = typeof scenes.$inferSelect;
export type ProjectV2    = typeof projectsV2.$inferSelect;
