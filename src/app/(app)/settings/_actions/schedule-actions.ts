"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import type { ScheduleConfig } from "@/lib/schedule";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import { getScheduleConfig, setScheduleConfig } from "@/server/services/location/service";

/**
 * Location Working Calendar Server Actions (GF-20). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 */

/** A mutation result: the saved schedule config, or an error code + optional field errors. */
export type ScheduleConfigMutationResult =
  | { ok: true; data: ScheduleConfig }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export async function getScheduleConfigAction(): Promise<ActionResult<ScheduleConfig>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getScheduleConfig(scope) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function setScheduleConfigAction(
  input: unknown,
): Promise<ScheduleConfigMutationResult> {
  try {
    const scope = await requireScope();
    const data = await setScheduleConfig(scope, input);
    revalidatePath("/settings");
    revalidatePath("/appointments");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
    }
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
