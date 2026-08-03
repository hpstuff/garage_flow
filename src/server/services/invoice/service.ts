/**
 * Invoice service (GF-14) — issue and read the **Invoice**, the financial/legal
 * document projected from a Repair Order and **frozen at issue** (ADR-0002),
 * Location-scoped.
 *
 * ADR-0009: the Work Card and the Invoice are two projections of one Repair Order.
 * The Invoice is the financial subset — the priced Line Items, amounts, and VAT —
 * frozen at issue time: it snapshots those into an append-only Invoice table with a
 * **gapless sequential number per legal series per Location** (ADR-0002/0006) and
 * never changes afterward. Editing the source Repair Order later cannot alter an
 * issued Invoice; corrections are a Credit Note (a future slice), never an edit.
 * The RO keeps `invoice_status` as a **reference** (ADR-0002) — this slice flips it
 * to `invoiced`, it does not "simplify" the Invoice back into RO fields.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The snapshot shaping lives in a pure,
 * DB-free {@link buildInvoiceInput}; the atomic numbering, freeze, and RO-status
 * flip live in {@link ScopedDb.issueInvoice}.
 */

import { z } from "zod";
import type { VatConfig } from "../../../lib/vat";
import { type Scope, scoped } from "../../db";
import { DEFAULT_INVOICE_SERIES } from "../../db/schema";
import type {
  InvoiceIssueValues,
  ScopedInvoice,
  ScopedLineItem,
  ScopedRepairOrder,
} from "../../db/scoped-db";
import { ConflictError, ValidationError } from "../../domain/errors";
import { computeRepairOrderTotals } from "../line-item/service";
import { getVatConfig } from "../location/service";
import { getInvoiceForRepairOrderSchema, getInvoiceSchema, issueInvoiceSchema } from "./schema";

export type { ScopedInvoice, ScopedInvoiceLine } from "../../db/scoped-db";

/**
 * Shape a Repair Order and its current Line Items into the frozen snapshot to
 * issue (ADR-0002) under the Location's {@link VatConfig} (ADR-0006). Pure and
 * DB-free — the same source of truth (the RO + its lines) that feeds the Work Card,
 * shaped for the legal document instead: totals derived from the lines (never the
 * lead Mechanic, ADR-0009), the seller's VAT registration and the buyer identity
 * snapshotted, and each line copied with its `position`. A `not_registered`
 * Location yields `vat: null` — a true zero-VAT invoice, not a cosmetic 0%
 * (ADR-0006). It deliberately carries **no** Mechanic attribution or diagnosis
 * narrative — those belong to the Work Card, not the Invoice (ADR-0009).
 *
 * The DB-assigned gapless `number` and the `issuedAt` freeze time are **not** set
 * here — the transaction in {@link ScopedDb.issueInvoice} allocates them.
 */
export function buildInvoiceInput(params: {
  order: Pick<ScopedRepairOrder, "id" | "customerName" | "vehiclePlate">;
  lines: ScopedLineItem[];
  vatConfig: VatConfig;
  series: string;
}): InvoiceIssueValues {
  const { order, lines, vatConfig, series } = params;
  const totals = computeRepairOrderTotals(lines, vatConfig);

  return {
    repairOrderId: order.id,
    series,
    vatMode: vatConfig.mode,
    sellerVatNumber: vatConfig.mode === "registered" ? vatConfig.vatNumber : null,
    customerName: order.customerName,
    vehiclePlate: order.vehiclePlate,
    net: totals.net,
    vat: totals.vat,
    gross: totals.gross,
    currency: totals.currency,
    lines: lines.map((line, index) => ({
      position: index + 1,
      type: line.type,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      amount: line.amount,
      currency: line.currency,
    })),
  };
}

/**
 * Issue an Invoice from a Repair Order's current Line Items (GF-14). Loads the RO
 * and its lines through ScopedDb — a 404 for anything outside the caller's scope,
 * never a cross-tenant read — computes the totals under the Location's VAT config,
 * and hands the frozen snapshot to the transactional {@link ScopedDb.issueInvoice},
 * which allocates the gapless number and flips the RO's `invoice_status`.
 *
 * Two guards raise `ConflictError`: an order that already has an Invoice — still
 * `invoiced`, or `credited` once a Credit Note has voided it (GF-16); either way
 * the MVP allows only one Invoice per RO — re-checked authoritatively under the
 * row lock in ScopedDb — and one with no Line Items — an invoice with nothing on
 * it is legally meaningless.
 */
export async function issueInvoice(scope: Scope, input: unknown): Promise<ScopedInvoice> {
  const parsed = issueInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid invoice request", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  const order = await db.getRepairOrder(parsed.data.repairOrderId);
  if (order.invoiceStatus !== "not_invoiced") {
    throw new ConflictError("Repair order already has an Invoice");
  }

  const lines = await db.listLineItems(order.id);
  if (lines.length === 0) {
    throw new ConflictError("Cannot issue an invoice for a repair order with no line items");
  }

  const vatConfig = await getVatConfig(scope);
  return db.issueInvoice(
    buildInvoiceInput({ order, lines, vatConfig, series: DEFAULT_INVOICE_SERIES }),
  );
}

/** Read one issued Invoice by id (GF-14) — a 404 for anything outside the caller's scope. */
export async function getInvoice(scope: Scope, input: unknown): Promise<ScopedInvoice> {
  const parsed = getInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid invoice id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getInvoice(parsed.data.id);
}

/**
 * The Invoice issued from a given Repair Order, or `null` when it has not been
 * invoiced (GF-14) — the RO's `invoice_status` reference made concrete (ADR-0002),
 * so a detail view can link to the document. `null` for an out-of-scope order too.
 */
export async function getInvoiceForRepairOrder(
  scope: Scope,
  input: unknown,
): Promise<ScopedInvoice | null> {
  const parsed = getInvoiceForRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid repair order id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getInvoiceForRepairOrder(parsed.data.repairOrderId);
}
