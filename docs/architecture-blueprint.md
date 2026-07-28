# Full-Stack TypeScript Web App — Architecture Blueprint

A reusable, **project-agnostic** starting point for a multi-tenant TypeScript web application
with a transport-agnostic core. Distilled from a real project's architecture decisions; strip
or swap any layer that doesn't fit. Nothing here names a specific domain — adapt the tenancy
terms (`Tenant`, `Scope`) to yours.

> How to reuse: copy this file into a new repo's `docs/`, then adjust the **When to reconsider**
> notes per section to your project's constraints (team skills, scale, compliance, budget).

---

## Guiding principles

1. **A transport-agnostic core.** All domain and business logic lives in a service layer that
   knows nothing about HTTP, the UI framework, or serialization. Every transport (server
   actions, route handlers, a mobile backend, a public API) is a *thin adapter* over it. This
   keeps future clients a packaging exercise, not a rewrite.
2. **Make invariants structural, not disciplinary.** Prefer guarantees the compiler or the
   linter enforces over rules humans must remember (see tenant scoping and the import boundary).
3. **Spend effort where correctness is hardest.** Identify the one or two paths where a bug is
   expensive (money, concurrency, tenant isolation) and over-invest there; keep everything else lean.
4. **Cheapest *responsible* default.** Economise on disposable things (compute); never economise
   on durable or legally-sensitive data (the database and its backups).

---

## Stack at a glance

| Layer | Choice | One-line rationale |
|---|---|---|
| Framework | Next.js (App Router) + Server Actions | SSR + mutations with a clear adapter seam |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Types enforce the core contracts |
| Package manager | npm (single app) / pnpm (if monorepo) | Match repo shape; commit the lockfile |
| Lint + format | Biome (one tool) | Fast; path-scoped rules enforce the boundary |
| Database | PostgreSQL | Relational integrity + transactional locking |
| ORM / migrations | Drizzle + drizzle-kit | SQL-close; explicit transactions and locks |
| Multi-tenancy | App-layer scoped data wrapper (`ScopedDb`) | Isolation without RLS ceremony; RLS as later hardening |
| Auth | Owned-data library (e.g. Better Auth), sessions in Postgres | Identity PII stays in your DB; not framework-locked |
| Validation | Zod (+ drizzle-zod), authoritative in services | One validation path for all transports |
| UI | Tailwind + shadcn/ui, tokens as CSS variables | Owned components; consistent token layer |
| i18n | next-intl, structured from day one | Cheap now, painful to retrofit |
| Money | Integer minor units + explicit currency | Never floats; currency-agnostic storage |
| Testing | Vitest (unit) + real-DB integration + Playwright smokes | Test where logic lives; don't mock the hard race |
| CI / CD | GitHub Actions + Kamal to a VPS | Gate on the boundary; zero-downtime deploy |
| Hosting | Long-running Node server on a cheap VPS + managed Postgres | Persistent pool for locking paths; safe durable data |

---

## Repository structure & the service contract

```
src/
  server/                 transport-free core — may NOT import next/*, react, or src/app/**
    db/                   schema, migrations, the ScopedDb wrapper
    domain/               shared types, typed domain errors
    services/<aggregate>/ service.ts ((scope, input) => data), schema.ts (zod), *.test.ts
  app/                    routes, server actions (_actions/), components — thin adapters only
  i18n/                   message catalogs
```

- **Service signature:** `(scope, input) => Promise<plainData>`. It validates `input` at the top,
  works through `ScopedDb`, and throws typed domain errors.
- **Adapters only glue:** authenticate → derive `scope` → call one service → translate result/errors.
- **No repository layer** until it earns its keep — services use the DB wrapper directly.
- **Enforcement:** a path-scoped `noRestrictedImports` lint rule forbids `src/server/**` from
  importing the framework, the UI library, or `src/app/**`; run it in CI so a violation fails the build.

