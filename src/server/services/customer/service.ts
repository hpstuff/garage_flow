/**
 * Customer service (GF-04, GF-21) — create, edit, list and anonymize Customers,
 * Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * There is no delete: a Customer is never hard-deleted. Right-to-erasure is
 * **Anonymization** (ADR-0004) — {@link anonymizeCustomer} strips the PII, stamps
 * the anonymized state, and unlinks the Customer's Vehicles, all while the row (and
 * any issued Invoices) survive.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { ScopedCustomer } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  anonymizeCustomerSchema,
  createCustomerSchema,
  getCustomerSchema,
  listCustomersSchema,
  updateCustomerSchema,
} from "./schema";

export type { ScopedCustomer } from "../../db/scoped-db";

/**
 * A Customer is **anonymized** exactly when its erasure instant is set (GF-21,
 * ADR-0004) — the anonymized state, distinct from row deletion. Pure and DB-free,
 * mirroring Consent's `isActive`, so the UI and callers gate on it without a query.
 */
export function isAnonymized(customer: ScopedCustomer): boolean {
  return customer.anonymizedAt !== null;
}

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

/**
 * Anonymize a Customer (GF-21, ADR-0004) — the right-to-erasure action. ScopedDb
 * does the work atomically: strips the PII, stamps `anonymizedAt`, and unlinks the
 * Customer's Vehicles, all in one transaction. Scoped, so a Customer outside the
 * caller's Location 404s. Idempotent: anonymizing an already-anonymized Customer
 * returns it unchanged. Issued Invoices are never touched and never cascade away.
 */
export async function anonymizeCustomer(scope: Scope, input: unknown): Promise<ScopedCustomer> {
  const parsed = anonymizeCustomerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid customer id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).anonymizeCustomer(parsed.data.id);
}
