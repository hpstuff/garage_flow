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
import { scoped, type Scope } from "../../db";
import { ValidationError } from "../../domain/errors";
import { dashboardQuerySchema } from "./schema";

export interface DashboardData {
  location: { id: string; name: string };
  /**
   * The current operational snapshot. Empty in the walking skeleton — there are
   * no operational tables yet. Later slices compute these from scoped Repair
   * Order / Customer / Vehicle queries.
   */
  metrics: {
    activeRepairOrders: number;
    customers: number;
    vehicles: number;
  };
}

export async function getDashboard(scope: Scope, input: unknown): Promise<DashboardData> {
  const parsed = dashboardQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid dashboard query", z.flattenError(parsed.error).fieldErrors);
  }

  const location = await scoped(scope).currentLocation();

  return {
    location,
    metrics: {
      activeRepairOrders: 0,
      customers: 0,
      vehicles: 0,
    },
  };
}
