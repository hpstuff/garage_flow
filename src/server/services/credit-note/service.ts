/**
 * Credit Note service (GF-16) — issue and read the **Credit Note**, the corrective
 * legal document that adjusts an already-issued **Invoice** (ADR-0002), Location-scoped.
 *
 * ADR-0002: an issued Invoice is immutable; the only way to "change" one is to issue
 * a separate **Credit Note** that references and corrects it. The Credit Note is
 * itself frozen at issue and append-only, with its **own gapless sequential number
 * per legal series per Location** (drawn from `credit_note_series`, never the Invoice
 * counter). Issuing one is a pure append: it reads the credited Invoice's frozen
 * snapshot but writes nothing back, so the original Invoice stays immutable — the
 * load-bearing rule of this slice.
 *
 * The MVP issues a **full** Credit Note (it credits the whole Invoice), so at most
 * one references any Invoice; partial/multiple corrections are a future slice.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The snapshot shaping lives in a pure,
 * DB-free {@link buildCreditNoteInput}; the atomic numbering, freeze, and
 * one-per-Invoice guard live in {@link ScopedDb.issueCreditNote}.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import { DEFAULT_CREDIT_NOTE_SERIES } from "../../db/schema";
import type { CreditNoteIssueValues, ScopedCreditNote, ScopedInvoice } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  getCreditNoteForInvoiceSchema,
  getCreditNoteSchema,
  issueCreditNoteSchema,
} from "./schema";

export type { ScopedCreditNote, ScopedCreditNoteLine } from "../../db/scoped-db";

/**
 * Shape an issued **Invoice** into the frozen snapshot to credit (ADR-0002). Pure and
 * DB-free — a full correction, so every amount and line is **copied** from the
 * Invoice's own frozen snapshot, never recomputed: a Credit Note that disagreed with
 * the document it corrects would be meaningless. The Invoice's printed number
 * (`series`/`number`) is snapshotted as `invoiceSeries`/`invoiceNumber` so the
 * corrective document reads "corrective to Invoice A-0000000001" without a join, and
 * the VAT snapshot passes through untouched — a `vat: null` Invoice (not registered,
 * ADR-0006) yields a `vat: null` Credit Note, a true zero-VAT correction. Amounts are
 * carried as positive values: the sum credited back to the Customer.
 *
 * The DB-assigned gapless `number` and the `issuedAt` freeze time are **not** set
 * here — the transaction in {@link ScopedDb.issueCreditNote} allocates them.
 */
export function buildCreditNoteInput(params: {
  invoice: ScopedInvoice;
  series: string;
  reason: string | null;
}): CreditNoteIssueValues {
  const { invoice, series, reason } = params;

  return {
    invoiceId: invoice.id,
    repairOrderId: invoice.repairOrderId,
    series,
    invoiceSeries: invoice.series,
    invoiceNumber: invoice.number,
    vatMode: invoice.vatMode,
    sellerVatNumber: invoice.sellerVatNumber,
    customerName: invoice.customerName,
    vehiclePlate: invoice.vehiclePlate,
    net: invoice.net,
    vat: invoice.vat,
    gross: invoice.gross,
    reason,
    currency: invoice.currency,
    lines: invoice.lines.map((line) => ({
      position: line.position,
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
 * Issue a Credit Note against an already-issued Invoice (GF-16). Loads the Invoice
 * through ScopedDb — a 404 for anything outside the caller's scope, never a
 * cross-tenant read — copies its frozen snapshot into the Credit Note shape, and
 * hands it to the transactional {@link ScopedDb.issueCreditNote}, which allocates the
 * gapless number and enforces one Credit Note per Invoice (a `ConflictError` on a
 * second attempt). Writes nothing back to the Invoice, so it stays immutable (ADR-0002).
 */
export async function issueCreditNote(scope: Scope, input: unknown): Promise<ScopedCreditNote> {
  const parsed = issueCreditNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid credit note request",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const db = scoped(scope);
  const invoice = await db.getInvoice(parsed.data.invoiceId);
  return db.issueCreditNote(
    buildCreditNoteInput({ invoice, series: DEFAULT_CREDIT_NOTE_SERIES, reason: parsed.data.reason }),
  );
}

/** Read one issued Credit Note by id (GF-16) — a 404 for anything outside the caller's scope. */
export async function getCreditNote(scope: Scope, input: unknown): Promise<ScopedCreditNote> {
  const parsed = getCreditNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid credit note id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getCreditNote(parsed.data.id);
}

/**
 * The Credit Note that corrects a given Invoice, or `null` when it has not been
 * credited (GF-16) — the ADR-0002 reference made concrete, so the Invoice view can
 * link to its correction. `null` for an out-of-scope Invoice too.
 */
export async function getCreditNoteForInvoice(
  scope: Scope,
  input: unknown,
): Promise<ScopedCreditNote | null> {
  const parsed = getCreditNoteForInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid invoice id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getCreditNoteForInvoice(parsed.data.invoiceId);
}
