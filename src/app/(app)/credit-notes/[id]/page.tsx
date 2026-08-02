import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
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
import { getCreditNoteAction } from "../../invoices/_actions/credit-note-actions";

/**
 * Credit Note (GF-16) — the corrective legal document that adjusts an already-issued
 * Invoice (ADR-0002), **frozen at issue** like the Invoice itself. Everything shown
 * is the snapshot taken when the Credit Note was issued, copied from the corrected
 * Invoice; the original Invoice is never changed. A not-registered Location's
 * correction carries no VAT at all (ADR-0006). A 404 for a Credit Note outside the
 * caller's scope, never a cross-tenant read.
 */
export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("creditNotes");
  const tType = await getTranslations("repairOrders.lineItems.types");
  const { id } = await params;

  const result = await getCreditNoteAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const note = result.data;
  const registered = note.vatMode === "registered";
  const invoiceNumber = formatInvoiceNumber(note.invoiceSeries, note.invoiceNumber);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/invoices/${note.invoiceId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t("back")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title", { number: formatInvoiceNumber(note.series, note.number) })}
          </h1>
          <p className="text-muted-foreground">
            {t("correctiveTo", { number: invoiceNumber })} · {formatDate(note.issuedAt)}
          </p>
        </div>
        <Link
          href={`/invoices/${note.invoiceId}`}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("invoice")}
        </Link>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          <Field label={t("number")}>{formatInvoiceNumber(note.series, note.number)}</Field>
          <Field label={t("issuedAt")}>{formatDate(note.issuedAt)}</Field>
          <Field label={t("invoiceNumber")}>
            <Link href={`/invoices/${note.invoiceId}`} className="hover:underline">
              {invoiceNumber}
            </Link>
          </Field>
          <Field label={t("customer")}>{note.customerName}</Field>
          <Field label={t("vehicle")}>{note.vehiclePlate ?? t("empty")}</Field>
          <Field label={t("sellerVatNumber")}>
            {registered ? (note.sellerVatNumber ?? t("empty")) : t("notRegistered")}
          </Field>
          {note.reason ? (
            <Field label={t("reason")} full>
              {note.reason}
            </Field>
          ) : null}
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
              {note.lines.map((line) => (
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
              <dd className="tabular-nums">{formatMoney(note.net, note.currency)}</dd>
            </div>
            {note.vat === null ? (
              // The corrected Invoice carried no VAT (ADR-0006): a true zero-VAT correction.
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("totals.vat")}</dt>
                <dd className="text-muted-foreground">{t("totals.noVat")}</dd>
              </div>
            ) : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("totals.vat")}</dt>
                <dd className="tabular-nums">{formatMoney(note.vat, note.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <dt>{t("totals.gross")}</dt>
              <dd className="tabular-nums">{formatMoney(note.gross, note.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/** One label/value pair in the identity grid; `full` spans both columns for prose. */
function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "space-y-0.5 sm:col-span-2" : "space-y-0.5"}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
