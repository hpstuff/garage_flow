import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { DEFAULT_VAT_RATE, type VatConfig } from "@/lib/vat";
import { computeRepairOrderTotals } from "@/server/services/line-item/service";
import { getInvoiceForRepairOrderAction } from "../../invoices/_actions/invoice-actions";
import { listMechanicsAction } from "../../mechanics/_actions/mechanic-actions";
import { getVatConfigAction } from "../../settings/_actions/vat-actions";
import { listLineItemsAction } from "../_actions/line-item-actions";
import { getRepairOrderAction } from "../_actions/repair-order-actions";
import { IssueInvoiceButton } from "../_components/issue-invoice-button";
import { LineItemsEditor } from "../_components/line-items-editor";
import { stageBadgeVariant } from "../_components/stages";
import { invoiceStatusVariant, paymentStatusVariant } from "../_components/status";

/**
 * Repair Order detail (GF-08). Shows the Complaint and Diagnosis as distinct
 * fields (ADR-0009), the Vehicle and owner, the optional lead Mechanic, and the
 * invoice/payment references (ADR-0002) — the latter read-only here, since they
 * are set by GF-14/GF-15, never by editing the order. A 404 for an order outside
 * the caller's scope, never a cross-tenant read.
 */
export default async function RepairOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("repairOrders.detail");
  const tStatus = await getTranslations("repairOrders");
  const { id } = await params;

  const result = await getRepairOrderAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const order = result.data;
  const vehicleTitle = order.vehiclePlate ?? order.vehicleVin ?? t("empty");
  const vehicleDescription = [order.vehicleMake, order.vehicleModel].filter(Boolean).join(" ");

  // Line Items (GF-09) and the Mechanics they can attribute to. The RO total is
  // derived from the lines (ADR-0009), never from the lead Mechanic, under the
  // Location's VAT config (GF-12/ADR-0006) — a not-registered Location yields a
  // true zero-VAT total. A failed load degrades to an empty editor / default VAT
  // rather than 404-ing the whole order.
  const [itemsResult, mechanicsResult, vatResult] = await Promise.all([
    listLineItemsAction(order.id),
    listMechanicsAction(),
    getVatConfigAction(),
  ]);
  const lineItems = itemsResult.ok ? itemsResult.data : [];
  const mechanicOptions = mechanicsResult.ok
    ? mechanicsResult.data.map((mechanic) => ({ id: mechanic.id, name: mechanic.name }))
    : [];
  // On a failed VAT load, fall back to the Location default (registered at the
  // standard rate) rather than silently dropping VAT from a registered shop.
  const vatConfig: VatConfig = vatResult.ok
    ? vatResult.data
    : { mode: "registered", rate: DEFAULT_VAT_RATE, vatNumber: null };
  const totals = computeRepairOrderTotals(lineItems, vatConfig);

  // Invoicing (GF-14, ADR-0002). When the order is already invoiced, resolve the
  // issued Invoice so the header links straight to the frozen document; otherwise
  // it offers to issue one from the current Line Items.
  const invoiceResult =
    order.invoiceStatus === "invoiced" ? await getInvoiceForRepairOrderAction(order.id) : null;
  const issuedInvoice = invoiceResult?.ok ? invoiceResult.data : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href="/repair-orders" className="text-sm text-muted-foreground hover:underline">
            ← {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{vehicleTitle}</h1>
            <Badge variant={stageBadgeVariant[order.stage]}>
              {tStatus(`stage.${order.stage}`)}
            </Badge>
            <Badge variant={invoiceStatusVariant[order.invoiceStatus]}>
              {tStatus(`invoiceStatus.${order.invoiceStatus}`)}
            </Badge>
            <Badge variant={paymentStatusVariant[order.paymentStatus]}>
              {tStatus(`paymentStatus.${order.paymentStatus}`)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {[vehicleDescription, order.customerName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {order.invoiceStatus === "invoiced" ? (
            issuedInvoice ? (
              <Link
                href={`/invoices/${issuedInvoice.id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("viewInvoice")}
              </Link>
            ) : null
          ) : (
            <IssueInvoiceButton repairOrderId={order.id} />
          )}
          <Link
            href={`/repair-orders/${order.id}/work-card`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("workCard")}
          </Link>
          <Link
            href={`/repair-orders/${order.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("edit")}
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          <Detail label={t("vehicle")}>
            <Link href={`/vehicles/${order.vehicleId}`} className="hover:underline">
              {vehicleTitle}
            </Link>
          </Detail>
          <Detail label={t("owner")}>{order.customerName}</Detail>
          <Detail label={t("mechanic")}>{order.mechanicName ?? t("noLead")}</Detail>
          <Detail label={t("createdAt")}>{formatDate(order.createdAt)}</Detail>
          <Detail label={t("complaint")} full>
            {order.complaint ?? t("empty")}
          </Detail>
          <Detail label={t("diagnosis")} full>
            {order.diagnosis ?? t("empty")}
          </Detail>
        </CardContent>
      </Card>

      <LineItemsEditor
        repairOrderId={order.id}
        items={lineItems}
        totals={totals}
        mechanics={mechanicOptions}
        vatConfig={vatConfig}
      />
    </div>
  );
}

/** One label/value pair in the detail grid; `full` spans both columns for prose. */
function Detail({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "space-y-0.5 sm:col-span-2" : "space-y-0.5"}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
