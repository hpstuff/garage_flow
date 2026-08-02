import { z } from "zod";

/**
 * Credit Note input schemas (ADR-0016). Validation is authoritative in the service,
 * so every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`), the gapless `number`, the `issuedAt` freeze time, and
 * the whole frozen snapshot are derived by the service/DB from the credited Invoice
 * — never taken from input (ADR-0002).
 *
 * Issuing a Credit Note takes only the Invoice id (the document it corrects) and an
 * optional free-text `reason`: the MVP issues a **full** correction, so the amounts
 * and lines are copied from that Invoice's frozen snapshot, not supplied by the
 * caller.
 */

/**
 * Optional free-text reason: trims, caps length, and normalises an empty/blank value
 * to `null` so "cleared in the form" and "never set" are the same stored state.
 */
function optionalReason(max: number) {
  return z
    .preprocess(
      (value) =>
        value === null || value === undefined || (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      z.string().trim().max(max, `Причината може да е най-много ${max} знака.`).optional(),
    )
    .transform((value) => value ?? null);
}

/** Issue one Credit Note against an Invoice (GF-16). */
export const issueCreditNoteSchema = z
  .object({
    invoiceId: z.uuid("Изберете фактура."),
    reason: optionalReason(500),
  })
  .strict();
export type IssueCreditNoteInput = z.infer<typeof issueCreditNoteSchema>;

/** Read one issued Credit Note by its own id. */
export const getCreditNoteSchema = z.object({ id: z.uuid() }).strict();
export type GetCreditNoteInput = z.infer<typeof getCreditNoteSchema>;

/** Read the Credit Note that corrects a given Invoice (the ADR-0002 reference). */
export const getCreditNoteForInvoiceSchema = z.object({ invoiceId: z.uuid() }).strict();
export type GetCreditNoteForInvoiceInput = z.infer<typeof getCreditNoteForInvoiceSchema>;
