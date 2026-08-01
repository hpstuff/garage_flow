import { z } from "zod";
import { CUSTOMER_KINDS } from "../../db/schema";

/**
 * Customer input schemas (ADR-0016). Validation is authoritative in the service,
 * so every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) are never part of the input; they come from the
 * `Scope`, never the caller.
 */

/**
 * Optional free-text field: trims, caps length, and normalises an empty/blank
 * value to `null` so "cleared in the form" and "never set" are the same stored
 * state. Optionally enforces an email shape, but only on a non-empty value.
 */
function optionalText(max: number, opts: { email?: boolean } = {}) {
  let base = z.string().trim().max(max, `Полето може да е най-много ${max} знака.`);
  if (opts.email) {
    base = base.pipe(z.email("Невалиден имейл адрес."));
  }
  return z.preprocess(
    (value) =>
      value === null || value === undefined || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    base.optional(),
  ).transform((value) => value ?? null);
}

/** The editable fields shared by create and edit. */
const customerFields = {
  kind: z.enum(CUSTOMER_KINDS),
  name: z
    .string()
    .trim()
    .min(1, "Името е задължително.")
    .max(200, "Името може да е най-много 200 знака."),
  email: optionalText(200, { email: true }),
  phone: optionalText(50),
  address: optionalText(500),
  taxId: optionalText(50),
  note: optionalText(2000),
};

export const createCustomerSchema = z.object(customerFields).strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({ id: z.uuid(), ...customerFields }).strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const getCustomerSchema = z.object({ id: z.uuid() }).strict();

export const listCustomersSchema = z
  .object({ search: optionalText(200) })
  .strict()
  .partial();
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;
