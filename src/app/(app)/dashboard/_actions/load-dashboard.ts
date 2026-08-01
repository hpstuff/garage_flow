"use server";

import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { type DashboardData, getDashboard } from "@/server/services/dashboard/service";

/**
 * The reference Server Action (ADR-0005/0015): authenticate → derive scope →
 * call ONE service → adapt the result/errors. It contains no business logic —
 * every later slice's actions follow this exact shape.
 *
 * `requireScope` is the authenticated+scoped gate (GF-03): a missing session
 * throws `UnauthenticatedError`, which the `isDomainError` adapter below maps to
 * the `UNAUTHENTICATED` code — no bespoke auth branch per action.
 */
export async function loadDashboard(): Promise<ActionResult<DashboardData>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getDashboard(scope, {}) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
