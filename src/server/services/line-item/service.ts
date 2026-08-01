/**
 * Line Item service (GF-09) — add, edit, remove and list the priced rows on a
 * Repair Order, Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * A **Line Item** is one priced row on a Repair Order, typed Labor or Part
 * (CONTEXT.md, ADR-0009). A **Labor** line attributes to a Mechanic and carries
 * hours × rate; a **Part** line carries quantity × unit price. Each line carries
 * its own VAT rate (consumed by GF-12/GF-14). The Invoice and all revenue/profit
 * reporting build from Line Items — never from the RO's lead Mechanic.
 *
 * This is where the money math lives, kept in exact integers (ADR-0011): the
 * form's human-unit numbers become thousandths / minor units / basis points, and
 * the net line `amount` is derived here (never trusted from the caller) so a total
 * can never disagree with its inputs.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { LineItemType } from "../../db/schema";
import type { LineItemWriteValues, ScopedLineItem } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  createLineItemSchema,
  deleteLineItemSchema,
  listLineItemsSchema,
  updateLineItemSchema,
} from "./schema";

export type { ScopedLineItem } from "../../db/scoped-db";

/**
 * The net line total in minor units: `round(quantity × unitPrice / 1000)`, where
 * `quantity` is in thousandths and `unitPrice` in minor units (see schema.ts).
 * Pure integer math — no float drift.
 */
export function lineItemAmount(quantityThousandths: number, unitPriceMinor: number): number {
  return Math.round((quantityThousandths * unitPriceMinor) / 1000);
}

/** A Repair Order's money totals in minor units of `currency`, all derived from its lines. */
export interface RepairOrderTotals {
  /** Sum of the net line amounts. */
  net: number;
  /** VAT, rounded per line (basis points on the net amount) then summed. */
  vat: number;
  /** `net + vat`. */
  gross: number;
  currency: string;
}

/**
 * Derive a Repair Order's totals from its Line Items (ADR-0009) — never from the
 * RO's lead Mechanic. VAT is rounded per line and then summed, the standard
 * invoice rounding (GF-14 will formalise the definitive rules). Pure and
 * DB-free, so it is unit-tested directly and reused by the RO detail view.
 */
export function computeRepairOrderTotals(items: ScopedLineItem[]): RepairOrderTotals {
  let net = 0;
  let vat = 0;
  for (const item of items) {
    net += item.amount;
    vat += Math.round((item.amount * item.vatRate) / 10000);
  }
  return { net, vat, gross: net + vat, currency: items[0]?.currency ?? "BGN" };
}

/**
 * Turn validated, human-unit input into the exact integer write values ScopedDb
 * persists: thousandths for `quantity`, minor units for `unitPrice`/`amount`,
 * basis points for `vatRate`. A Part line never carries a Mechanic, so any stray
 * `mechanicId` is cleared here (the schema already requires one for Labor).
 */
function toWriteValues(parsed: {
  repairOrderId: string;
  type: LineItemType;
  mechanicId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}): LineItemWriteValues {
  const quantity = Math.round(parsed.quantity * 1000);
  const unitPrice = Math.round(parsed.unitPrice * 100);
  const vatRate = Math.round(parsed.vatRate * 100);
  return {
    repairOrderId: parsed.repairOrderId,
    type: parsed.type,
    mechanicId: parsed.type === "part" ? null : parsed.mechanicId,
    description: parsed.description,
    quantity,
    unitPrice,
    vatRate,
    amount: lineItemAmount(quantity, unitPrice),
  };
}

export async function listLineItems(scope: Scope, input: unknown): Promise<ScopedLineItem[]> {
  const parsed = listLineItemsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid line item query", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).listLineItems(parsed.data.repairOrderId);
}

export async function createLineItem(scope: Scope, input: unknown): Promise<ScopedLineItem> {
  const parsed = createLineItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid line item", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).createLineItem(toWriteValues(parsed.data));
}

export async function updateLineItem(scope: Scope, input: unknown): Promise<ScopedLineItem> {
  const parsed = updateLineItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid line item", z.flattenError(parsed.error).fieldErrors);
  }

  const { id, ...values } = parsed.data;
  return scoped(scope).updateLineItem(id, toWriteValues(values));
}

export async function deleteLineItem(scope: Scope, input: unknown): Promise<{ id: string }> {
  const parsed = deleteLineItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid line item id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).deleteLineItem(parsed.data.id);
}
