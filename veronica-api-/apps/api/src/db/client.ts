import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DbClient = PostgresJsDatabase<typeof schema>;

/**
 * Create a Drizzle client backed by postgres-js (TCP driver) for Node dev/prod.
 *
 * `prepare: false` is required for Supabase's transaction-mode connection pooler
 * (pgBouncer), which does not support prepared statements.
 *
 * When deployed to Cloudflare Workers in Phase 2, swap this driver for
 * `drizzle-orm/neon-http` (HTTP driver) — keep route handlers free of
 * Node-specific APIs so that swap stays clean.
 */
export function createDbClient(url: string): DbClient {
  const sql = postgres(url, {
    prepare: false,
    // Supabase pooler limits concurrent connections — keep the dev pool small.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}
