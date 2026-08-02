"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  getInvoicePayments,
  type PaymentSummary,
  recordPayment,
} from "@/server/services/payment/service";

/**
 * Payment Server Actions (GF-15). Each follows the reference shape (ADR-0005/0015):
 * authenticate → derive scope → call ONE service → adapt the result/errors. No
 * business logic lives here.
 *
 * Recording a Payment mutates: it derives and flips the Repair Order's
 * `payment_status` reference (ADR-0002), so it revalidates the Invoice document and
 * the RO surfaces where that status shows — never the frozen Invoice itself, which
 * the service leaves untouched.
 */

/** A mutation result: the fresh settlement summary, or an error code + field errors. */
export type PaymentMutationResult =
  | { ok: true; data: PaymentSummary }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Record one Payment against an Invoice (GF-15). */
export async function recordPaymentAction(input: unknown): Promise<PaymentMutationResult> {
  try {
    const scope = await requireScope();
    const summary = await recordPayment(scope, input);
    revalidatePath(`/invoices/${summary.invoiceId}`);
    revalidatePath(`/repair-orders/${summary.repairOrderId}`);
    revalidatePath("/repair-orders");
    revalidatePath("/repair-orders/board");
    return { ok: true, data: summary };
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

/** The Payments recorded against an Invoice and their settlement summary (GF-15). */
export async function getInvoicePaymentsAction(
  invoiceId: string,
): Promise<ActionResult<PaymentSummary>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getInvoicePayments(scope, { invoiceId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
