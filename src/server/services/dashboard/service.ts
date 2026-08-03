/**
 * Dashboard service — the reference service for every later slice (ADR-0015).
 *
 * Shape: `(scope, input) => Promise<plainData>`.
 *   1. validate `input` at the top (ADR-0016),
 *   2. work through ScopedDb (ADR-0013),
 *   3. return a plain, serializable object via explicit selects,
 *   4. throw typed domain errors — never transport-aware.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import { KANBAN_STAGES, type KanbanStage, TERMINAL_KANBAN_STAGE } from "../../db/schema";
import { ValidationError } from "../../domain/errors";
import { dashboardQuerySchema } from "./schema";

export interface DashboardData {
  location: { id: string; name: string };
  metrics: {
    activeRepairOrders: number;
    customers: number;
    vehicles: number;
  };
  /** Repair Order count per Kanban stage (GF-10), in the fixed stage order. */
  ordersByStage: { stage: KanbanStage; count: number }[];
}

export async function getDashboard(scope: Scope, input: unknown): Promise<DashboardData> {
  const parsed = dashboardQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid dashboard query", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  const [location, customers, vehicles, repairOrders] = await Promise.all([
    db.currentLocation(),
    db.listCustomers(null),
    db.listVehicles({ search: null, customerId: null }),
    db.listRepairOrders({ vehicleId: null }),
  ]);

  return {
    location,
    metrics: {
      activeRepairOrders: repairOrders.filter((order) => order.stage !== TERMINAL_KANBAN_STAGE)
        .length,
      customers: customers.length,
      vehicles: vehicles.length,
    },
    ordersByStage: KANBAN_STAGES.map((stage) => ({
      stage,
      count: repairOrders.filter((order) => order.stage === stage).length,
    })),
  };
}
