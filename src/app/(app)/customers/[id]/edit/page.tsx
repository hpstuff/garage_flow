import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCustomerAction } from "../../_actions/customer-actions";
import { CustomerForm } from "../../_components/customer-form";

/**
 * Edit an existing Customer (GF-04). Loads the scoped Customer server-side; a
 * Customer outside the caller's scope resolves to a 404, not a cross-tenant read.
 */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("customers.form");
  const { id } = await params;

  const result = await getCustomerAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <CustomerForm customer={result.data} />
    </div>
  );
}
