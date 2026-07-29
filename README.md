# GarageFlow

The operating system for an independent general-repair garage. See
[`CONTEXT.md`](./CONTEXT.md) for the domain language and [`docs/adr/`](./docs/adr/)
for the architecture decisions (GF-00). This repository is the **walking
skeleton** (GF-01): the smallest end-to-end slice that proves the GF-00
decisions boot together.

## What runs today

An authenticated **User** lands on a **Location**-scoped dashboard, driven
through the reference vertical:

```
login → session → resolve Scope → Server Action → service → ScopedDb → Location
```

Everything else (Customers, Vehicles, Repair Orders, Invoices …) is built on
this exact pattern. See [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md).

## Stack

Next.js (App Router) · TypeScript (strict) · Drizzle + PostgreSQL · Better Auth
· Zod · Tailwind + shadcn/ui · next-intl (Bulgarian) · Biome · Vitest. Rationale
lives in ADRs 0010–0018.

## Prerequisites

- Node **24** (`.nvmrc`) — `nvm use`
- A PostgreSQL 17 database
- npm

## Getting started

```bash
nvm use
npm ci
cp .env.example .env.local        # then edit DATABASE_URL / BETTER_AUTH_SECRET

# Bring up a local Postgres (any Postgres works), e.g. Docker:
docker run -d --name gf-pg -e POSTGRES_USER=garageflow \
  -e POSTGRES_PASSWORD=garageflow -e POSTGRES_DB=garageflow \
  -p 5432:5432 postgres:17

npm run db:migrate                # apply migrations from a clean database
npm run db:seed                   # one Account + owner User + Location (demo login)
npm run dev                       # http://localhost:3000
```

The seed prints demo credentials (`owner@example.com` / `password12345`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome (format + lint + the ADR-0015 import boundary) |
| `npm run lint:boundaries` | Just the transport-free-core import boundary |
| `npm test` | Vitest (unit + integration; integration runs when `DATABASE_URL` is set) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations from a clean DB |
| `npm run db:seed` | Seed demo data |

## Testing

Service tests are the primary suite (ADR-0018). Integration tests run against a
real throwaway Postgres — set `DATABASE_URL` (CI provides one) and they execute;
otherwise they self-skip.

## Deployment

CI (`.github/workflows/ci.yml`) runs typecheck → lint → migrate → tests → build,
then builds the Docker image. CD is Kamal to a Hetzner VPS with a separate
managed Postgres — see [`config/deploy.yml`](./config/deploy.yml) (ADR-0012).
