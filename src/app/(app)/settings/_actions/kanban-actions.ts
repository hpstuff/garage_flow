"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { isDomainError } from "@/server/domain/errors";
import { isKanbanEnabled, setKanbanEnabled } from "@/server/services/location/service";

/**
 * Location Kanban board Server Actions (GF-22). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 */

/** Read whether the Kanban board is enabled at all (GF-22). */
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

/**
 * Turn the Kanban board on/off (GF-22), leaving the per-stage `hiddenStages`
 * untouched — hiding the board should not discard stages already configured.
 */
export async function setKanbanEnabledAction(enabled: boolean): Promise<ActionResult<boolean>> {
  try {
    const scope = await requireScope();
    const data = await setKanbanEnabled(scope, { enabled });
    revalidatePath("/settings");
    revalidatePath("/repair-orders");
    revalidatePath("/repair-orders/board");
    revalidatePath("/dashboard");
    return { ok: true, data };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
