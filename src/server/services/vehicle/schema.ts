import { z } from "zod";
import { VEHICLE_KINDS } from "../../db/schema";

/**
 * Vehicle input schemas (ADR-0016). Validation is authoritative in the service,
 * so every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) are never part of the input; they come from the
 * `Scope`, never the caller. `customerId` (the current owner) *is* caller input,
 * but its existence within the scope is enforced by ScopedDb, not here.
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

/** Like `optionalText`, but upper-cases the value — plate and VIN are canonical uppercase. */
function optionalUpper(max: number) {
  return optionalText(max).transform((value) => (value ? value.toUpperCase() : value));
}

/** Model/manufacture year — an optional integer within a sane range, else `null`. */
const optionalYear = z
  .preprocess(
    (value) =>
      value === null || value === undefined || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.coerce
      .number("Годината трябва да е число.")
      .int("Годината трябва да е цяло число.")
      .min(1900, "Годината трябва да е след 1900.")
      .max(new Date().getFullYear() + 1, "Годината не може да е в бъдещето.")
      .optional(),
  )
  .transform((value) => value ?? null);

/** The editable fields shared by create and edit. */
const vehicleFields = {
  kind: z.enum(VEHICLE_KINDS),
  customerId: z.uuid("Изберете собственик."),
  plate: optionalUpper(20),
  vin: optionalUpper(30),
  make: optionalText(80),
  model: optionalText(80),
  year: optionalYear,
  color: optionalText(40),
  note: optionalText(2000),
};

/** A Vehicle is identified primarily by plate + VIN — require at least one. */
function requireIdentifier<T extends z.ZodObject>(schema: T) {
  return schema.refine((value) => Boolean(value.plate || value.vin), {
    message: "Въведете регистрационен номер или VIN.",
    path: ["plate"],
  });
}

export const createVehicleSchema = requireIdentifier(z.object(vehicleFields).strict());
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = requireIdentifier(
  z.object({ id: z.uuid(), ...vehicleFields }).strict(),
);
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const getVehicleSchema = z.object({ id: z.uuid() }).strict();

export const listVehiclesSchema = z
  .object({ search: optionalText(200), customerId: z.uuid() })
  .strict()
  .partial();
export type ListVehiclesInput = z.infer<typeof listVehiclesSchema>;
