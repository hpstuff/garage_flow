import { getTranslations } from "next-intl/server";
import { CustomerForm } from "../_components/customer-form";

/** Create a new Customer (GF-04). The form posts through the create action. */
export default async function NewCustomerPage() {
  const t = await getTranslations("customers.form");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("createTitle")}</h1>
      <CustomerForm />
    </div>
  );
}
