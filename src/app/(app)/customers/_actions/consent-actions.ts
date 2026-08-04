"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  grantConsent,
  listConsents,
  revokeConsent,
  type ScopedConsent,
} from "@/server/services/consent/service";

/**
 * Consent Server Actions (GF-20, GF-63). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here — granting/revoking stays exactly
 * as tested at the service layer (ADR-0004); this is a thin adapter over it.
 */

/** A mutation result: the affected Consent, or an error code + optional field errors. */
export type ConsentMutationResult =
  | { ok: true; data: ScopedConsent }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): ConsentMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

/** Every Consent a Customer holds, newest decision first (GF-20). */
export async function listConsentsAction(
  customerId: string,
): Promise<ActionResult<ScopedConsent[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listConsents(scope, { customerId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/**
 * Grant a Consent for one optional purpose (GF-20, GF-63). Revalidates the
 * Customer's edit page so the section shows the fresh active-purpose state.
 */
export async function grantConsentAction(input: unknown): Promise<ConsentMutationResult> {
  try {
    const scope = await requireScope();
    const data = await grantConsent(scope, input);
    revalidatePath(`/customers/${data.customerId}/edit`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

/** Revoke a Consent (GF-20, GF-63). Revalidates the Customer's edit page. */
export async function revokeConsentAction(input: unknown): Promise<ConsentMutationResult> {
  try {
    const scope = await requireScope();
    const data = await revokeConsent(scope, input);
    revalidatePath(`/customers/${data.customerId}/edit`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
