# GarageFlow — Agent Quick Reference

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Drizzle + PostgreSQL 17 · Better Auth · Zod 4 · Tailwind 4 + shadcn/ui · next-intl (Bulgarian) · Biome · Vitest · Node 24

## Essential docs
- `CONTEXT.md` — domain terminology (Account, Location, Repair Order, …). **Use these exact terms.**
- `docs/CONVENTIONS.md` — how the architecture decisions (ADR-00*) are enforced in code.
- `docs/adr/` — 18 architecture decisions (GF-00 through GF-01).

## Setup
```bash
nvm use && npm ci
cp .env.example .env.local   # edit DATABASE_URL / BETTER_AUTH_SECRET
npm run db:up               # starts Postgres 17 via Docker Compose
npm run db:migrate          # apply migrations
npm run db:seed             # demo credentials: owner@example.com / password12345
npm run dev                 # http://localhost:3000
```
Env files are loaded in order: `.env.local` then `.env` (no override). Drizzle, Vitest, and the DB client all follow this convention.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (standalone output) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome: format + lint + import-boundary check |
| `npm run lint:fix` | Auto-fix lint/format issues |
| `npm test` | Vitest (unit + integration; integration self-skips without `DATABASE_URL`) |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:seed` | Seed demo data |
| `npm run auth:generate` | Regenerate Better Auth schema types |

CI order: **typecheck → lint → db:migrate → test → build → Docker image**.

## Architecture (non-obvious)

### `src/server/` — transport-free core
**Must not import** `next`, `react`, `react-dom`, `server-only`, or `@/app/**`. Enforced by a Biome `noRestrictedImports` rule on `src/server/**` (run via `npm run lint`).

### Service contract
Every service function: `(scope: Scope, input) => Promise<plainData>`
1. Validate `input` with its Zod schema at the top
2. Query through `ScopedDb` (never raw `db`)
3. Return plain objects via explicit column selects
4. Throw typed domain errors (`ValidationError`, `NotFoundError`, `ConflictError`, `PermissionError`) from `src/server/domain/errors.ts`

### Scoping (multi-tenancy)
- Tenant = **Account**. Operational data scoped to **Location**.
- `Scope` is a branded type, constructible **only** via `scopeFromSession` in `src/server/db/scope.ts`.
- `ScopedDb` (in `src/server/db/scoped-db.ts`) binds queries to `{ accountId, locationId, role }`.
- Raw `db` handle lives only in `src/server/db/client.ts` and `resolve-scope.ts`.

### Auth domain mapping
Better Auth's `organization` table = domain **Account**. Better Auth's `account` table = credential storage. Domain code never references auth table names — it uses `accountId` and goes through `ScopedDb`.

### Server Actions
Contain **no business logic**. Pattern: authenticate → derive `scope` → call one service → translate result/errors. Reference: `src/app/(app)/dashboard/_actions/load-dashboard.ts`.

### i18n
Bulgarian is the only shipped locale. All strings go through `src/i18n/messages/bg.json`. next-intl is wired via `next.config.ts` → `src/i18n/request.ts`.

### Money
Stored as integer minor units with explicit currency. Never floats. Formatting via `src/lib/format.ts` (Intl, Bulgarian locale).

## Testing
- Service tests are the primary suite. Run in Node environment.
- Integration tests require `DATABASE_URL` (loaded from `.env.local` via `vitest.setup.ts`). Without it, they self-skip.
- Test files: `src/**/*.test.ts` and `src/**/*.test.tsx`.

## Git
**Never push to `main`.** Work on a branch, commit after every self-contained change, open a PR.
