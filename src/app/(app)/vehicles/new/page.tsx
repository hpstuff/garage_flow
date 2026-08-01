import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listCustomersAction } from "../../customers/_actions/customer-actions";
import { VehicleForm } from "../_components/vehicle-form";

/**
 * Create a new Vehicle (GF-05). A Vehicle must belong to a Customer, so the
 * owner picker is populated from the current Location's Customers; with none
 * yet, we send the front desk to add a Customer first.
 */
export default async function NewVehiclePage() {
  const t = await getTranslations("vehicles.form");

  const owners = await listCustomersAction();
  if (!owners.ok) {
    if (owners.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const options = owners.data.map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("createTitle")}</h1>
      {options.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center text-muted-foreground">
            <p>{t("noOwners")}</p>
            <Link href="/customers/new" className={buttonVariants()}>
              {t("addOwner")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <VehicleForm owners={options} />
      )}
    </div>
  );
}
