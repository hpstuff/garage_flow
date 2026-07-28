import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

export default defineConfig({
  dialect: "postgresql",
  // Domain schema plus the Better Auth tables (ADR-0011, ADR-0014).
  schema: ["./src/server/db/schema.ts", "./src/server/db/auth-schema.ts"],
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
