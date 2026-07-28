# Authentication: Better Auth, email + password, sessions in Postgres

**Context.** A User logs in within an Account, and the session must resolve to `{ account, active location, role }` to feed `ScopedDb` (ADR-0013) and role checks. GDPR favours keeping identity data in our own database rather than a third-party processor (ADR-0004), and ADR-0005's thin-adapter future means auth must eventually serve non-browser clients (mobile app, public API), not only cookies.

**Decision.** Use **Better Auth**: **email + password only for v1**, sessions stored in our PostgreSQL via its Drizzle adapter, and its organization plugin to model Account membership. The small mapping from session → `{ account, active location, role }` is our own code and is the sole source of a `scope`. Bearer/JWT issuance for mobile and the public API is a later addition on the same library.

Rejected alternatives: hosted identity providers (Clerk/Auth0/WorkOS/Supabase Auth) — avoid a third-party PII processor and its cost; rolling our own — too risky for a small team (reset flows, session fixation, rate-limiting); Auth.js/NextAuth — de-emphasises password auth and is Next-coupled, which rubs against the reuse-for-mobile/API goal.

**Consequences.** Identity PII stays in our EU database, keeping the GDPR story clean. Better Auth is the youngest candidate, so its maintenance/version health is sanity-checked at implementation time, with Auth.js as the fallback if it looks shaky. Roles exist as a field (owner / front-desk / manager); fine-grained permissions are out of v1 (per ROADMAP). Social login is deferred.
