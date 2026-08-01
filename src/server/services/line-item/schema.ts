import { z } from "zod";
import { LINE_ITEM_TYPES } from "../../db/schema";

/**
 * Line Item input schemas (ADR-0016). Validation is authoritative in the service,
 * so every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) and the derived `amount` are never caller input;
 * `currency` is a database default (BGN in the MVP, ADR-0011).
 *
 * Numbers arrive from the form in **human units** — hours/count for `quantity`, a
 * major-unit price for `unitPrice`, a percentage for `vatRate` — and are coerced
 * here so any transport is covered. The service turns them into the exact integer
 * encodings the schema stores (thousandths / minor units / basis points).
 */

/**
 * Optional reference to another entity by id: a blank/absent value is `null` (no
 * attributed Mechanic — a Part line), anything else must be a valid uuid.
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
const lineItemFields = {
  repairOrderId: z.uuid("Изберете поръчка."),
  type: z.enum(LINE_ITEM_TYPES),
  mechanicId: optionalId("Изберете валиден механик."),
  description: z
    .string()
    .trim()
    .min(1, "Описанието е задължително.")
    .max(500, "Описанието може да е най-много 500 знака."),
  quantity: z.coerce
    .number()
    .positive("Количеството трябва да е положително.")
    .refine(Number.isFinite, "Количеството е невалидно."),
  unitPrice: z.coerce
    .number()
    .min(0, "Цената не може да е отрицателна.")
    .refine(Number.isFinite, "Цената е невалидна."),
  vatRate: z.coerce
    .number()
    .min(0, "ДДС ставката не може да е отрицателна.")
    .max(100, "ДДС ставката не може да е над 100%.")
    .refine(Number.isFinite, "ДДС ставката е невалидна."),
};

/**
 * A Labor line must name the Mechanic who performed it — that attribution is the
 * whole point of GF-09 (ADR-0009). A Part line carries no Mechanic; the service
 * clears any stray value rather than rejecting it.
 */
function laborNeedsMechanic(
  value: { type: (typeof LINE_ITEM_TYPES)[number]; mechanicId: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.type === "labor" && value.mechanicId === null) {
    ctx.addIssue({
      code: "custom",
      path: ["mechanicId"],
      message: "Изберете механик за труда.",
    });
  }
}

export const createLineItemSchema = z
  .object(lineItemFields)
  .strict()
  .superRefine(laborNeedsMechanic);
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;

export const updateLineItemSchema = z
  .object({ id: z.uuid(), ...lineItemFields })
  .strict()
  .superRefine(laborNeedsMechanic);
export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;

export const listLineItemsSchema = z.object({ repairOrderId: z.uuid() }).strict();

export const deleteLineItemSchema = z.object({ id: z.uuid() }).strict();
