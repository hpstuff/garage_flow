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

/**
 * Schedule config input schemas (GF-20). Validation is authoritative in the
 * service, so every transport is protected — not just the web form.
 */

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** A single day's hours: two local-time strings in "HH:mm" format. */
const timeRangeSchema = z
  .object({
    start: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Форматът трябва да е ЧЧ:ММ.")
      .transform((v) => v as `${string}:${string}`),
    end: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Форматът трябва да е ЧЧ:ММ.")
      .transform((v) => v as `${string}:${string}`),
  })
  .refine(
    (value) => {
      const partsStart = value.start.split(":").map(Number);
      const partsEnd = value.end.split(":").map(Number);
      const sh = partsStart[0]!;
      const sm = partsStart[1]!;
      const eh = partsEnd[0]!;
      const em = partsEnd[1]!;
      return eh * 60 + em > sh * 60 + sm; // end must be after start
    },
    { message: "Краят трябва да е след началото." },
  );

/** A single date exception. */
const dateExceptionSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Форматът на датата трябва да е ГГГГ-ММ-ДД.")
      .transform((v) => v as `${string}-${string}-${string}`),
    closed: z.boolean(),
    hours: timeRangeSchema.optional(),
  })
  .refine((value) => !value.closed || value.hours === undefined, {
    message: "Затворените дни не трябва да имат часове.",
  });

/** The full schedule config input. */
export const setScheduleConfigSchema = z
  .object({
    weekly: z.record(z.enum(DAY_KEYS), timeRangeSchema.nullable()),
    exceptions: z.array(dateExceptionSchema).optional().default([]),
  })
  .strict();
export type SetScheduleConfigInput = z.infer<typeof setScheduleConfigSchema>;
