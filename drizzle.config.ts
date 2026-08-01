import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";

/**
 * drizzle-kit config (v0.31 — matched to drizzle-orm 0.45).
 *
 * Deploy the schema with `npm run db:push` (push-based; no migration files) —
 * this applies the current schema.ts, including additive tables, to the DB at
 * DATABASE_URL. drizzle-kit does NOT auto-load .env.local, so we resolve the URL
 * from the environment first, then fall back to reading .env.local ourselves
 * (dependency-free — no dotenv needed).
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(".env.local", "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  } catch { /* no .env.local — fall through to the error */ }
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. This is a DEPLOY step: set DATABASE_URL " +
    "(your Postgres connection string) in the environment or .env.local, then run `npm run db:push`.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl() },
});
