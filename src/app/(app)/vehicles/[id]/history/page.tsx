import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  invoiceStatusVariant,
  paymentStatusVariant,
} from "../../../repair-orders/_components/status";
import { getServiceHistoryAction } from "../../_actions/service-history-actions";

/**
 * Service History (GF-18) — the derived timeline of every Repair Order ever
 * performed on one Vehicle, newest first (CONTEXT.md). It is keyed by the Vehicle
 * (plate/VIN), so it spans every past owner and survives a resale; nothing is
 * stored, this is a live view over the Repair Orders. A 404 for a Vehicle outside
 * the caller's scope, never a cross-tenant read.
 */
export default async function VehicleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("vehicles.history");
  const tRO = await getTranslations("repairOrders");
  const { id } = await params;

  const result = await getServiceHistoryAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const history = result.data;
  const vehicleKey = history.vehiclePlate ?? history.vehicleVin ?? t("empty");
  const description = [history.vehicleMake, history.vehicleModel].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/vehicles/${history.vehicleId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t("back")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {[vehicleKey, description, history.customerName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link
          href={`/repair-orders/new?vehicleId=${history.vehicleId}`}
          className={buttonVariants()}
        >
          {t("newRepairOrder")}
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">{t("keyedNote")}</p>

      {history.entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("noEntries")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {history.entries.map((entry) => (
              <li key={entry.repairOrderId}>
                <Link
                  href={`/repair-orders/${entry.repairOrderId}`}
                  className="flex flex-col gap-2 px-4 py-3 hover:bg-accent hover:text-accent-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="block truncate text-sm font-medium">
                      {entry.complaint ?? tRO("detail.empty")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(entry.createdAt)}
                      {entry.mechanicName ? ` · ${entry.mechanicName}` : ""}
                    </span>
                  </div>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant="secondary">{tRO(`stage.${entry.stage}`)}</Badge>
                    <Badge variant={invoiceStatusVariant[entry.invoiceStatus]}>
                      {tRO(`invoiceStatus.${entry.invoiceStatus}`)}
                    </Badge>
                    <Badge variant={paymentStatusVariant[entry.paymentStatus]}>
                      {tRO(`paymentStatus.${entry.paymentStatus}`)}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
