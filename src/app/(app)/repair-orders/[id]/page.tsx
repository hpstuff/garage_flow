import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatTime } from "@/lib/format";
import { DEFAULT_VAT_RATE, type VatConfig } from "@/lib/vat";
import { computeRepairOrderTotals } from "@/server/services/line-item/service";
import { SetBreadcrumb } from "../../_components/set-breadcrumb";
import { getAppointmentAction } from "../../appointments/_actions/appointment-actions";
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
 * Repair Order detail (GF-08). The Vehicle and owner are already in the header
 * (H1 links to the Vehicle, the subtitle names the owner), so the detail card
 * only adds what the header doesn't: the Complaint and Diagnosis as distinct
 * fields (ADR-0009), the optional lead Mechanic, and the invoice/payment
 * references (ADR-0002) — the latter read-only here, since they are set by
 * GF-14/GF-15, never by editing the order. A 404 for an order outside the
 * caller's scope, never a cross-tenant read.
 */
export default async function RepairOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("repairOrders.detail");
  const tStatus = await getTranslations("repairOrders");
  const tNav = await getTranslations("nav");
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
    ? mechanicsResult.data.map((m) => ({ id: m.id, name: m.name, hourlyRateMinor: m.hourlyRate }))
    : [];
  // On a failed VAT load, fall back to the Location default (registered at the
  // standard rate) rather than silently dropping VAT from a registered shop.
  const vatConfig: VatConfig = vatResult.ok
    ? vatResult.data
    : { mode: "registered", rate: DEFAULT_VAT_RATE, vatNumber: null };
  const totals = computeRepairOrderTotals(lineItems, vatConfig);

  // Invoicing (GF-14, ADR-0002). When the order already has an Invoice — still
  // `invoiced`, or `credited` once a Credit Note voided it (GF-16) — resolve it so
  // the header links straight to the frozen document; otherwise it offers to issue
  // one from the current Line Items.
  const invoiceResult =
    order.invoiceStatus !== "not_invoiced" ? await getInvoiceForRepairOrderAction(order.id) : null;
  const issuedInvoice = invoiceResult?.ok ? invoiceResult.data : null;

  // The booking this visit arrived for (GF-19), when the order was opened from the
  // agenda. Read-only here; links back to that day's agenda.
  const appointmentResult = order.appointmentId
    ? await getAppointmentAction(order.appointmentId)
    : null;
  const appointment = appointmentResult?.ok ? appointmentResult.data : null;

  return (
    <div className="space-y-4">
      <SetBreadcrumb
        segments={[
          { label: tNav("repairOrders"), href: "/repair-orders" },
          { label: vehicleTitle },
        ]}
      />
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              <Link href={`/vehicles/${order.vehicleId}`} className="hover:underline">
                {vehicleTitle}
              </Link>
            </h1>
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
          {order.invoiceStatus !== "not_invoiced" ? (
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
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label={t("mechanic")}>{order.mechanicName ?? t("noLead")}</Detail>
            <Detail label={t("createdAt")}>{formatDate(order.createdAt)}</Detail>
            {appointment ? (
              <Detail label={t("appointment")}>
                <Link
                  href={`/appointments?date=${toDayParam(appointment.startsAt)}`}
                  className="hover:underline"
                >
                  {formatDate(appointment.startsAt)} · {formatTime(appointment.startsAt)}
                </Link>
              </Detail>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label={t("complaint")}>{order.complaint ?? t("empty")}</Detail>
            <Detail label={t("diagnosis")}>{order.diagnosis ?? t("empty")}</Detail>
          </div>
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

/** A Date as a local `YYYY-MM-DD` day param — links the linked Appointment to its agenda day. */
function toDayParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** One label/value pair in the detail grid. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
