"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createMechanic,
  getMechanic,
  listMechanics,
  type ScopedMechanic,
  updateMechanic,
} from "@/server/services/mechanic/service";

/**
 * Mechanic Server Actions (GF-07). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * `listMechanicsAction` is also the source the future Repair Order lead picker
 * and Labor Line Items will read from. Mutations carry `fieldErrors` so the form
 * can surface Zod messages inline; the generic `error` code covers the rest.
 */

/** A mutation result: the saved Mechanic, or an error code + optional field errors. */
export type MechanicMutationResult =
  | { ok: true; data: ScopedMechanic }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): MechanicMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

export async function listMechanicsAction(
  search?: string,
): Promise<ActionResult<ScopedMechanic[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listMechanics(scope, { search }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function getMechanicAction(id: string): Promise<ActionResult<ScopedMechanic>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getMechanic(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createMechanicAction(input: unknown): Promise<MechanicMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createMechanic(scope, input);
    revalidatePath("/mechanics");
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function updateMechanicAction(input: unknown): Promise<MechanicMutationResult> {
  try {
    const scope = await requireScope();
    const data = await updateMechanic(scope, input);
    revalidatePath("/mechanics");
    revalidatePath(`/mechanics/${data.id}/edit`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
