import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// No throw here — every API route that uses the DB does `if (!db) return 503`.
// Throwing at module evaluation blocks next build without DATABASE_URL.
const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : null;

export const db = client
  ? drizzle(client, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

export { schema };
