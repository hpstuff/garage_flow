# VAT configurable per Location; fiscal-device (НАП) integration out of MVP

**Context.** Target-segment garages are a mix of VAT-registered and (below-threshold) non-registered businesses, so a single 20% VAT assumption is wrong for many. Separately, Bulgarian law requires cash payments to be receipted by a registered fiscal device (касов апарат) reporting to НАП; a software фактура is not a fiscal receipt, and device integration/certification is large, vendor-specific work.

**Decision.**
- **VAT is a per-Location setting:** registered (rate, default 20%) or not-registered (invoices carry no VAT). Invoices are proper фактури with gapless per-series numbering per Location.
- **Fiscalization is explicitly out of the MVP.** Cash is assumed to be rung through the shop's existing касов апарат. GarageFlow does not replace the fiscal device and must say so to customers.

**Consequences.** The Invoice/VAT model must handle a zero-VAT mode, not just a rate. Marketing and onboarding must disclose that fiscal/НАП obligations remain the shop's responsibility. Fiscal-device integration is a candidate for a later phase and would be its own ADR.
