"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createVehicle,
  getVehicle,
  listVehicles,
  type ScopedVehicle,
  searchVehicles,
  updateVehicle,
} from "@/server/services/vehicle/service";

/**
 * Vehicle Server Actions (GF-05). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * Mutations carry `fieldErrors` so the form can surface Zod messages inline; the
 * generic `error` code covers the rest (auth, not-found, foreign owner).
 */

/** A mutation result: the saved Vehicle, or an error code + optional field errors. */
export type VehicleMutationResult =
  | { ok: true; data: ScopedVehicle }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): VehicleMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

export async function listVehiclesAction(search?: string): Promise<ActionResult<ScopedVehicle[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listVehicles(scope, { search }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/**
 * Fast plate/VIN search (GF-06). Blank queries short-circuit to an empty result
 * so the search-as-you-type UI needn't special-case them; a real query goes
 * through the service, which does the loose plate/VIN matching (ADR-0008).
 */
export async function searchVehiclesAction(query: string): Promise<ActionResult<ScopedVehicle[]>> {
  try {
    const scope = await requireScope();
    if (!query || query.trim().length === 0) {
      return { ok: true, data: [] };
    }
    return { ok: true, data: await searchVehicles(scope, { query }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function getVehicleAction(id: string): Promise<ActionResult<ScopedVehicle>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getVehicle(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createVehicleAction(input: unknown): Promise<VehicleMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createVehicle(scope, input);
    revalidatePath("/vehicles");
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function updateVehicleAction(input: unknown): Promise<VehicleMutationResult> {
  try {
    const scope = await requireScope();
    const data = await updateVehicle(scope, input);
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${data.id}/edit`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
