"use server";

import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { isKanbanEnabled } from "@/server/services/location/service";

/**
 * Location Kanban-enabled Server Actions (GF-22). Each follows the reference
 * shape (ADR-0005/0015): authenticate → derive scope → call ONE service →
 * adapt the result/errors. No business logic lives here.
 */

/** Read whether the Kanban board is enabled for the current Location. */
export async function getKanbanEnabledAction(): Promise<ActionResult<boolean>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await isKanbanEnabled(scope) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
