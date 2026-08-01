import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <Link
          href={`/vehicles/${vehicle.id}/edit`}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("edit")}
        </Link>
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
