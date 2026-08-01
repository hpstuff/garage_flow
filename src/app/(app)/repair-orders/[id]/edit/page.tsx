import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listMechanicsAction } from "../../../mechanics/_actions/mechanic-actions";
import { listVehiclesAction } from "../../../vehicles/_actions/vehicle-actions";
import { getRepairOrderAction } from "../../_actions/repair-order-actions";
import { vehicleOptionLabel } from "../../_components/options";
import { RepairOrderForm } from "../../_components/repair-order-form";

/**
 * Edit an existing Repair Order (GF-08). Loads the scoped order plus the Vehicle
 * and Mechanic pickers server-side; an order outside the caller's scope resolves
 * to a 404, not a cross-tenant read. The invoice/payment references are not
 * editable here — they belong to GF-14/GF-15 (ADR-0002).
 */
export default async function EditRepairOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("repairOrders.form");
  const { id } = await params;

  const [order, vehicles, mechanics] = await Promise.all([
    getRepairOrderAction(id),
    listVehiclesAction(),
    listMechanicsAction(),
  ]);

  if (!order.ok) {
    if (order.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }
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
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <RepairOrderForm
        repairOrder={order.data}
        vehicles={vehicleOptions}
        mechanics={mechanicOptions}
      />
    </div>
  );
}
