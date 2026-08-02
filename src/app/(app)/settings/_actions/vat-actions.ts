"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import { getVatConfig, setVatConfig, type VatConfig } from "@/server/services/location/service";

/**
 * Location VAT Server Actions (GF-12). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * A VAT change alters the Invoice/VAT math for every Repair Order in the Location
 * (ADR-0006), so the mutation revalidates the settings page and the Repair Order
 * surfaces where totals are shown.
 */

/** A mutation result: the saved VAT config, or an error code + optional field errors. */
export type VatConfigMutationResult =
  | { ok: true; data: VatConfig }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export async function getVatConfigAction(): Promise<ActionResult<VatConfig>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getVatConfig(scope) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function setVatConfigAction(input: unknown): Promise<VatConfigMutationResult> {
  try {
    const scope = await requireScope();
    const data = await setVatConfig(scope, input);
    revalidatePath("/settings");
    revalidatePath("/repair-orders");
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
