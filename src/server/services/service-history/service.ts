/**
 * Service History service (GF-18) — the derived timeline of every Repair Order
 * ever performed on one Vehicle, Location-scoped.
 *
 * CONTEXT.md: **Service History** is keyed by the **Vehicle** (VIN/plate),
 * regardless of who owned it at the time, and is **not stored separately** — it is
 * a *view* over Repair Orders. So this slice never writes and never duplicates:
 * it reads the Vehicle and its current Repair Orders live and shapes them. Because
 * a Repair Order links to the Vehicle (not the owner) and resale is a plain owner
 * swap on the Vehicle (GF-05), the history survives a change of ownership for free.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The shaping lives in a pure, DB-free
 * {@link projectServiceHistory} so the newest-first ordering — the load-bearing
 * promise — is unit-tested directly, exactly like the Work Card projection.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { InvoiceStatus, KanbanStage, PaymentStatus, VehicleKind } from "../../db/schema";
import type { ScopedRepairOrder, ScopedVehicle } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import { getServiceHistorySchema } from "./schema";

/**
 * One visit on the timeline: a Repair Order performed on this Vehicle. Carries the
 * operational summary (stage, complaint/diagnosis, lead Mechanic) plus the
 * read-only invoice/payment references (ADR-0002) so a row can link straight to
 * the order and show its status at a glance. No money — totals belong to the
 * Invoice projection (GF-14), never to the history list.
 */
export interface ServiceHistoryEntry {
  repairOrderId: string;
  createdAt: Date;
  /** Kanban Stage (GF-10) — where the car is/was on the board for this visit. */
  stage: KanbanStage;
  complaint: string | null;
  diagnosis: string | null;
  mechanicName: string | null;
  invoiceStatus: InvoiceStatus;
  paymentStatus: PaymentStatus;
}

/**
 * The Service History of one Vehicle (GF-18): the Vehicle identity that keys the
 * timeline (plate/VIN) plus its current owner, and every Repair Order ever
 * performed on it, **newest first**. `customerName` is the Vehicle's *current*
 * owner — the history is keyed by the Vehicle, so it deliberately spans every past
 * owner rather than filtering to one.
 */
export interface ServiceHistory {
  vehicleId: string;
  vehiclePlate: string | null;
  vehicleVin: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleKind: VehicleKind;
  customerName: string;
  entries: ServiceHistoryEntry[];
}

/**
 * Project a Vehicle and its Repair Orders into a {@link ServiceHistory} (GF-18).
 *
 * Pure and DB-free — the same Repair Orders that feed the board and the invoicing
 * flow, shaped as a per-Vehicle timeline. Entries are sorted by `createdAt`
 * descending here (not relying on the query order), so "newest first" holds for
 * any input and is provable without a database. Nothing is copied into a store:
 * each entry is a live reference back to its Repair Order.
 */
export function projectServiceHistory(
  vehicle: ScopedVehicle,
  orders: ScopedRepairOrder[],
): ServiceHistory {
  const entries: ServiceHistoryEntry[] = orders
    .map((order) => ({
      repairOrderId: order.id,
      createdAt: order.createdAt,
      stage: order.stage,
      complaint: order.complaint,
      diagnosis: order.diagnosis,
      mechanicName: order.mechanicName,
      invoiceStatus: order.invoiceStatus,
      paymentStatus: order.paymentStatus,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    vehicleVin: vehicle.vin,
    vehicleMake: vehicle.make,
    vehicleModel: vehicle.model,
    vehicleKind: vehicle.kind,
    customerName: vehicle.customerName,
    entries,
  };
}

/**
 * Render one Vehicle's Service History on demand (GF-18). Loads the Vehicle and
 * its Repair Orders through ScopedDb — a 404 for a Vehicle outside the caller's
 * scope, never a cross-tenant read — then shapes them with
 * {@link projectServiceHistory}. Reads live every time: nothing is duplicated into
 * a separate history store (CONTEXT.md).
 */
export async function getServiceHistory(scope: Scope, input: unknown): Promise<ServiceHistory> {
  const parsed = getServiceHistorySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid vehicle id", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  const vehicle = await db.getVehicle(parsed.data.vehicleId);
  const orders = await db.listRepairOrders({ vehicleId: vehicle.id });
  return projectServiceHistory(vehicle, orders);
}
