import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listMechanicsAction } from "../../mechanics/_actions/mechanic-actions";
import { listVehiclesAction } from "../../vehicles/_actions/vehicle-actions";
import { vehicleOptionLabel } from "../_components/options";
import { RepairOrderForm } from "../_components/repair-order-form";

/**
 * Open a new Repair Order (GF-08). A Repair Order is always about a Vehicle, so
 * the Vehicle picker is populated from the current Location; with none yet, we
 * send the front desk to add a Vehicle first. `?vehicleId=` preselects a Vehicle
 * — the speed-first path from the GF-06 search → Vehicle detail → new order. The
 * lead Mechanic is optional (ADR-0009). `?appointmentId=` links the order to the
 * booking it arrived for (GF-19) — the agenda's "open order" path.
 */
export default async function NewRepairOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; appointmentId?: string }>;
}) {
  const t = await getTranslations("repairOrders.form");
  const { vehicleId, appointmentId } = await searchParams;

  const [vehicles, mechanics] = await Promise.all([listVehiclesAction(), listMechanicsAction()]);
  if (!vehicles.ok) {
    if (vehicles.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }
  if (!mechanics.ok) {
    if (mechanics.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const vehicleOptions = vehicles.data.map((vehicle) => ({
    id: vehicle.id,
    label: vehicleOptionLabel(vehicle),
  }));
  const mechanicOptions = mechanics.data.map((mechanic) => ({
    id: mechanic.id,
    name: mechanic.name,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("createTitle")}</h1>
      {vehicleOptions.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center text-muted-foreground">
            <p>{t("noVehicles")}</p>
            <Link href="/vehicles/new" className={buttonVariants()}>
              {t("addVehicle")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <RepairOrderForm
          vehicles={vehicleOptions}
          mechanics={mechanicOptions}
          defaultVehicleId={vehicleId}
          appointmentId={appointmentId}
        />
      )}
    </div>
  );
}
