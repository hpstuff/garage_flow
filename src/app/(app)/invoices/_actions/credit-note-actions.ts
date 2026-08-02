"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  getCreditNote,
  getCreditNoteForInvoice,
  issueCreditNote,
  type ScopedCreditNote,
} from "@/server/services/credit-note/service";

/**
 * Credit Note Server Actions (GF-16). Each follows the reference shape (ADR-0005/0015):
 * authenticate → derive scope → call ONE service → adapt the result/errors. No
 * business logic lives here.
 *
 * Issuing a Credit Note is a pure append (ADR-0002): it never touches the corrected
 * Invoice, so it revalidates only the Invoice document (where the correction now
 * links) — not the frozen Invoice's data, which the service leaves untouched. A
 * `CONFLICT` result means the Invoice already has a Credit Note; the caller surfaces
 * that inline.
 */

/** A mutation result: the fresh Credit Note, or an error code + field errors. */
export type CreditNoteMutationResult =
  | { ok: true; data: ScopedCreditNote }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Issue a Credit Note against an already-issued Invoice (GF-16). */
export async function issueCreditNoteAction(input: unknown): Promise<CreditNoteMutationResult> {
  try {
    const scope = await requireScope();
    const note = await issueCreditNote(scope, input);
    revalidatePath(`/invoices/${note.invoiceId}`);
    return { ok: true, data: note };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
    }
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Read one issued Credit Note by id (GF-16). */
export async function getCreditNoteAction(id: string): Promise<ActionResult<ScopedCreditNote>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getCreditNote(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** The Credit Note correcting an Invoice, or `null` when it has not been credited. */
export async function getCreditNoteForInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<ScopedCreditNote | null>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getCreditNoteForInvoice(scope, { invoiceId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
