"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createRepairOrder,
  getRepairOrder,
  listRepairOrders,
  type ScopedRepairOrder,
  updateRepairOrder,
} from "@/server/services/repair-order/service";

/**
 * Repair Order Server Actions (GF-08). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * Mutations carry `fieldErrors` so the form can surface Zod messages inline; the
 * generic `error` code covers the rest (auth, not-found, foreign vehicle/mechanic).
 */

/** A mutation result: the saved Repair Order, or an error code + optional field errors. */
export type RepairOrderMutationResult =
  | { ok: true; data: ScopedRepairOrder }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): RepairOrderMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

export async function listRepairOrdersAction(
  vehicleId?: string,
): Promise<ActionResult<ScopedRepairOrder[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listRepairOrders(scope, { vehicleId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function getRepairOrderAction(id: string): Promise<ActionResult<ScopedRepairOrder>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getRepairOrder(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createRepairOrderAction(input: unknown): Promise<RepairOrderMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createRepairOrder(scope, input);
    revalidatePath("/repair-orders");
    revalidatePath(`/vehicles/${data.vehicleId}`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function updateRepairOrderAction(input: unknown): Promise<RepairOrderMutationResult> {
  try {
    const scope = await requireScope();
    const data = await updateRepairOrder(scope, input);
    revalidatePath("/repair-orders");
    revalidatePath(`/repair-orders/${data.id}`);
    revalidatePath(`/repair-orders/${data.id}/edit`);
    revalidatePath(`/vehicles/${data.vehicleId}`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
