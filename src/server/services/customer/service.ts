/**
 * Customer service (GF-04) — create, edit and list Customers, Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * There is no delete: a Customer is never hard-deleted here. Right-to-erasure is
 * Anonymization (ADR-0004), handled by GF-21.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { ScopedCustomer } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createCustomerSchema,
  getCustomerSchema,
  listCustomersSchema,
  updateCustomerSchema,
} from "./schema";

export type { ScopedCustomer } from "../../db/scoped-db";

export async function listCustomers(scope: Scope, input: unknown): Promise<ScopedCustomer[]> {
  const parsed = listCustomersSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid customer query", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).listCustomers(parsed.data.search ?? null);
}

export async function getCustomer(scope: Scope, input: unknown): Promise<ScopedCustomer> {
  const parsed = getCustomerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid customer id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getCustomer(parsed.data.id);
}

export async function createCustomer(scope: Scope, input: unknown): Promise<ScopedCustomer> {
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid customer", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).createCustomer(parsed.data);
}

export async function updateCustomer(scope: Scope, input: unknown): Promise<ScopedCustomer> {
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid customer", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateCustomer(id, values);
}
