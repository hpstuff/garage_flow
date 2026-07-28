# Validation and serialization at the service boundary

**Context.** Services take plain inputs and return plain data for every transport (ADR-0005). Where validation lives, what shapes cross the boundary, and how errors propagate all need to be fixed so the contract is uniform across web, mobile, and the future public API.

**Decision.**
- **Zod** (with **drizzle-zod** where it avoids drift) is the single schema library. **Validation is authoritative inside the service** — each operation parses its input at the top, so every caller is protected, not just the web form. Server Actions may reuse the same schema for form-field UX, but the service is the source of truth.
- Services return **plain, serializable objects via explicit column selects** — never raw rows that could leak sensitive columns (e.g. password hashes) or over-expose schema. DTOs are hand-mapped only where the DB shape and the public contract genuinely diverge.
- Services throw a **small set of typed domain errors** (`ValidationError`, `NotFoundError`, `ConflictError`, `PermissionError`); adapters translate — a Server Action to a form result, a future API to an HTTP status.

**Consequences.** One validation path secures all transports. Explicit selects double as the service's public contract and prevent accidental over-exposure. Typed errors keep services unaware of transport while giving each adapter enough to respond correctly. Mandatory DTO mapping everywhere was rejected as boilerplate a 3-month MVP does not need.
