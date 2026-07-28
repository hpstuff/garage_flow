# Work Card and Invoice are two projections of one Repair Order

**Context.** A garage needs two documents from a visit: a **Work Card** (работна карта) telling the customer the story — their complaint, the mechanic's diagnosis, and what was done, by whom, for how long, with which parts — and an **Invoice**, the legal request for payment. Their content overlaps (the line items) but their audiences and rules differ: the Invoice is a frozen legal фактура, while the internal diagnosis narrative should not appear on it.

**Decision.** Both are **projections of the same Repair Order**, not independent aggregates.
- The **Work Card** is a live rendered document generated on demand from the current RO (complaint, diagnosis, labor-by-mechanic-with-time, parts, photos). It is not stored or frozen. Customer signature/handover snapshotting is deferred.
- The **Invoice** is the financial subset, frozen at issue (per ADR-0002).
- To make "by whom, for how long" real, a **Labor Line Item attributes to a Mechanic and carries hours**; the RO's single assigned Mechanic is only an optional lead.

**Consequences.** One source of truth (the RO) feeds both documents — do not model the Work Card as its own editable entity or duplicate line data. Mechanic-level reporting ("top mechanics", profit by mechanic) reads from Labor lines, not the RO's lead field. If signed/immutable work cards are needed later, that is a new decision (and likely a snapshot), not a reshaping of this one.
