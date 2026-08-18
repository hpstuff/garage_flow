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
 *
 * The accepted shape mirrors {@link ScheduleConfigInput} (`src/lib/schedule.ts`) —
 * the flat, form-editable projection the settings form builds and
 * {@link configFromInput} turns into the persisted {@link ScheduleConfig}.
 */

/** Minutes since midnight for a local "HH:mm" time string (already regex-validated). */
function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const timeRegex = /^\d{2}:\d{2}$/;

/** A single day's hours: two local-time strings in "HH:mm" format, end after start. */
const timeRangeSchema = z
  .object({
    start: z.string().regex(timeRegex, "Форматът трябва да е ЧЧ:ММ."),
    end: z.string().regex(timeRegex, "Форматът трябва да е ЧЧ:ММ."),
  })
  .refine((value) => timeToMinutes(value.end) > timeToMinutes(value.start), {
    message: "Краят трябва да е след началото.",
  });

/**
 * One weekday row (GF-20): `open` plus nullable `HH:mm` hours. An open day must
 * carry a valid range; a closed day must not carry hours at all.
 */
const scheduleDayInputSchema = z
  .object({
    open: z.boolean(),
    start: z.string().regex(timeRegex, "Форматът трябва да е ЧЧ:ММ.").nullable(),
    end: z.string().regex(timeRegex, "Форматът трябва да е ЧЧ:ММ.").nullable(),
  })
  .refine((value) => !value.open || (value.start !== null && value.end !== null), {
    message: "Отвореният ден трябва да има начален и краен час.",
  })
  .refine((value) => value.open || (value.start === null && value.end === null), {
    message: "Затвореният ден не трябва да има часове.",
  })
  .refine(
    (value) =>
      !value.open ||
      value.start === null ||
      value.end === null ||
      timeToMinutes(value.end) > timeToMinutes(value.start),
    { message: "Краят трябва да е след началото." },
  );

/** A single date exception: `closed` flag plus nullable override hours. */
const exceptionInputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Форматът на датата трябва да е ГГГГ-ММ-ДД."),
    closed: z.boolean(),
    hours: timeRangeSchema.nullable(),
  })
  .refine((value) => !value.closed || value.hours === null, {
    message: "Затворените дни не трябва да имат часове.",
  })
  .refine((value) => value.closed || value.hours !== null, {
    message: "Отворените изключения трябва да имат часове.",
  });

/** The full schedule config input — every weekday explicit, exceptions a plain list. */
export const setScheduleConfigSchema = z
  .object({
    weekly: z
      .object({
        mon: scheduleDayInputSchema,
        tue: scheduleDayInputSchema,
        wed: scheduleDayInputSchema,
        thu: scheduleDayInputSchema,
        fri: scheduleDayInputSchema,
        sat: scheduleDayInputSchema,
        sun: scheduleDayInputSchema,
      })
      .strict(),
    exceptions: z.array(exceptionInputSchema).default([]),
  })
  .strict();
export type SetScheduleConfigInput = z.infer<typeof setScheduleConfigSchema>;
