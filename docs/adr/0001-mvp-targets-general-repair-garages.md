# MVP targets independent general-repair garages

**Context.** The GarageFlow vision names seven customer segments (general repair, tire, detailing, auto-electric, body, motorcycle, fleet) whose workflows diverge sharply: body shops are insurance-estimate driven, fleets are B2B contract/PO driven with consolidated billing, tire shops are seasonal high-volume with storage tracking. Building for all seven in a 3-month MVP means building several different products.

**Decision.** The MVP optimizes for **independent general-repair garages (1–10 mechanics)**. The Complaint → Diagnosis → Work → Parts/Labor → Invoice model maps to them natively, and motorcycle repair and auto-electric shops are close variants of the same workflow. Tire, body, and fleet are explicitly deferred; we will not distort the core model to fit them yet.

**Consequences.** Segment-specific concepts (insurance estimates/supplements, tire storage, fleet contract billing) are out of scope for the MVP and are not allowed to shape the core aggregates. Revisit once the core is validated with real garages.
