"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createLineItem,
  deleteLineItem,
  listLineItems,
  type ScopedLineItem,
  updateLineItem,
} from "@/server/services/line-item/service";

/**
 * Line Item Server Actions (GF-09). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here — the money math and validation are
 * the service's job.
 *
 * Line Items live on the Repair Order detail page, so every mutation revalidates
 * that path. Mutations carry `fieldErrors` so the inline form can surface Zod
 * messages; the generic `error` code covers the rest (auth, not-found, foreign
 * order/mechanic).
 */

/** A mutation result: the saved Line Item, or an error code + optional field errors. */
export type LineItemMutationResult =
  | { ok: true; data: ScopedLineItem }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): LineItemMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

export async function listLineItemsAction(
  repairOrderId: string,
): Promise<ActionResult<ScopedLineItem[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listLineItems(scope, { repairOrderId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createLineItemAction(input: unknown): Promise<LineItemMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createLineItem(scope, input);
    revalidatePath(`/repair-orders/${data.repairOrderId}`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function updateLineItemAction(input: unknown): Promise<LineItemMutationResult> {
  try {
    const scope = await requireScope();
    const data = await updateLineItem(scope, input);
    revalidatePath(`/repair-orders/${data.repairOrderId}`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

/**
 * Remove a Line Item. `repairOrderId` is passed only to revalidate the detail
 * page — the service deletes by scoped id alone.
 */
export async function deleteLineItemAction(
  id: string,
  repairOrderId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const scope = await requireScope();
    const data = await deleteLineItem(scope, { id });
    revalidatePath(`/repair-orders/${repairOrderId}`);
    return { ok: true, data };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
