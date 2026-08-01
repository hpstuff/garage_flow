/**
 * Vehicle service (GF-05) — create, edit and list Vehicles, Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * A Vehicle always belongs to a Customer (the current owner). Reassigning that
 * owner is a plain update — the Service History (GF-18) keys off the Vehicle, so
 * history survives a change of ownership. There is no delete, matching Customer.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { ScopedVehicle } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createVehicleSchema,
  getVehicleSchema,
  listVehiclesSchema,
  updateVehicleSchema,
} from "./schema";

export type { ScopedVehicle } from "../../db/scoped-db";

export async function listVehicles(scope: Scope, input: unknown): Promise<ScopedVehicle[]> {
  const parsed = listVehiclesSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid vehicle query", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).listVehicles({
    search: parsed.data.search ?? null,
    customerId: parsed.data.customerId ?? null,
  });
}

export async function getVehicle(scope: Scope, input: unknown): Promise<ScopedVehicle> {
  const parsed = getVehicleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid vehicle id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getVehicle(parsed.data.id);
}

export async function createVehicle(scope: Scope, input: unknown): Promise<ScopedVehicle> {
  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid vehicle", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).createVehicle(parsed.data);
}

export async function updateVehicle(scope: Scope, input: unknown): Promise<ScopedVehicle> {
  const parsed = updateVehicleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid vehicle", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateVehicle(id, values);
}
