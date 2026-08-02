"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import {
  getInvoice,
  getInvoiceForRepairOrder,
  issueInvoice,
  type ScopedInvoice,
} from "@/server/services/invoice/service";

/**
 * Invoice Server Actions (GF-14). Each follows the reference shape (ADR-0005/0015):
 * authenticate → derive scope → call ONE service → adapt the result/errors. No
 * business logic lives here.
 *
 * Issuing an Invoice mutates: it freezes the document and flips the Repair Order's
 * `invoice_status` reference (ADR-0002), so it revalidates the RO surfaces where
 * that status shows. A `CONFLICT` result means the order is already invoiced or has
 * no Line Items; the caller surfaces that inline.
 */

/** Issue an Invoice from a Repair Order's current Line Items (GF-14). */
export async function issueInvoiceAction(
  repairOrderId: string,
): Promise<ActionResult<ScopedInvoice>> {
  try {
    const scope = await requireScope();
    const invoice = await issueInvoice(scope, { repairOrderId });
    revalidatePath("/repair-orders");
    revalidatePath("/repair-orders/board");
    revalidatePath(`/repair-orders/${repairOrderId}`);
    return { ok: true, data: invoice };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Read one issued Invoice by id (GF-14). */
export async function getInvoiceAction(id: string): Promise<ActionResult<ScopedInvoice>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getInvoice(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** The Invoice issued from a Repair Order, or `null` when it is not yet invoiced. */
export async function getInvoiceForRepairOrderAction(
  repairOrderId: string,
): Promise<ActionResult<ScopedInvoice | null>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getInvoiceForRepairOrder(scope, { repairOrderId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
