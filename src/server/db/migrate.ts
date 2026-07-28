/**
 * Applies all pending migrations from a clean database (ADR-0011, ADR-0018).
 * Run with `npm run db:migrate`. CI runs this against a throwaway Postgres to
 * prove migrations apply from scratch.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./src/server/db/migrations" });
    console.log("✓ migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
