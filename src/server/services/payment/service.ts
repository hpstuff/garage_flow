/**
 * Payment service (GF-15) — record and read the **Payments** taken against an
 * Invoice, Location-scoped.
 *
 * ADR-0002: Payments settle the Invoice and support **partial payment** — an
 * Invoice can take several Payments whose amounts sum toward its gross total. The
 * Repair Order's `payment_status` is a **reference** derived from that sum versus
 * the Invoice total; recording a Payment updates it but never touches the frozen
 * Invoice snapshot, which stays immutable (corrections are a Credit Note, never an
 * edit). Payments themselves are append-only financial records — no edit/delete
 * path in the domain; a mistaken Payment is corrected by a future reversing entry.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The status rule and the settlement
 * summary live in pure, DB-free functions ({@link derivePaymentStatus},
 * {@link summarizePayments}); the atomic insert-sum-and-flip lives in
 * {@link ScopedDb.recordPayment}, which applies the pure rule under a row lock.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { PaymentStatus } from "../../db/schema";
import type { ScopedInvoice, ScopedPayment } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import { getInvoicePaymentsSchema, recordPaymentSchema } from "./schema";

export type { ScopedPayment } from "../../db/scoped-db";

/**
 * Derive an Invoice's payment status from the total paid so far versus its gross
 * (ADR-0002) — a pure integer comparison in minor units:
 * - nothing paid → `unpaid` (the opening state)
 * - the total covers the gross → `paid` (an overpayment still reads as paid)
 * - otherwise → `partially_paid`
 *
 * Order matters: the `<= 0` guard is checked first, so a zero-gross Invoice with no
 * Payment stays `unpaid` rather than collapsing to `paid`. Injected into
 * {@link ScopedDb.recordPayment} so the domain rule stays here, not in the DB layer.
 */
export function derivePaymentStatus(
  totalPaidMinor: number,
  invoiceGrossMinor: number,
): PaymentStatus {
  if (totalPaidMinor <= 0) {
    return "unpaid";
  }
  if (totalPaidMinor >= invoiceGrossMinor) {
    return "paid";
  }
  return "partially_paid";
}

/**
 * An Invoice's settlement picture (GF-15): its gross, the total paid across all
 * Payments, the outstanding `balance`, the derived `status`, and the Payments
 * themselves. Money is integer minor units of `currency` (ADR-0011).
 */
export interface PaymentSummary {
  invoiceId: string;
  repairOrderId: string;
  gross: number;
  currency: string;
  totalPaid: number;
  /** `gross - totalPaid`, floored at 0 — an overpayment shows no negative balance. */
  balance: number;
  status: PaymentStatus;
  payments: ScopedPayment[];
}

/**
 * Summarize an Invoice's Payments against its gross (ADR-0002). Pure and DB-free —
 * the same derivation the RO's `payment_status` reference is built from, exposed so
 * a view can show the running balance and status. Reads only the Invoice header
 * fields it needs, so it composes with either a full {@link ScopedInvoice} or a
 * lighter projection.
 */
export function summarizePayments(
  invoice: Pick<ScopedInvoice, "id" | "repairOrderId" | "gross" | "currency">,
  payments: ScopedPayment[],
): PaymentSummary {
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    invoiceId: invoice.id,
    repairOrderId: invoice.repairOrderId,
    gross: invoice.gross,
    currency: invoice.currency,
    totalPaid,
    balance: Math.max(invoice.gross - totalPaid, 0),
    status: derivePaymentStatus(totalPaid, invoice.gross),
    payments,
  };
}

/**
 * Record a Payment against an Invoice (GF-15). The human-unit `amount` becomes exact
 * minor units, then the atomic {@link ScopedDb.recordPayment} inserts it, sums every
 * Payment on the Invoice, and flips the RO's `payment_status` via
 * {@link derivePaymentStatus} — all under a row lock, so concurrent Payments can't
 * race the status. A cross-tenant or missing Invoice raises `NotFoundError` from the
 * locked read. Returns the fresh {@link PaymentSummary} so the caller can render the
 * new balance and status without a second round trip.
 */
export async function recordPayment(scope: Scope, input: unknown): Promise<PaymentSummary> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid payment", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  await db.recordPayment(
    {
      invoiceId: parsed.data.invoiceId,
      amount: Math.round(parsed.data.amount * 100),
      method: parsed.data.method,
      note: parsed.data.note,
    },
    derivePaymentStatus,
  );

  const invoice = await db.getInvoice(parsed.data.invoiceId);
  const payments = await db.listPayments(invoice.id);
  return summarizePayments(invoice, payments);
}

/**
 * The Payments recorded against an Invoice and their settlement summary (GF-15) —
 * a 404 for an Invoice outside the caller's scope, never a cross-tenant read.
 */
export async function getInvoicePayments(scope: Scope, input: unknown): Promise<PaymentSummary> {
  const parsed = getInvoicePaymentsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid invoice id", z.flattenError(parsed.error).fieldErrors);
  }

  const db = scoped(scope);
  const invoice = await db.getInvoice(parsed.data.invoiceId);
  const payments = await db.listPayments(invoice.id);
  return summarizePayments(invoice, payments);
}