*When to reconsider:* go monorepo (`packages/core` + `apps/*`) once a second app (mobile backend,
separate API) genuinely needs the core as a versioned package.

---

## Multi-tenancy (tenant scoping)

Every query against tenant-owned data must carry a tenant/workspace scope that **cannot be
bypassed**. Two mechanisms:

- **App-layer `ScopedDb`** — services only ever get a DB handle pre-bound to a `scope`; the
  `scope` is *only constructible from a resolved session*, so an un-scoped query is a compile
  error. Fast, typed, testable. **Default choice.**
- **PostgreSQL Row-Level Security** — bypass-proof at the database, but hand-written policies on
  every table + per-transaction session variables. **Defense-in-depth; add later, or from the
  start if a leak is catastrophic.**

The per-transaction wrapper the app-layer approach needs is the same one RLS requires, so
starting app-layer burns no bridge to adding RLS.

*When to reconsider:* start with RLS on day one if you handle high-sensitivity data or run a
larger team where the discipline assumption is weaker.

---

## The one hard path: money & gapless sequential numbering

If your domain has legally- or financially-significant sequential numbers (invoices, receipts,
orders) they often must be **gapless** — no skips, no collisions, no number burned by a rollback.
This is a concurrency problem, not an auto-increment:

- Lock a per-`(tenant, series)` counter row inside the same transaction that writes the document
  (`SELECT … FOR UPDATE`), or use an advisory lock.
- Store money as **integer minor units** (or `numeric`) with an explicit currency; never floats.
- **Test it against a real database under concurrency** — a mocked DB hides the exact race.

This is the canonical example of principle #3: it's a small surface, but it's where you spend
disproportionate care.

---

## Validation, serialization & errors

- **Zod** schemas, parsed **inside the service** so every transport is protected — not just a form.
- Return **plain objects via explicit column selects**; never leak raw rows or sensitive columns.
  Hand-map DTOs only where DB shape and public contract diverge.
- Throw a **small set of typed domain errors** (`ValidationError`, `NotFoundError`, `ConflictError`,
  `PermissionError`); adapters translate them to a form result or an HTTP status.

---

## Auth

Prefer an **owned-data** auth library that stores sessions/identity in *your* database and is not
locked to the web framework (so mobile/API can reuse it via bearer/JWT later). Keep the mapping
from session → `scope` as your own small piece of code — it's the sole source of a `scope`.

Avoid hosted identity providers when a clean data-residency / minimal-processor story matters, or
when cost sensitivity is high. Avoid hand-rolling auth on a small team.

*When to reconsider:* a hosted provider (Clerk/Auth0/WorkOS) is the right call when you need SSO,
enterprise connectors, or advanced MFA fast and can accept the extra processor + cost.

---

## Testing & CI/CD

- **Vitest**, service-first. The suite's weight sits in the service layer because that's where
  logic lives.
- **Real-DB integration tests** (Testcontainers / ephemeral Postgres in CI) for the hard
  concurrency/constraint paths.
- **Playwright** for a *narrow* set of end-to-end smokes over the primary revenue/critical flow —
  not broad coverage early.
- **GitHub Actions**: typecheck → lint (incl. the import-boundary rule) → unit + integration
  (with a DB service) → build image. **Kamal** deploys the image to the VPS with zero downtime + TLS.

---

## Hosting

- **Compute:** a long-running Node server in Docker on a cheap VPS. A persistent process gives a
  stable connection pool for locking transactions and avoids serverless cold-start/pooling issues.
- **Database:** a **managed** Postgres with automated backups / PITR — the durable, sensitive asset.
- **Deploy:** Kamal (Docker → VPS, zero-downtime, automatic Let's Encrypt TLS via its proxy).
- **Data residency:** colocate app and DB in the region your compliance requires.

*When to reconsider:* a serverless platform (e.g. Vercel) is the faster path when your workload is
mostly stateless request/response, you value the DX over pool control, and residency/cost are not
binding constraints — pair it with a serverless-friendly pooled Postgres.
