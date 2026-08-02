import { z } from "zod";
import { PAYMENT_METHODS } from "../../db/schema";

/**
 * Payment input schemas (ADR-0016). Validation is authoritative in the service, so
 * every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) and the Payment's `currency` are never caller input:
 * the first two come from the `Scope`, and the currency is copied from the settled
 * Invoice by ScopedDb (ADR-0011), so a Payment can never disagree with its document.
 *
 * `amount` arrives from the form in **human units** (a major-unit sum, e.g. лв) and
 * is coerced here so any transport is covered; the service turns it into the exact
 * integer minor units the schema stores. It must be strictly positive — a Payment
 * of zero settles nothing, and refunds are a future reversing entry, not a negative
 * Payment.
 */

/**
 * Optional free-text note: trims, caps length, and normalises an empty/blank value
 * to `null` so "cleared in the form" and "never set" are the same stored state.
 */
function optionalNote(max: number) {
  return z
    .preprocess(
      (value) =>
        value === null || value === undefined || (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      z.string().trim().max(max, `Бележката може да е най-много ${max} знака.`).optional(),
    )
    .transform((value) => value ?? null);
}

/** Record one Payment against an Invoice (GF-15). */
export const recordPaymentSchema = z
  .object({
    invoiceId: z.uuid("Изберете фактура."),
    amount: z.coerce
      .number()
      .positive("Сумата трябва да е положителна.")
      .refine(Number.isFinite, "Сумата е невалидна."),
    /** How the money arrived; descriptive only. Defaults to cash, the walk-in case. */
    method: z.enum(PAYMENT_METHODS).default("cash"),
    note: optionalNote(500),
  })
  .strict();
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** Read an Invoice's Payments and their settlement summary. */
export const getInvoicePaymentsSchema = z.object({ invoiceId: z.uuid() }).strict();
export type GetInvoicePaymentsInput = z.infer<typeof getInvoicePaymentsSchema>;
