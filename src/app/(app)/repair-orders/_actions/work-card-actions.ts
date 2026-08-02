"use server";

import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { getWorkCard, type WorkCard } from "@/server/services/work-card/service";

/**
 * Work Card Server Action (GF-13). Follows the reference shape (ADR-0005/0015):
 * authenticate → derive scope → call ONE service → adapt the result/errors. No
 * business logic lives here.
 *
 * The Work Card is a read-only **projection** of the current Repair Order
 * (ADR-0009) — there is no mutation and nothing to revalidate, since the card is
 * never stored. A not-found or out-of-scope order surfaces as an `error` code, so
 * the page can render a 404 rather than a cross-tenant read.
 */
export async function getWorkCardAction(id: string): Promise<ActionResult<WorkCard>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getWorkCard(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
