# Roadmap & Parked Decisions

What the v1 domain model deliberately excludes, and the open questions each area carries. These were parked during the initial grilling session — none block v1. When one comes on deck, grill it into decisions (update `CONTEXT.md` and add ADRs), then move it out of this list.

For what *is* settled, see [`CONTEXT.md`](../CONTEXT.md) (glossary) and [`docs/adr/`](./adr/) (decisions 0001–0018). The v1 technical foundation (ADRs 0010–0018) is also distilled, project-agnostic, in [`architecture-blueprint.md`](./architecture-blueprint.md).

## v1 scope (settled — for reference)

Customer → Vehicle → Repair Order → Kanban → Invoice → Service History, on Account→Location multi-tenancy with auth and GDPR. Repair Order projects to a Work Card (narrative) and an Invoice (financial). Appointments exist as data with a basic agenda view. See ADRs 0001, 0003, 0007.

## Parked for Phase 2 (with open questions)

### AI suite — the stated differentiator (ADR-0008: retention hook, not acquisition)
- Provider choice and cost model per pricing tier.
- **AI Diagnosis Assistant**, **AI Repair Notes** (scribbles → customer summary), **AI Quote Generator** (drafts proposed Line Items).
- **AI Customer Chat** — "answer from the garage's own service records": how retrieval/RAG works over Repair Orders / Work Cards / Service History; per-Account data isolation.

### Inventory & Parts — touches the Line Item model, so get the seam right early
- How a `Part` Line Item relates to tracked stock (does invoicing a part decrement stock?).
- Parts catalog vs free-text parts; low-stock warnings.

### Suppliers & Purchase Orders
- Supplier records, price tracking/comparison, PO generation, link from low stock → PO.

### SMS / Viber reminders — ties to the Consent model (ADR-0004)
- Provider(s); template model; how sends check purpose-scoped Consent; "vehicle ready" / inspection-due / oil-change triggers; SMS-credit billing.

### Mobile app (Flutter) — reuses the service layer (ADR-0005)
- Scan VIN, photos, voice notes, mark work complete, upload video, check inventory. Links a Mechanic to a User (login).

### Owner Dashboard
- Precise metric definitions: revenue, avg repair value, top mechanics (from Labor lines), most common repairs, profit by service type, outstanding invoices. Needs a "service type" concept on Line Items.

### Full drag-and-drop Calendar (ADR-0007 deferred it)
- Rich scheduling UI, double-booking prevention, mechanic assignment by drag.

### Multi-branch (Premium) — enabled by ADR-0003
- Turn on multiple Locations per Account; cross-location (Account-level) reporting rollups; the Location concept surfaces in the UI.

### Cross-cutting, still fuzzy
- **Auth roles/permissions** granularity (owner / front-desk / manager / mechanic).
- **Photo/media storage** approach.
- **Signed/immutable Work Cards** — if disputes require it, that's a new decision (likely a snapshot), per ADR-0009.
- **Fiscalization / НАП** integration — out of MVP per ADR-0006; its own project if pursued.
- **Segment expansion** — tire / body / fleet were excluded (ADR-0001); revisit after v1 validation.

### Integrations (later, for stickiness)
- Bulgarian accounting software, parts-supplier stock/pricing, VIN decoding, technical-data providers, online booking widget (drops onto the existing Appointment model).
