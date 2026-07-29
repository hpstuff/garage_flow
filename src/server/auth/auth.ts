/**
 * Better Auth server instance (ADR-0014): email + password only for v1,
 * sessions in our PostgreSQL via the Drizzle adapter, and the organization
 * plugin to model Account membership.
 *
 * This is transport-free core: it must not import `next` (enforced by the
 * ADR-0015 boundary). The Next.js glue lives in the app layer
 * (src/app/api/auth/[...all]/route.ts) via better-auth/next-js.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db, schema } from "../db/client";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
});

export type Auth = typeof auth;
