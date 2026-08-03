import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isAnonymized } from "@/server/services/customer/service";
import { getCustomerAction } from "../../_actions/customer-actions";
import { AnonymizeCustomerButton } from "../../_components/anonymize-customer-button";
import { CustomerForm } from "../../_components/customer-form";

/**
 * Edit an existing Customer (GF-04). Loads the scoped Customer server-side; a
 * Customer outside the caller's scope resolves to a 404, not a cross-tenant read.
 * Also hosts the **Anonymization** action (GF-21, ADR-0004): the right-to-erasure
 * control while the Customer is live, or a note once it has been anonymized.
 */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("customers.form");
  const tErase = await getTranslations("customers.anonymize");
  const { id } = await params;

  const result = await getCustomerAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const anonymized = isAnonymized(result.data);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <CustomerForm customer={result.data} />

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{tErase("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {anonymized ? tErase("done") : tErase("description")}
          </p>
        </div>
        {anonymized ? null : <AnonymizeCustomerButton id={result.data.id} />}
      </section>
    </div>
  );
}
