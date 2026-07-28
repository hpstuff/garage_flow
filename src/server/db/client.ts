/**
 * Drizzle client over postgres.js (ADR-0011, ADR-0012).
 *
 * A single long-lived connection pool — the persistent process is what makes
 * the invoice-locking transactions (SELECT … FOR UPDATE) reliable, which is why
 * we host a long-running Node server rather than serverless.
 *
 * This is the ONLY module that holds an unscoped database handle. Services must
 * never import it directly; they receive a ScopedDb (ADR-0013).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Reuse the client across dev HMR reloads to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  __gfQueryClient?: ReturnType<typeof postgres>;
};

const queryClient = globalForDb.__gfQueryClient ?? postgres(connectionString ?? "", { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__gfQueryClient = queryClient;
}

export const db = drizzle(queryClient, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema, queryClient };
