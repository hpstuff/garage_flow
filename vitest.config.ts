import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Service tests are the primary suite (ADR-0018) and run in Node.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration tests read DATABASE_URL; load .env.local if present.
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
