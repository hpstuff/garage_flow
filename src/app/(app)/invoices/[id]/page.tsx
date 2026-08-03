import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatInvoiceNumber,
  formatMoney,
  formatQuantity,
  formatVatRate,
} from "@/lib/format";
import { SetBreadcrumb } from "../../_components/set-breadcrumb";
import { paymentStatusVariant } from "../../repair-orders/_components/status";
import { getCreditNoteForInvoiceAction } from "../_actions/credit-note-actions";
import { getInvoiceAction } from "../_actions/invoice-actions";
import { getInvoicePaymentsAction } from "../_actions/payment-actions";
import { IssueCreditNoteForm } from "../_components/issue-credit-note-form";
import { RecordPaymentForm } from "../_components/record-payment-form";

/**
 * Invoice (GF-14) — the financial/legal document **frozen at issue** (ADR-0002).
 * Unlike the Work Card, it is not a live projection: everything shown here is the
 * snapshot taken when the Invoice was issued (lines, amounts, VAT, buyer/seller
 * identity), so editing the source Repair Order afterward never changes it. A
 * not-registered Location's Invoice carries no VAT at all (ADR-0006). A 404 for an
 * Invoice outside the caller's scope, never a cross-tenant read.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("invoices");
  const tType = await getTranslations("repairOrders.lineItems.types");
  const tPay = await getTranslations("invoices.payments");
  const tMethod = await getTranslations("invoices.payments.methods");
  const tPaymentStatus = await getTranslations("repairOrders.paymentStatus");
  const tCredit = await getTranslations("invoices.creditNote");
  const tNav = await getTranslations("nav");
  const { id } = await params;

  const result = await getInvoiceAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const invoice = result.data;
  const registered = invoice.vatMode === "registered";
  const title = t("title", { number: formatInvoiceNumber(invoice.series, invoice.number) });

  // Payments (GF-15, ADR-0002). Recorded against the Invoice and summing toward its
  // gross; the derived status is a reference on the RO, never a change to this frozen
  // document. A failed load degrades to no card rather than 404-ing the Invoice.
  const paymentsResult = await getInvoicePaymentsAction(invoice.id);
  const settlement = paymentsResult.ok ? paymentsResult.data : null;
  // Default the record-payment amount to the outstanding balance (in major units),
  // the common "settle in full" case; empty once nothing is left owed.
  const defaultAmount =
    settlement && settlement.balance > 0 ? (settlement.balance / 100).toFixed(2) : "";

  // Credit Note (GF-16, ADR-0002). The only way to "correct" this immutable Invoice
  // is a separate Credit Note that references it. If one exists, link to it; otherwise
  // offer to issue one. Issuing never edits the Invoice below. A failed load degrades
  // to no card rather than 404-ing the Invoice.
  const creditNoteResult = await getCreditNoteForInvoiceAction(invoice.id);
  const creditNote = creditNoteResult.ok ? creditNoteResult.data : null;

  return (
    <div className="space-y-6">
      <SetBreadcrumb
        segments={[
          { label: tNav("repairOrders"), href: "/repair-orders" },
          {
            label: invoice.vehiclePlate ?? t("empty"),
            href: `/repair-orders/${invoice.repairOrderId}`,
          },
          { label: title },
        ]}
      />
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{formatDate(invoice.issuedAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/invoices/${invoice.id}/document`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("documentLink")}
          </Link>
          <Link
            href={`/repair-orders/${invoice.repairOrderId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("repairOrder")}
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          <Field label={t("number")}>{formatInvoiceNumber(invoice.series, invoice.number)}</Field>
          <Field label={t("issuedAt")}>{formatDate(invoice.issuedAt)}</Field>
          <Field label={t("customer")}>{invoice.customerName}</Field>
          <Field label={t("vehicle")}>{invoice.vehiclePlate ?? t("empty")}</Field>
          <Field label={t("sellerVatNumber")}>
            {registered ? (invoice.sellerVatNumber ?? t("empty")) : t("notRegistered")}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("lines.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">{t("lines.position")}</TableHead>
                <TableHead>{t("lines.type")}</TableHead>
                <TableHead>{t("lines.description")}</TableHead>
                <TableHead className="text-right">{t("lines.quantity")}</TableHead>
                <TableHead className="text-right">{t("lines.unitPrice")}</TableHead>
                {registered ? <TableHead className="text-right">{t("lines.vat")}</TableHead> : null}
                <TableHead className="text-right">{t("lines.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {line.position}
                  </TableCell>
                  <TableCell>{tType(line.type)}</TableCell>
                  <TableCell className="font-medium">{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.unitPrice, line.currency)}
                  </TableCell>
                  {registered ? (
                    <TableCell className="text-right tabular-nums">
                      {formatVatRate(line.vatRate)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(line.amount, line.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("totals.net")}</dt>
              <dd className="tabular-nums">{formatMoney(invoice.net, invoice.currency)}</dd>
            </div>
            {invoice.vat === null ? (
              // Not VAT-registered (ADR-0006): a true zero-VAT invoice — no VAT line.
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("totals.vat")}</dt>
                <dd className="text-muted-foreground">{t("totals.noVat")}</dd>
              </div>
            ) : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("totals.vat")}</dt>
                <dd className="tabular-nums">{formatMoney(invoice.vat, invoice.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <dt>{t("totals.gross")}</dt>
              <dd className="tabular-nums">{formatMoney(invoice.gross, invoice.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {settlement ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>{tPay("title")}</CardTitle>
            <Badge variant={paymentStatusVariant[settlement.status]}>
              {tPaymentStatus(settlement.status)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-0.5">
                <dt className="text-sm text-muted-foreground">{tPay("summary.gross")}</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(settlement.gross, settlement.currency)}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-sm text-muted-foreground">{tPay("summary.paid")}</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(settlement.totalPaid, settlement.currency)}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-sm text-muted-foreground">{tPay("summary.balance")}</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(settlement.balance, settlement.currency)}
                </dd>
              </div>
            </dl>

            {settlement.payments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tPay("date")}</TableHead>
                    <TableHead>{tPay("method")}</TableHead>
                    <TableHead>{tPay("note")}</TableHead>
                    <TableHead className="text-right">{tPay("amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlement.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(payment.createdAt)}
                      </TableCell>
                      <TableCell>{tMethod(payment.method)}</TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {payment.note ?? t("empty")}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{tPay("empty")}</p>
            )}

            {creditNote ? (
              <p className="text-sm text-muted-foreground">{tPay("credited")}</p>
            ) : (
              <RecordPaymentForm invoiceId={invoice.id} defaultAmount={defaultAmount} />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tCredit("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {creditNote ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">{tCredit("issued")}</p>
                <p className="font-medium">
                  {formatInvoiceNumber(creditNote.series, creditNote.number)} ·{" "}
                  {formatMoney(creditNote.gross, creditNote.currency)}
                </p>
                {creditNote.reason ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {creditNote.reason}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/credit-notes/${creditNote.id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {tCredit("view")}
              </Link>
            </div>
          ) : (
            <IssueCreditNoteForm invoiceId={invoice.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** One label/value pair in the identity grid. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
