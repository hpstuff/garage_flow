# PostgreSQL with Drizzle ORM

**Context.** The domain is deeply relational and carries the hardest constraint in the product: gapless, sequential Invoice numbers per series (ADR-0002), which under concurrency requires real transactional locking. The ORM must expose that level of control without fighting it, and must make Location scoping (ADR-0003) expressible.

**Decision.** **PostgreSQL** is the database. **Drizzle** is the ORM and **drizzle-kit** owns migrations.
- Gapless numbering uses an explicit transaction that locks a per-`(location, series)` counter row (`SELECT … FOR UPDATE`) — legible and direct in Drizzle, unlike ORMs that hide raw SQL behind a query engine.
- Relational integrity (foreign keys, and the "Invoices never cascade-delete with a Customer" rule from ADR-0004) is enforced at the schema level.
- Money is stored as integer minor units (or `numeric`) with an explicit currency — never floats (ADR-0017).

**Consequences.** We write more explicit, SQL-shaped code and get fewer guardrails than a heavier ORM; that explicitness is a deliberate fit for the invoice-locking path and for later reporting (the Owner Dashboard). Drizzle's migration tooling is younger than some alternatives, so migrations are reviewed like code. The database must be a managed, backed-up instance because it holds legally-retained invoices (ADR-0012).
