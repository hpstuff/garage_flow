import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { listRepairOrdersAction } from "../../repair-orders/_actions/repair-order-actions";
import { invoiceStatusVariant, paymentStatusVariant } from "../../repair-orders/_components/status";
import { getVehicleAction } from "../_actions/vehicle-actions";

/**
 * Vehicle detail (GF-06) — where the fast plate/VIN search lands. Shows the
 * Vehicle and its current owner within the Location scope; a Vehicle outside the
 * caller's scope resolves to a 404, never a cross-tenant read. This is the
 * Vehicle surface the front desk reaches, and the future home of its Repair
 * Order (GF-07+).
 */
export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("vehicles.detail");
  const tKind = await getTranslations("vehicles.kind");
  const { id } = await params;

  const result = await getVehicleAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const vehicle = result.data;
  const title = vehicle.plate ?? vehicle.vin ?? t("empty");
  const description = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");

  const tRO = await getTranslations("repairOrders");
  const ordersResult = await listRepairOrdersAction(vehicle.id);
  const orders = ordersResult.ok ? ordersResult.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href="/vehicles" className="text-sm text-muted-foreground hover:underline">
            ← {t("back")}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <Badge variant={vehicle.kind === "motorcycle" ? "info" : "secondary"}>
              {tKind(vehicle.kind)}
            </Badge>
          </div>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex shrink-0 gap-3">
          <Link href={`/repair-orders/new?vehicleId=${vehicle.id}`} className={buttonVariants()}>
            {t("newRepairOrder")}
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("edit")}
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          <Detail label={t("owner")}>{vehicle.customerName}</Detail>
          <Detail label={t("plate")}>{vehicle.plate ?? t("empty")}</Detail>
          <Detail label={t("vin")}>{vehicle.vin ?? t("empty")}</Detail>
          <Detail label={t("make")}>{vehicle.make ?? t("empty")}</Detail>
          <Detail label={t("model")}>{vehicle.model ?? t("empty")}</Detail>
          <Detail label={t("year")}>{vehicle.year ?? t("empty")}</Detail>
          <Detail label={t("color")}>{vehicle.color ?? t("empty")}</Detail>
          {vehicle.note ? <Detail label={t("note")}>{vehicle.note}</Detail> : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{t("repairOrders")}</h2>
          <Link
            href={`/vehicles/${vehicle.id}/history`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {t("serviceHistory")} →
          </Link>
        </div>
        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("noRepairOrders")}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/repair-orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="text-sm font-medium">
                      {order.complaint ?? tRO("detail.empty")}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={invoiceStatusVariant[order.invoiceStatus]}>
                        {tRO(`invoiceStatus.${order.invoiceStatus}`)}
                      </Badge>
                      <Badge variant={paymentStatusVariant[order.paymentStatus]}>
                        {tRO(`paymentStatus.${order.paymentStatus}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

/** One label/value pair in the detail grid. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
