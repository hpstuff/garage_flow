/**
 * Mechanic service (GF-07) — create, edit and list Mechanics, Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * A **Mechanic** is an assignable worker, distinct from a **User** (CONTEXT.md):
 * in the MVP it is just a name with no login. `listMechanics` is the building
 * block the Repair Order lead picker and Labor Line Items draw from once those
 * slices land. There is no delete — a Mechanic referenced by past labor must
 * survive; linking a Mechanic to a login User is Phase 2.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { ScopedMechanic } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createMechanicSchema,
  getMechanicSchema,
  listMechanicsSchema,
  updateMechanicSchema,
} from "./schema";

export type { ScopedMechanic } from "../../db/scoped-db";

export async function listMechanics(scope: Scope, input: unknown): Promise<ScopedMechanic[]> {
  const parsed = listMechanicsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid mechanic query", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).listMechanics(parsed.data.search ?? null);
}

export async function getMechanic(scope: Scope, input: unknown): Promise<ScopedMechanic> {
  const parsed = getMechanicSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid mechanic id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getMechanic(parsed.data.id);
}

export async function createMechanic(scope: Scope, input: unknown): Promise<ScopedMechanic> {
  const parsed = createMechanicSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid mechanic", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).createMechanic(parsed.data);
}

export async function updateMechanic(scope: Scope, input: unknown): Promise<ScopedMechanic> {
  const parsed = updateMechanicSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid mechanic", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateMechanic(id, values);
}
