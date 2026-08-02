import { z } from "zod";
import { CONSENT_PURPOSES } from "../../db/schema";

/**
 * Consent input schemas (GF-20, ADR-0016). Validation is authoritative in the
 * service, so every transport is protected — not just the web form. Scope-derived
 * fields (`accountId`, `locationId`) are never part of the input; they come from
 * the `Scope`, never the caller. The timestamps are not caller input either:
 * `grantedAt` is stamped on grant and `revokedAt` only ever through the revoke
 * path (ADR-0004), never a free-form write.
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

/** The Consents a Customer holds, addressed by the Customer's id. */
export const listConsentsSchema = z.object({ customerId: z.uuid("Невалиден клиент.") }).strict();
export type ListConsentsInput = z.infer<typeof listConsentsSchema>;

/**
 * Granting a Consent (GF-20): a Customer, one optional `purpose` from the fixed
 * set (SMS/Viber/marketing — CONTEXT.md), and an optional internal note on how it
 * was captured. The timestamp and revocation are the service's to manage.
 */
export const grantConsentSchema = z
  .object({
    customerId: z.uuid("Невалиден клиент."),
    purpose: z.enum(CONSENT_PURPOSES),
    note: optionalText(2000),
  })
  .strict();
export type GrantConsentInput = z.infer<typeof grantConsentSchema>;

/** Revoking a Consent, addressed by its id. */
export const revokeConsentSchema = z.object({ id: z.uuid() }).strict();
export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;
