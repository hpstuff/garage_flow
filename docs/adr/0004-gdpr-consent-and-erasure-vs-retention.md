# GDPR: purpose-scoped consent, and erasure by anonymization

**Context.** The product processes EU personal data (customers, vehicles) from day one. The vision modeled "GDPR consent" as a single boolean. Two legal realities complicate this: (1) consent under GDPR is purpose-specific and revocable, and (2) the right to erasure collides with Bulgarian law requiring immutable Invoices to be retained for the statutory period (~10 years).

**Decision.**
- **Lawful basis is split by purpose.** Processing needed to service the vehicle and issue invoices rests on *contract* and *legal obligation* — not consent, so it cannot be revoked away while retention applies. *Consent* is stored only for optional purposes (SMS/Viber/marketing reminders) as timestamped, purpose-scoped, revocable records.
- **Erasure anonymizes, it does not delete.** An erasure request pseudonymizes/strips PII from the Customer and unlinks it from Vehicles, but issued Invoices are retained for the statutory period carrying only the legally-required minimum data.

**Consequences.** No single "consent" flag; a Consent has a purpose, a timestamp, and a revocation. The Customer entity must support an anonymized state distinct from deletion. Invoices never cascade-delete with a Customer. This is more machinery than a checkbox and is required for EU operation.

**Addendum (erasure completeness, GF-21 audit).** Erasure must strip Customer PII everywhere it lives, not just on the Customer/Vehicle rows:

- **Appointment.** `appointment.customerId` is nulled alongside the Vehicle unlink, for the same reason: without it, a booking's resolved name keeps showing the anonymized placeholder forever instead of falling back to the free-text `customerName` (or nothing), which reads as a fabricated booking against a "real" Customer that no longer exists.
- **Consent.note.** This is unconstrained free text and can carry PII a staffer jotted down (a name, a phone number), so it is nulled on erasure. The Consent *rows* (purpose, `grantedAt`/`revokedAt`) are kept, not deleted — they are the record of what was authorised and when, which is retention of a compliance fact, not PII, and Consent is deliberately excluded from the Customer's cascade-delete path (Consent only cascades on a real Customer/Account teardown, never on anonymization).
