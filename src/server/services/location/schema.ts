import { z } from "zod";
import { VAT_MODES } from "../../db/schema";

/**
 * Location settings input schemas (ADR-0016). Validation is authoritative in the
 * service, so every transport is protected — not just the web form. Scope-derived
 * fields (`accountId`, `locationId`) are never caller input; they come from the
 * `Scope`.
 *
 * The VAT `rate` arrives in **human units** — a percentage (20 for 20%) — and is
 * coerced here; the service turns it into the basis-points encoding the schema
 * stores. `rate`/`vatNumber` only carry meaning when the mode is `registered`.
 */

/**
 * Optional free-text field: trims, caps length, and normalises an empty/blank
 * value to `null` so "cleared in the form" and "never set" are the same state.
 */
function optionalText(max: number) {
  return z
    .preprocess(
      (value) =>
        value === null || value === undefined || (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      z.string().trim().max(max, `Полето може да е най-много ${max} знака.`).optional(),
    )
    .transform((value) => value ?? null);
}

/**
 * Update a Location's VAT settings (GF-12, ADR-0006). `rate` is a percentage and
 * optional — it defaults in the service when a `registered` Location omits it, and
 * is irrelevant for a `not_registered` one.
 */
export const setVatConfigSchema = z
  .object({
    mode: z.enum(VAT_MODES),
    rate: z.coerce
      .number()
      .min(0, "ДДС ставката не може да е отрицателна.")
      .max(100, "ДДС ставката не може да е над 100%.")
      .refine(Number.isFinite, "ДДС ставката е невалидна.")
      .optional(),
    vatNumber: optionalText(32),
  })
  .strict();
export type SetVatConfigInput = z.infer<typeof setVatConfigSchema>;
