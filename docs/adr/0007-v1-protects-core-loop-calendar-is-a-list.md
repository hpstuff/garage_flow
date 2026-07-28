# v1 protects the Repair-Order→Invoice loop; Calendar ships as a list first

**Context.** The vision's 3-month MVP stacks multi-tenant auth, Customers, Vehicles, Repair Orders + Kanban, a full drag-and-drop Calendar with double-booking prevention, BG-compliant invoicing, GDPR, and Service History. The drag-drop calendar and the compliant invoicing are each substantial; attempting all of it risks shipping everything half-done.

**Decision.** v1 makes the core loop — Customer → Vehicle → Repair Order → Kanban → Invoice → Service History, on multi-tenant auth with GDPR — rock solid. Appointments exist as data with a **basic day/agenda view** (assign a Mechanic, warn on obvious conflicts). **Full drag-and-drop scheduling is a fast-follow, not v1.**

**Consequences.** The Appointment entity and its Repair-Order link are built in v1 (no migration later), but the rich calendar UI is deferred. Roadmap/marketing should not promise drag-and-drop scheduling in the first release. If a customer's #1 need is scheduling, they are not the v1 design target.
