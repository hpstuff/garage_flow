# Application stack: Next.js App Router, TypeScript, npm, Biome

**Context.** ADR-0005 committed to a Next.js app with Server Actions over a transport-agnostic service layer, but left the concrete baseline — router model, language strictness, package manager, and lint/format tooling — unspecified. These need to be fixed once so every later slice builds on identical ground.

**Decision.**
- **Next.js (App Router) + Server Actions** as the web framework and mutation transport.
- **TypeScript in strict mode**, with `noUncheckedIndexedAccess`. Types are load-bearing — they enforce the scoping and service contracts (ADR-0013, ADR-0015), so strictness is not optional.
- **npm** as the package manager (single app, no monorepo — ADR-0015) with a committed lockfile; **Node pinned to the current LTS (24.x)** via `.nvmrc`, `engines`, and the Docker base image so dev/CI/prod match.
- **Biome** for both linting and formatting — one fast tool, replacing ESLint + Prettier. The ADR-0005 import boundary is enforced with a path-scoped `noRestrictedImports` rule (ADR-0015).

**Consequences.** Exact dependency versions are pinned by the lockfile produced when the walking skeleton (GF-01) is scaffolded — this ADR fixes the choices, not the digits. Biome's architectural-boundary linting is less expressive than `eslint-plugin-boundaries`; if the boundary rule outgrows `noRestrictedImports`, add ESLint solely for that check rather than abandoning Biome. Server Actions are the v1 transport; route handlers arrive later as thin adapters for the public API (ADR-0005, ADR-0015).
