# Invoices are immutable, separately-numbered legal documents

**Context.** Bulgarian VAT law requires invoices to carry a gapless sequential number and to be immutable once issued. The vision modeled "invoice status" and "payment status" as fields on the Repair Order, which would tempt an implementation where editing the order silently rewrites an already-issued invoice.

**Decision.** An **Invoice** is a first-class entity generated from a Repair Order's Line Items and **frozen at issue time** — it snapshots the lines, amounts, and VAT and never changes afterward. Corrections are made by issuing a separate **Credit Note** / corrective invoice, not by editing. The Repair Order retains `invoice_status` and `payment_status` as references; Payments are recorded against the Invoice, supporting partial payment.

**Consequences.** Editing a Repair Order after invoicing does not alter the issued Invoice. The schema needs an append-only, sequentially-numbered Invoice table (per legal series) plus Credit Notes. This is deliberately more machinery than status flags, and is required — do not "simplify" it back into RO fields.
