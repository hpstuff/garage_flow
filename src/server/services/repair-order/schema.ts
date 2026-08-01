import { z } from "zod";
import { KANBAN_STAGES } from "../../db/schema";

/**
 * Repair Order input schemas (ADR-0016). Validation is authoritative in the
 * service, so every transport is protected — not just the web form. Scope-derived
 * fields (`accountId`, `locationId`) are never part of the input; they come from
 * the `Scope`, never the caller.
 *
 * `invoiceStatus`, `paymentStatus` and `stage` are deliberately **not** in the
 * create/edit fields: the first two are reference-only (GF-14/GF-15, ADR-0002),
 * and `stage` moves only through its own guarded path (GF-10). `vehicleId` and the
 * optional lead `mechanicId` *are* caller input, but their existence within the
 * scope is enforced by ScopedDb, not here.
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

/**
 * Move a Repair Order to another Kanban Stage (GF-10). `stage` must be one of the
 * six fixed stages; the terminal rule (`delivered` cannot move on) is enforced by
 * the service against current state, not expressible here.
 */
export const moveRepairOrderStageSchema = z
  .object({ id: z.uuid(), stage: z.enum(KANBAN_STAGES) })
  .strict();
export type MoveRepairOrderStageInput = z.infer<typeof moveRepairOrderStageSchema>;

/**
 * Replace a Location's hidden Kanban Stages (GF-10). Every entry must be a valid
 * stage; duplicates are collapsed so the stored set is clean. An empty array shows
 * every stage. The stages themselves are fixed — this only ever hides a subset.
 */
export const setHiddenStagesSchema = z
  .object({
    stages: z.array(z.enum(KANBAN_STAGES)).transform((stages) => [...new Set(stages)]),
  })
  .strict();
export type SetHiddenStagesInput = z.infer<typeof setHiddenStagesSchema>;
