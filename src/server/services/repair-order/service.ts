/**
 * Repair Order service (GF-08) — open, edit and list Repair Orders,
 * Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * A **Repair Order** is the central work record for one visit of one Vehicle
 * (CONTEXT.md): it captures the **Complaint** and the **Diagnosis** as distinct
 * fields (ADR-0009) and carries a single *optional* lead Mechanic. Its
 * `invoiceStatus`/`paymentStatus` are references set elsewhere (GF-14/GF-15,
 * ADR-0002), so they are not part of this create/edit path. There is no delete,
 * matching the other aggregates.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import { KANBAN_STAGES, type KanbanStage } from "../../db/schema";
import type { ScopedRepairOrder } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createRepairOrderSchema,
  getRepairOrderSchema,
  listRepairOrdersSchema,
  moveRepairOrderStageSchema,
  setHiddenStagesSchema,
  updateRepairOrderSchema,
} from "./schema";

export {
  INITIAL_KANBAN_STAGE,
  KANBAN_STAGES,
  type KanbanStage,
  TERMINAL_KANBAN_STAGE,
} from "../../db/schema";
export type { ScopedRepairOrder } from "../../db/scoped-db";

/** One column of the Kanban board (GF-10): a stage, whether it is hidden, its orders. */
export interface KanbanColumn {
  stage: KanbanStage;
  /** True when the Location has hidden this stage — the board omits it from view. */
  hidden: boolean;
  orders: ScopedRepairOrder[];
}

/**
 * The Kanban board (GF-10): every one of the six fixed stages, **in order**, each
 * with the Repair Orders currently in it. `hidden` marks the stages the Location
 * has chosen not to use, so the UI can drop those columns yet still offer them in
 * the show/hide control. `hiddenStages` is the same set as a flat list.
 */
export interface KanbanBoard {
  columns: KanbanColumn[];
  hiddenStages: KanbanStage[];
}

export async function listRepairOrders(scope: Scope, input: unknown): Promise<ScopedRepairOrder[]> {
  const parsed = listRepairOrdersSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid repair order query",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  return scoped(scope).listRepairOrders({ vehicleId: parsed.data.vehicleId ?? null });
}

export async function getRepairOrder(scope: Scope, input: unknown): Promise<ScopedRepairOrder> {
  const parsed = getRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getRepairOrder(parsed.data.id);
}

export async function createRepairOrder(scope: Scope, input: unknown): Promise<ScopedRepairOrder> {
  const parsed = createRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order", z.flattenError(parsed.error).fieldErrors);
  }

  // `appointmentId` is a create-only link (GF-19) — passed separately so the
  // shared write values (and the edit path) never carry it.
  const { appointmentId, ...values } = parsed.data;
  return scoped(scope).createRepairOrder(values, appointmentId);
}

export async function updateRepairOrder(scope: Scope, input: unknown): Promise<ScopedRepairOrder> {
  const parsed = updateRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateRepairOrder(id, values);
}

/**
 * Move a Repair Order between Kanban Stages (GF-10). Validates the target is one
 * of the six fixed stages; the terminal rule (`delivered` cannot move on) and
 * scope membership are enforced by ScopedDb.
 */
export async function moveRepairOrderStage(
  scope: Scope,
  input: unknown,
): Promise<ScopedRepairOrder> {
  const parsed = moveRepairOrderStageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid stage move", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).moveRepairOrderStage(parsed.data.id, parsed.data.stage);
}

/**
 * The Kanban board for the current Location (GF-10): all six stages in fixed
 * order, each carrying its Repair Orders, with the Location's hidden stages
 * flagged. Orders are grouped in-memory from a single scoped list, so the board
 * is one round-trip plus the hidden-stage read.
 */
export async function getKanbanBoard(scope: Scope): Promise<KanbanBoard> {
  const db = scoped(scope);
  const [orders, hiddenStages] = await Promise.all([
    db.listRepairOrders({ vehicleId: null }),
    db.getHiddenStages(),
  ]);

  const hidden = new Set(hiddenStages);
  const columns: KanbanColumn[] = KANBAN_STAGES.map((stage) => ({
    stage,
    hidden: hidden.has(stage),
    orders: orders.filter((order) => order.stage === stage),
  }));

  return { columns, hiddenStages };
}

/**
 * Replace the current Location's hidden Kanban Stages (GF-10). A Location can only
 * hide stages it doesn't use — never add or reorder — so this overwrites the set
 * with the validated, de-duplicated input and returns what was stored.
 */
export async function setHiddenStages(scope: Scope, input: unknown): Promise<KanbanStage[]> {
  const parsed = setHiddenStagesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid hidden stages", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).setHiddenStages(parsed.data.stages);
}
