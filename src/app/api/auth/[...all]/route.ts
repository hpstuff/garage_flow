import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

// Better Auth's HTTP surface — a thin Next.js adapter over the core `auth`
// instance (ADR-0005: adapters glue, the library owns the logic).
export const { GET, POST } = toNextJsHandler(auth);
