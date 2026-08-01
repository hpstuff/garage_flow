"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  type ScopedCustomer,
  updateCustomer,
} from "@/server/services/customer/service";

/**
 * Customer Server Actions (GF-04). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here.
 *
 * Mutations carry `fieldErrors` so the form can surface Zod messages inline; the
 * generic `error` code covers the rest (auth, not-found).
 */

/** A mutation result: the saved Customer, or an error code + optional field errors. */
export type CustomerMutationResult =
  | { ok: true; data: ScopedCustomer }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): CustomerMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

export async function listCustomersAction(
  search?: string,
): Promise<ActionResult<ScopedCustomer[]>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await listCustomers(scope, { search }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function getCustomerAction(id: string): Promise<ActionResult<ScopedCustomer>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getCustomer(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createCustomerAction(input: unknown): Promise<CustomerMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createCustomer(scope, input);
    revalidatePath("/customers");
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function updateCustomerAction(input: unknown): Promise<CustomerMutationResult> {
  try {
    const scope = await requireScope();
    const data = await updateCustomer(scope, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${data.id}/edit`);
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
