import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listCustomersAction } from "../../../customers/_actions/customer-actions";
import { getVehicleAction } from "../../_actions/vehicle-actions";
import { VehicleForm } from "../../_components/vehicle-form";

/**
 * Edit an existing Vehicle (GF-05). Loads the scoped Vehicle server-side; a
 * Vehicle outside the caller's scope resolves to a 404, not a cross-tenant read.
 * The owner picker lists the Location's Customers so ownership can be reassigned.
 */
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("vehicles.form");
  const { id } = await params;

  const [vehicle, owners] = await Promise.all([getVehicleAction(id), listCustomersAction()]);
  if (!vehicle.ok) {
    if (vehicle.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }
  if (!owners.ok) {
    if (owners.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const options = owners.data.map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <VehicleForm vehicle={vehicle.data} owners={options} />
    </div>
  );
}
