import { z } from "zod";

/**
 * Repair Order input schemas (ADR-0016). Validation is authoritative in the
 * service, so every transport is protected — not just the web form. Scope-derived
 * fields (`accountId`, `locationId`) are never part of the input; they come from
 * the `Scope`, never the caller.
 *
 * `invoiceStatus` and `paymentStatus` are deliberately **not** here: they are
 * reference-only fields set by the invoicing/payment slices (GF-14/GF-15,
 * ADR-0002), never through this create/edit path. `vehicleId` and the optional
 * lead `mechanicId` *are* caller input, but their existence within the scope is
 * enforced by ScopedDb, not here.
 */

/**
 * Optional free-text field: trims, caps length, and normalises an empty/blank
 * value to `null` so "cleared in the form" and "never set" are the same stored
 * state.
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
 * Optional reference to another entity by id: a blank/absent value is `null` (no
 * lead Mechanic), anything else must be a valid uuid.
 */
function optionalId(message: string) {
  return z
    .preprocess(
      (value) =>
        value === null || value === undefined || (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      z.uuid(message).optional(),
    )
    .transform((value) => value ?? null);
}

/** The editable fields shared by create and edit. */
const repairOrderFields = {
  vehicleId: z.uuid("Изберете автомобил."),
  mechanicId: optionalId("Изберете валиден механик."),
  complaint: optionalText(4000),
  diagnosis: optionalText(4000),
};

export const createRepairOrderSchema = z.object(repairOrderFields).strict();
export type CreateRepairOrderInput = z.infer<typeof createRepairOrderSchema>;

export const updateRepairOrderSchema = z.object({ id: z.uuid(), ...repairOrderFields }).strict();
export type UpdateRepairOrderInput = z.infer<typeof updateRepairOrderSchema>;

export const getRepairOrderSchema = z.object({ id: z.uuid() }).strict();

export const listRepairOrdersSchema = z.object({ vehicleId: z.uuid() }).strict().partial();
export type ListRepairOrdersInput = z.infer<typeof listRepairOrdersSchema>;
