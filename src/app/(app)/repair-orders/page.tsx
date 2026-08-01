import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { ScopedRepairOrder } from "@/server/services/repair-order/service";
import { listRepairOrdersAction } from "./_actions/repair-order-actions";
import { invoiceStatusVariant, paymentStatusVariant } from "./_components/status";

/**
 * Repair Order list (GF-08) — the work records in the current Location, newest
 * first. From here the front desk opens a new order or drills into one. The
 * fastest path to a specific order is still the plate/VIN search (GF-06) →
 * Vehicle → its orders; this is the browse-all view.
 */
export default async function RepairOrdersPage() {
  const t = await getTranslations("repairOrders");

  const result = await listRepairOrdersAction();
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const orders = result.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/repair-orders/new" className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("empty")}
            <p className="mt-1 text-sm">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.vehicle")}</TableHead>
                <TableHead>{t("columns.owner")}</TableHead>
                <TableHead>{t("columns.mechanic")}</TableHead>
                <TableHead>{t("columns.invoice")}</TableHead>
                <TableHead>{t("columns.payment")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    <Link href={`/repair-orders/${order.id}`} className="hover:underline">
                      {vehicleTitle(order)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.mechanicName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoiceStatusVariant[order.invoiceStatus]}>
                      {t(`invoiceStatus.${order.invoiceStatus}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentStatusVariant[order.paymentStatus]}>
                      {t(`paymentStatus.${order.paymentStatus}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/** The Vehicle's everyday identifier for a table row — plate, else VIN, else a dash. */
function vehicleTitle(order: ScopedRepairOrder): string {
  return order.vehiclePlate ?? order.vehicleVin ?? "—";
}
