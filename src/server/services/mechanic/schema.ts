import { z } from "zod";

/**
 * Mechanic input schemas (ADR-0016). Validation is authoritative in the service,
 * so every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) are never part of the input; they come from the
 * `Scope`, never the caller. `userId` (the Phase-2 login link) is likewise not
 * caller input in the MVP — a Mechanic is created as a bare name.
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
 * Optional number field that accepts human-unit input (BGN) and coerces it to
 * integer minor units (*100). Blank / absent → `null` so the DB default applies.
 */
function optionalMinorUnit(message: string) {
  return z.preprocess(
    (value) => {
      if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return undefined;
      }
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    },
    z.number().min(0, message).optional(),
  ).transform((v) => (v ?? 0) * 100);
}

/** The editable fields shared by create and edit. A Mechanic is, at minimum, a name. */
const mechanicFields = {
  name: z
    .string()
    .trim()
    .min(1, "Името е задължително.")
    .max(200, "Името може да е най-много 200 знака."),
  note: optionalText(2000),
  hourlyRate: optionalMinorUnit("Ставката не може да е отрицателна."),
};

export const createMechanicSchema = z.object(mechanicFields).strict();
export type CreateMechanicInput = z.infer<typeof createMechanicSchema>;

export const updateMechanicSchema = z.object({ id: z.uuid(), ...mechanicFields }).strict();
export type UpdateMechanicInput = z.infer<typeof updateMechanicSchema>;

export const getMechanicSchema = z.object({ id: z.uuid() }).strict();

export const listMechanicsSchema = z
  .object({ search: optionalText(200) })
  .strict()
  .partial();
export type ListMechanicsInput = z.infer<typeof listMechanicsSchema>;
