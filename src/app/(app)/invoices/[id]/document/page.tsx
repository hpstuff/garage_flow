import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  formatDate,
  formatInvoiceNumber,
  formatMoney,
  formatQuantity,
  formatVatRate,
} from "@/lib/format";
import { getInvoiceAction } from "../../_actions/invoice-actions";
import { PrintButton } from "./_components/print-button";

/**
 * Invoice document (GF-17) — the issued Invoice rendered as a proper Bulgarian
 * фактура, print- and download-ready (ADR-0008). It draws **only** the frozen
 * snapshot taken at issue (ADR-0002) via {@link getInvoiceAction}, never live
 * Repair Order data: gapless legal number, the seller's VAT identity or explicit
 * not-registered presentation (ADR-0006), the buyer, the priced lines, and the
 * VAT/zero-VAT totals. It deliberately omits the internal Diagnosis narrative —
 * that lives on the Work Card, not the legal document (ADR-0009).
 *
 * "Download" in the MVP is the browser's print-to-PDF (ADR-0006 keeps PDF/fiscal
 * generation out of scope): the toolbar and app chrome are `print:hidden`, so the
 * printout is a clean sheet. A 404 for an Invoice outside the caller's scope.
 */
export default async function InvoiceDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("invoices.document");
  const tType = await getTranslations("repairOrders.lineItems.types");
  const tLines = await getTranslations("invoices.lines");
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
  const number = formatInvoiceNumber(invoice.series, invoice.number);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Toolbar — never part of the printed фактура. */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/invoices/${invoice.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      {/* The фактура sheet. Forced light so it prints black-on-white regardless of the
          viewer's theme; a legal document must not depend on dark-mode tokens. */}
      <article className="space-y-8 rounded-lg border border-neutral-300 bg-white p-8 text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("type")}</h1>
            <p className="text-sm uppercase tracking-widest text-neutral-500">{t("original")}</p>
          </div>
          <dl className="space-y-1 text-right text-sm">
            <div>
              <dt className="inline text-neutral-500">{t("numberLabel")} </dt>
              <dd className="inline font-semibold tabular-nums">{number}</dd>
            </div>
            <div>
              <dt className="inline text-neutral-500">{t("issuedAt")}: </dt>
              <dd className="inline tabular-nums">{formatDate(invoice.issuedAt)}</dd>
            </div>
          </dl>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Party title={t("seller")}>
            <Row label={t("vatNumber")}>
              {registered ? (invoice.sellerVatNumber ?? t("empty")) : t("notRegistered")}
            </Row>
          </Party>
          <Party title={t("buyer")}>
            <Row label={t("customer")}>{invoice.customerName}</Row>
            <Row label={t("vehicle")}>{invoice.vehiclePlate ?? t("empty")}</Row>
          </Party>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-neutral-300 text-left">
              <th className="py-2 pr-2 text-right font-medium">{tLines("position")}</th>
              <th className="py-2 pr-2 font-medium">{tLines("type")}</th>
              <th className="py-2 pr-2 font-medium">{tLines("description")}</th>
              <th className="py-2 pr-2 text-right font-medium">{tLines("quantity")}</th>
              <th className="py-2 pr-2 text-right font-medium">{tLines("unitPrice")}</th>
              {registered ? (
                <th className="py-2 pr-2 text-right font-medium">{tLines("vat")}</th>
              ) : null}
              <th className="py-2 text-right font-medium">{tLines("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-2 text-right tabular-nums text-neutral-500">
                  {line.position}
                </td>
                <td className="py-2 pr-2">{tType(line.type)}</td>
                <td className="py-2 pr-2 font-medium">{line.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatQuantity(line.quantity)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatMoney(line.unitPrice, line.currency)}
                </td>
                {registered ? (
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {formatVatRate(line.vatRate)}
                  </td>
                ) : null}
                <td className="py-2 text-right font-medium tabular-nums">
                  {formatMoney(line.amount, line.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">{t("totals.taxBase")}</dt>
            <dd className="tabular-nums">{formatMoney(invoice.net, invoice.currency)}</dd>
          </div>
          {invoice.vat === null ? (
            // Not VAT-registered (ADR-0006): a true zero-VAT фактура — no VAT amount.
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t("totals.vat")}</dt>
              <dd className="text-neutral-500">{t("totals.noVat")}</dd>
            </div>
          ) : (
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t("totals.vat")}</dt>
              <dd className="tabular-nums">{formatMoney(invoice.vat, invoice.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-base font-semibold">
            <dt>{t("totals.total")}</dt>
            <dd className="tabular-nums">{formatMoney(invoice.gross, invoice.currency)}</dd>
          </div>
        </dl>

        <footer className="grid gap-8 border-t border-neutral-300 pt-8 text-sm sm:grid-cols-2">
          <Signature label={t("compiledBy")} note={t("signature")} />
          <Signature label={t("receivedBy")} note={t("signature")} />
        </footer>
      </article>
    </div>
  );
}

/** A party (seller/buyer) identity block on the фактура. */
function Party({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <dl className="space-y-0.5">{children}</dl>
    </section>
  );
}

/** One label/value line within a party block. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <dt className="inline text-neutral-500">{label}: </dt>
      <dd className="inline font-medium">{children}</dd>
    </div>
  );
}

/** A signature line (Съставил / Получил) at the foot of the фактура. */
function Signature({ label, note }: { label: string; note: string }) {
  return (
    <div className="space-y-6">
      <p className="text-neutral-500">{label}:</p>
      <p className="border-t border-neutral-400 pt-1 text-xs text-neutral-500">{note}</p>
    </div>
  );
}
