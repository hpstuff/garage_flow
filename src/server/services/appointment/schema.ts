import { z } from "zod";

/**
 * Appointment input schemas (ADR-0016). Validation is authoritative in the
 * service, so every transport is protected — not just the web form. Scope-derived
 * fields (`accountId`, `locationId`) are never part of the input; they come from
 * the `Scope`, never the caller. `status` is likewise not caller input: a slot
 * opens `scheduled` and is only ever cancelled through its own path (GF-19).
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
 * link — a walk-in slot), anything else must be a valid uuid.
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

/**
 * A slot boundary: accepts a `Date` or a parseable date-time string (the form
 * sends a local `YYYY-MM-DDTHH:mm`), coercing to a `Date` and rejecting anything
 * that is not a real instant.
 */
const slotInstant = z.coerce.date({ error: "Невалиден час." });

/**
 * The bookable fields of an Appointment (GF-19). The time slot is required — a day
 * view and the overlap check need both ends; everything else is optional, because
 * a walk-in slot can have none (CONTEXT.md). `endsAt` must be strictly after
 * `startsAt`, so a slot always has positive duration.
 */
export const createAppointmentSchema = z
  .object({
    startsAt: slotInstant,
    endsAt: slotInstant,
    customerId: optionalId("Невалиден клиент."),
    vehicleId: optionalId("Изберете валиден автомобил."),
    mechanicId: optionalId("Изберете валиден механик."),
    bay: optionalText(120),
    customerName: optionalText(200),
    note: optionalText(2000),
  })
  .strict()
  .refine((value) => value.endsAt > value.startsAt, {
    error: "Краят трябва да е след началото.",
    path: ["endsAt"],
  });
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * One day of the agenda (GF-19), addressed by a calendar `date` in `YYYY-MM-DD`.
 * A plain day string (not a full instant) keeps the day boundary unambiguous — the
 * service turns it into the `[00:00, next 00:00)` range it queries.
 */
export const getDayAgendaSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Невалидна дата.")
      .optional(),
  })
  .strict()
  .partial();
export type GetDayAgendaInput = z.infer<typeof getDayAgendaSchema>;

export const cancelAppointmentSchema = z.object({ id: z.uuid() }).strict();
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const getAppointmentSchema = z.object({ id: z.uuid() }).strict();
export type GetAppointmentInput = z.infer<typeof getAppointmentSchema>;
