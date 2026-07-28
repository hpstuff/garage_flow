# Service-layer contract and repository structure

**Context.** ADR-0005 forbids business logic in Server Actions, route handlers, and React components, but did not specify the structure or the enforcement that makes "cannot" real rather than a convention that erodes under deadline pressure.

**Decision.** A **single Next.js application** with a lint-enforced internal boundary (a monorepo was judged unnecessary ceremony for v1; extracting a package later is cheap):

```
src/
  server/                 transport-free core — may NOT import next/*, react, or src/app/**
    db/                   drizzle schema, migrations, ScopedDb wrapper
    domain/               shared types, typed domain errors
    services/<aggregate>/ service.ts ((scope, input) => data), schema.ts (zod), *.test.ts
  app/                    Next.js routes, Server Actions (_actions/), components — thin adapters
  i18n/                   next-intl message catalogs
```

- Every service function is `(scope, input) => Promise<plainData>`: it validates `input` (ADR-0016), works through `ScopedDb`, and throws typed domain errors.
- **Server Actions are the only glue**: authenticate → derive `scope` → call one service → translate result/errors. Nothing else.
- **No separate repository layer in v1** — services use `ScopedDb`/Drizzle directly; a repository is introduced only where it earns its keep.

Enforcement: a **Biome path-scoped `noRestrictedImports`** rule on `src/server/**` forbids importing `next`, `react`, and the app alias, run in CI (ADR-0018); the type-level `scope` requirement (ADR-0013) makes un-scoped access a compile error.

**Consequences.** The core is transport-free by construction, so the Phase-2 public API and mobile backend become additional thin adapters over the same services — a packaging exercise, not a rewrite. Skipping a repository layer keeps the MVP lean. If the Biome boundary rule proves too blunt for a future need, ESLint is added solely for that rule (ADR-0010).
