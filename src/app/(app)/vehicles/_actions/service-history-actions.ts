"use server";

import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { getServiceHistory, type ServiceHistory } from "@/server/services/service-history/service";

/**
 * Service History Server Action (GF-18). Follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * The Service History is a read-only **derived view** over a Vehicle's Repair
 * Orders (CONTEXT.md) — there is no mutation and nothing to revalidate. A Vehicle
 * outside the caller's scope surfaces as an `error` code so the page can render a
 * 404 rather than a cross-tenant read.
 */
export async function getServiceHistoryAction(
  vehicleId: string,
): Promise<ActionResult<ServiceHistory>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getServiceHistory(scope, { vehicleId }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
