import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listMechanicsAction } from "../../mechanics/_actions/mechanic-actions";
import { vehicleOptionLabel } from "../../repair-orders/_components/options";
import { listVehiclesAction } from "../../vehicles/_actions/vehicle-actions";
import { AppointmentForm } from "../_components/appointment-form";

/**
 * Book a new Appointment (GF-19). The Mechanic and Vehicle pickers are populated
 * from the current Location, but both are optional — a walk-in slot has none
 * (CONTEXT.md), so (unlike a Repair Order) an empty Vehicle list is not a blocker.
 * `?date=` preselects the day the agenda sent us from and where we return.
 */
export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const t = await getTranslations("appointments.form");
  const { date } = await searchParams;
  const defaultDate = isDateParam(date) ? date : todayParam();

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
      <AppointmentForm
        vehicles={vehicleOptions}
        mechanics={mechanicOptions}
        defaultDate={defaultDate}
      />
    </div>
  );
}

/** A well-formed `YYYY-MM-DD` day param, or a type guard rejecting anything else. */
function isDateParam(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Today as a local `YYYY-MM-DD` — the form's default day. */
function todayParam(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
