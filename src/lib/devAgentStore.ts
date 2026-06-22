/**
 * File-backed dev fallback for the agent-key / agent-session system.
 *
 * In local dev there's usually no DATABASE_URL, so every agent route that
 * looks a user up by clerkId or agentKey would 503 and the whole "Render on
 * Device" feature (key display, regenerate, connect, render) silently fails.
 *
 * This module gives those routes a real, persistent store when `db` is null:
 *   - a stable synthetic userId per Clerk user
 *   - a stable agentKey (so the agent's saved `--key` keeps working across
 *     dev-server restarts)
 *
 * Persisted to .dev-data/agent-keys.json (gitignored). NEVER used when a real
 * database is configured — production always goes through Postgres.
 */
import { randomBytes, createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type DevRecord = { id: string; clerkId: string; agentKey: string };
type DevStoreFile = { records: DevRecord[] };

const DATA_DIR = join(process.cwd(), ".dev-data");
const STORE_PATH = join(DATA_DIR, "agent-keys.json");

function newKey(): string {
  return randomBytes(20).toString("hex"); // 40-char hex — matches prod format
}

/** Deterministic synthetic internal id so it stays stable per Clerk user. */
function syntheticUserId(clerkId: string): string {
  const h = createHash("sha256").update(clerkId).digest("hex");
  // Shape it like a uuid so it's interchangeable with prod userIds downstream.
  return [
    h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32),
  ].join("-");
}

function load(): DevStoreFile {
  try {
    if (existsSync(STORE_PATH)) {
      return JSON.parse(readFileSync(STORE_PATH, "utf8")) as DevStoreFile;
    }
  } catch { /* fall through to empty */ }
  return { records: [] };
}

function save(store: DevStoreFile): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

/** Get (or lazily create) the dev record for a Clerk user. */
export function devGetOrCreateUserByClerk(clerkId: string): { id: string; agentKey: string } {
  const store = load();
  let rec = store.records.find((r) => r.clerkId === clerkId);
  if (!rec) {
    rec = { id: syntheticUserId(clerkId), clerkId, agentKey: newKey() };
    store.records.push(rec);
    save(store);
  }
  return { id: rec.id, agentKey: rec.agentKey };
}

/** Rotate the agent key for a Clerk user. Creates the record if missing. */
export function devRotateKeyByClerk(clerkId: string): { id: string; agentKey: string } {
  const store = load();
  let rec = store.records.find((r) => r.clerkId === clerkId);
  if (!rec) {
    rec = { id: syntheticUserId(clerkId), clerkId, agentKey: newKey() };
    store.records.push(rec);
  } else {
    rec.agentKey = newKey();
  }
  save(store);
  return { id: rec.id, agentKey: rec.agentKey };
}

/** Resolve an agentKey back to its internal userId (for agent-auth routes). */
export function devUserIdForKey(agentKey: string): string | null {
  const store = load();
  return store.records.find((r) => r.agentKey === agentKey)?.id ?? null;
}
