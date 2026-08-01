"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createRepairOrder,
  getKanbanBoard,
  getRepairOrder,
  type KanbanBoard,
  type KanbanStage,
  listRepairOrders,
  moveRepairOrderStage,
  type ScopedRepairOrder,
  setHiddenStages,
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

/**
 * Move a Repair Order between Kanban Stages (GF-10). A `CONFLICT` result means the
 * order is `delivered` (terminal) and cannot move on; the board surfaces that as a
 * plain error. Revalidates the board and the order's other surfaces.
 */
export async function moveRepairOrderStageAction(
  id: string,
  stage: KanbanStage,
): Promise<RepairOrderMutationResult> {
  try {
    const scope = await requireScope();
    const data = await moveRepairOrderStage(scope, { id, stage });
    revalidatePath("/repair-orders/board");
    revalidatePath("/repair-orders");
    revalidatePath(`/repair-orders/${data.id}`);
    revalidatePath(`/vehicles/${data.vehicleId}`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

/** Load the Kanban board for the current Location (GF-10). */
export async function getKanbanBoardAction(): Promise<ActionResult<KanbanBoard>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getKanbanBoard(scope) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Replace the Location's hidden Kanban Stages (GF-10) and refresh the board. */
export async function setHiddenStagesAction(
  stages: KanbanStage[],
): Promise<ActionResult<KanbanStage[]>> {
  try {
    const scope = await requireScope();
    const data = await setHiddenStages(scope, { stages });
    revalidatePath("/repair-orders/board");
    return { ok: true, data };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
