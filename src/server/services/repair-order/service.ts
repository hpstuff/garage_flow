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
import type { ScopedRepairOrder } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createRepairOrderSchema,
  getRepairOrderSchema,
  listRepairOrdersSchema,
  updateRepairOrderSchema,
} from "./schema";

export type { ScopedRepairOrder } from "../../db/scoped-db";

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

  return scoped(scope).createRepairOrder(parsed.data);
}

export async function updateRepairOrder(scope: Scope, input: unknown): Promise<ScopedRepairOrder> {
  const parsed = updateRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateRepairOrder(id, values);
}
