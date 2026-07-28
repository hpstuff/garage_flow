# Testing and CI/CD

**Context.** ADR-0005 makes services testable without a transport, and ADR-0002's gapless numbering is a concurrency property that a mocked database would hide. The pipeline must exercise the real race and gate on the architectural boundary (ADR-0015).

**Decision.**
- **Vitest** is the test runner; **service tests are the primary suite** (business logic, VAT math, anonymization, scoping).
- **Integration tests run against a real throwaway PostgreSQL** (Testcontainers, or an ephemeral Postgres service in CI) for the invoice-numbering + row-locking + constraint behaviour — the one place unit tests are insufficient, because the bug we defend against is a race.
- **Playwright** covers a small set of end-to-end smokes over the golden money-path (login → Repair Order → Line Items → issue Invoice), because ADR-0008's success metric *is* that flow. React component tests are kept thin.
- **CI: GitHub Actions** — typecheck → Biome → unit + integration (with a Postgres service) → build the Docker image, including the ADR-0015 import-boundary check.
- **CD: Kamal** deploys the built image to Hetzner (ADR-0012).

**Consequences.** Test weight sits where the logic lives. The invoice race is defended by a real database in CI rather than assumed away. E2E is deliberately narrow in v1 to protect the timeline; it widens as the product does. A failing boundary check blocks merges that would erode ADR-0005.
