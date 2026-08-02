/**
 * Work Card service (GF-13) — render the operational, customer-facing **Work
 * Card** on demand from the current Repair Order, Location-scoped.
 *
 * ADR-0009: the Work Card and the Invoice are two **projections** of one Repair
 * Order, not independent aggregates. The Work Card is a *live* rendered document —
 * never stored or frozen — telling the customer the story of the visit: their
 * Complaint, the Mechanic's Diagnosis, and the work done (labor by Mechanic with
 * hours, Parts, photos). It deliberately carries **none** of the Invoice's frozen
 * legal subset (ADR-0002): no gapless invoice number, no VAT snapshot, no prices
 * or totals, no invoice/payment status. Those belong to the Invoice projection
 * (GF-14), so a total can never leak the wrong way onto the operational card.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The shaping itself lives in a pure,
 * DB-free {@link projectWorkCard} — the projection is the heart of ADR-0009, so it
 * is unit-tested directly, exactly like the RO totals.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { KanbanStage } from "../../db/schema";
import type { ScopedLineItem, ScopedRepairOrder } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import { getWorkCardSchema } from "./schema";

/**
 * One Labor line as it appears on the Work Card: what was done and for how long.
 * `hours` keeps the exact integer encoding (thousandths, ADR-0011) — the
 * formatting layer renders it. No rate and no amount: money is the Invoice's job.
 */
export interface WorkCardLaborEntry {
  lineItemId: string;
  description: string;
  /** Hours worked, in thousandths (ADR-0011) — e.g. 1500 → 1,5 h. */
  hours: number;
}

/**
 * The Labor performed by one Mechanic, grouped so the card reads "by whom, for how
 * long" (ADR-0009). `mechanicName` is `null` for labor whose Mechanic was cleared
 * (the UI shows an "unattributed" label); such lines are collected under a single
 * `mechanicId: null` group.
 */
export interface WorkCardMechanicLabor {
  mechanicId: string | null;
  mechanicName: string | null;
  entries: WorkCardLaborEntry[];
  /** Sum of the group's `hours`, in thousandths — the Mechanic's total on this RO. */
  totalHours: number;
}

/** One Part line as it appears on the Work Card: which part, how many — no price. */
export interface WorkCardPart {
  lineItemId: string;
  description: string;
  /** Quantity, in thousandths (ADR-0011). */
  quantity: number;
}

/**
 * A photo attached to the Repair Order (GF-11). Included in the projection shape
 * so the Work Card is complete per ADR-0009, but always empty until GF-11 lands
 * the photo model — the card renders an empty photos section in the meantime.
 */
export interface WorkCardPhoto {
  id: string;
  url: string;
  caption: string | null;
}

/**
 * The Work Card — a live projection of one Repair Order (ADR-0009). Carries the
 * Vehicle/owner identity for the header, the Complaint/Diagnosis narrative, the
 * Labor grouped by Mechanic, the Parts, and the photos. It intentionally omits
 * everything that belongs only to the Invoice's frozen legal subset (prices, VAT,
 * totals, invoice number, invoice/payment status).
 */
export interface WorkCard {
  repairOrderId: string;
  vehicleId: string;
  vehiclePlate: string | null;
  vehicleVin: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  customerName: string;
  stage: KanbanStage;
  createdAt: Date;
  complaint: string | null;
  diagnosis: string | null;
  laborByMechanic: WorkCardMechanicLabor[];
  parts: WorkCardPart[];
  photos: WorkCardPhoto[];
}

/**
 * Project a Repair Order and its Line Items into a {@link WorkCard} (ADR-0009).
 *
 * Pure and DB-free — the same source of truth (the RO + its lines) that feeds the
 * Invoice, shaped for the operational card instead. Labor lines are grouped by
 * their attributed Mechanic **in first-appearance order** (the lines arrive
 * ordered by `createdAt`, so the grouping is deterministic); Part lines are listed
 * in that same order. Nothing priced is carried across — a Work Card can never
 * disagree with, or pre-empt, the Invoice because it simply has no money on it.
 *
 * `photos` is passed through untouched (empty until GF-11), so this stays the one
 * place the Work Card is assembled once photos are real.
 */
export function projectWorkCard(
  order: ScopedRepairOrder,
  lineItems: ScopedLineItem[],
  photos: WorkCardPhoto[] = [],
): WorkCard {
  const groups: WorkCardMechanicLabor[] = [];
  const groupByMechanic = new Map<string | null, WorkCardMechanicLabor>();
  const parts: WorkCardPart[] = [];

  for (const item of lineItems) {
    if (item.type === "part") {
      parts.push({ lineItemId: item.id, description: item.description, quantity: item.quantity });
      continue;
    }

    // Labor: attribute to its Mechanic, collecting cleared attributions under one
    // `null` group. First-appearance order keeps the card stable across renders.
    let group = groupByMechanic.get(item.mechanicId);
    if (!group) {
      group = {
        mechanicId: item.mechanicId,
        mechanicName: item.mechanicName,
        entries: [],
        totalHours: 0,
      };
      groupByMechanic.set(item.mechanicId, group);
      groups.push(group);
    }
    group.entries.push({
      lineItemId: item.id,
      description: item.description,
      hours: item.quantity,
    });
    group.totalHours += item.quantity;
  }

  return {
    repairOrderId: order.id,
    vehicleId: order.vehicleId,
    vehiclePlate: order.vehiclePlate,
    vehicleVin: order.vehicleVin,
    vehicleMake: order.vehicleMake,
    vehicleModel: order.vehicleModel,
    customerName: order.customerName,
    stage: order.stage,
    createdAt: order.createdAt,
    complaint: order.complaint,
    diagnosis: order.diagnosis,
    laborByMechanic: groups,
    parts,
    photos,
  };
}

/**
 * Render the Work Card for one Repair Order on demand (GF-13). Loads the current
 * RO and its Line Items through ScopedDb — a 404 for anything outside the caller's
 * scope, never a cross-tenant read — and shapes them with {@link projectWorkCard}.
 * No stored or duplicated line data: this reads the live RO every time.
 *
 * Photos (GF-11) are not yet modelled, so the card renders with an empty photos
 * section; wiring the real photos in is a one-line change here once GF-11 lands.
 */
export async function getWorkCard(scope: Scope, input: unknown): Promise<WorkCard> {
  const parsed = getWorkCardSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order id", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  const order = await db.getRepairOrder(parsed.data.id);
  const lineItems = await db.listLineItems(order.id);
  return projectWorkCard(order, lineItems);
}
