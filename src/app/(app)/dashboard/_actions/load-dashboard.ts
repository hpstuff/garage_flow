"use server";

import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { type DashboardData, getDashboard } from "@/server/services/dashboard/service";
import { isKanbanEnabled } from "@/server/services/location/service";

/**
 * The reference Server Action (ADR-0005/0015): authenticate → derive scope →
 * call ONE service → adapt the result/errors. It contains no business logic —
 * every later slice's actions follow this exact shape.
 *
 * `requireScope` is the authenticated+scoped gate (GF-03): a missing session
 * throws `UnauthenticatedError`, which the `isDomainError` adapter below maps to
 * the `UNAUTHENTICATED` code — no bespoke auth branch per action.
 *
 * Also surfaces `isKanbanEnabled` (GF-22) so the page can hide the
 * Kanban-specific stage-breakdown card without a second round trip.
 */
export async function loadDashboard(): Promise<
  ActionResult<DashboardData & { isKanbanEnabled: boolean }>
> {
  try {
    const scope = await requireScope();
    const data = await getDashboard(scope, {});
    return { ok: true, data: { ...data, isKanbanEnabled: await isKanbanEnabled(scope) } };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
