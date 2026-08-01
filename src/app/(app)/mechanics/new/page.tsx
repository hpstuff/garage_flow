import { getTranslations } from "next-intl/server";
import { MechanicForm } from "../_components/mechanic-form";

/** Create a new Mechanic (GF-07). The form posts through the create action. */
export default async function NewMechanicPage() {
  const t = await getTranslations("mechanics.form");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("createTitle")}</h1>
      <MechanicForm />
    </div>
  );
}
