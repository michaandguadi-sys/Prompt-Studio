import type { Config } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Drizzle CLI commands. Add it to .env.local");
}

// drizzle-kit 0.18 API: flat config with a top-level `connectionString`
// (the `dialect`/`dbCredentials` shape arrived in later versions — bump the
// dep before switching this back).
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  connectionString: process.env.DATABASE_URL,
} satisfies Config;
