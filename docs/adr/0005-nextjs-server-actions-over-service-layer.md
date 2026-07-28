# Next.js + Server Actions over a transport-agnostic service layer

**Context.** The MVP is a web app that must ship in ~3 months, but the roadmap includes a Phase-2 Flutter mobile app for mechanics and a Premium public API. A pure server-rendered monolith would force an API retrofit later; a fully separate API service would slow the MVP.

**Decision.** Build a single **Next.js** application. The web UI drives mutations and queries through **Server Actions**. All domain and business logic lives in a **repository/service layer** that is transport-agnostic — Server Actions are thin wrappers that call it and do nothing else. When the mobile app and public API arrive, they are additional thin adapters (e.g. route handlers) over the *same* services.

**Consequences.** The hard rule: **no business logic in Server Actions, route handlers, or React components** — they orchestrate and adapt only. Services take plain inputs and return plain data, unaware of HTTP/Server-Action context, auth transport, or serialization. This keeps the public API a packaging exercise rather than a project, and keeps the domain testable without a transport. Violating the boundary reintroduces exactly the monolith coupling this decision avoids.
