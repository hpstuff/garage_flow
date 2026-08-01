import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMechanicAction } from "../../_actions/mechanic-actions";
import { MechanicForm } from "../../_components/mechanic-form";

/**
 * Edit an existing Mechanic (GF-07). Loads the scoped Mechanic server-side; a
 * Mechanic outside the caller's scope resolves to a 404, not a cross-tenant read.
 */
export default async function EditMechanicPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("mechanics.form");
  const { id } = await params;

  const result = await getMechanicAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <MechanicForm mechanic={result.data} />
    </div>
  );
}
