/**
 * Consent service (GF-20, ADR-0004) — grant, revoke and list purpose-scoped
 * Consents, Location-scoped.
 *
 * ADR-0004 is the load-bearing rule: a Consent is a *timestamped, revocable
 * record for one optional purpose* (SMS/Viber/marketing), never a single flag,
 * and **never** the basis for servicing or invoicing — those rest on contract and
 * legal obligation. Nothing here is ever consulted to open a Repair Order or issue
 * an Invoice, and the servicing/invoicing services never import this module.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The one piece of domain logic —
 * collapsing a Customer's Consent history into "which purposes stand right now" —
 * lives in a pure, DB-free function ({@link activePurposes}) so it is unit-tested
 * directly, like the agenda and Work Card projections.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import { CONSENT_PURPOSES, type ConsentPurpose } from "../../db/schema";
import type { ScopedConsent } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import { grantConsentSchema, listConsentsSchema, revokeConsentSchema } from "./schema";

export type { ConsentPurpose } from "../../db/schema";
export type { ScopedConsent } from "../../db/scoped-db";

/** A Consent stands (is currently in force) exactly when it has not been revoked (ADR-0004). */
export function isActive(consent: ScopedConsent): boolean {
  return consent.revokedAt === null;
}

/**
 * The set of purposes a Customer **currently** consents to (GF-20) — the domain
 * read the messaging layer (SMS/Viber/marketing reminders) will gate on. Pure and
 * DB-free: given the full Consent history, it keeps the purposes with at least one
 * standing (un-revoked) record and drops the rest, so a granted-then-revoked
 * purpose is correctly *absent*. Returned in {@link CONSENT_PURPOSES} order for a
 * stable, deterministic result regardless of record order.
 */
export function activePurposes(consents: ScopedConsent[]): ConsentPurpose[] {
  const active = new Set(consents.filter(isActive).map((consent) => consent.purpose));
  return CONSENT_PURPOSES.filter((purpose) => active.has(purpose));
}

/**
 * List every Consent a Customer holds (GF-20), newest decision first — the full
 * history, including revoked records. Scoped: a Customer outside the caller's
 * Location 404s, never a cross-tenant read. Derive "currently consented to X" with
 * {@link activePurposes}.
 */
export async function listConsents(scope: Scope, input: unknown): Promise<ScopedConsent[]> {
  const parsed = listConsentsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid consent query", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).listConsents(parsed.data.customerId);
}

/**
 * Grant a Consent for one optional purpose (GF-20, ADR-0004). ScopedDb asserts the
 * Customer is in scope and keeps the grant idempotent per active purpose (a
 * standing Consent is returned rather than duplicated). Granting the same purpose
 * again *after* a revocation makes a fresh record, preserving the decision history.
 */
export async function grantConsent(scope: Scope, input: unknown): Promise<ScopedConsent> {
  const parsed = grantConsentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid consent", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).grantConsent(parsed.data);
}

/**
 * Revoke a Consent (GF-20) — stamps its withdrawal instant (ADR-0004). Scoped, so
 * a Consent outside the caller's Location 404s. Idempotent: revoking an
 * already-revoked Consent returns it unchanged, its original `revokedAt` intact.
 */
export async function revokeConsent(scope: Scope, input: unknown): Promise<ScopedConsent> {
  const parsed = revokeConsentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid consent id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).revokeConsent(parsed.data.id);
}

/** Re-exported so callers can enumerate the purposes without reaching into the schema module. */
export const CONSENT_PURPOSE_VALUES: readonly ConsentPurpose[] = CONSENT_PURPOSES;
