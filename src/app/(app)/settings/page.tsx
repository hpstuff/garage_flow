import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_VAT_RATE, type VatConfig } from "@/lib/vat";
import { getVatConfigAction } from "./_actions/vat-actions";
import { VatSettingsForm } from "./_components/vat-settings-form";

/**
 * Location settings (GF-12). Home of the per-Location VAT configuration
 * (ADR-0006) and the fiscal-device disclosure: GarageFlow is not a касов апарат,
 * so НАП/fiscal obligations remain the shop's responsibility. This is where an
 * owner onboards their VAT status.
 */
export default async function SettingsPage() {
  const t = await getTranslations("settings");

  const result = await getVatConfigAction();
  if (!result.ok && result.error === "UNAUTHENTICATED") {
    redirect("/login");
  }
  // Fall back to the Location default (registered at the standard rate) if the
  // read fails for a non-auth reason, so the form is always editable.
  const config: VatConfig = result.ok
    ? result.data
    : { mode: "registered", rate: DEFAULT_VAT_RATE, vatNumber: null };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("vat.title")}</CardTitle>
          <CardDescription>{t("vat.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <VatSettingsForm config={config} />
        </CardContent>
      </Card>

      <Card className="border-accent-orange/40 bg-accent-orange/5">
        <CardHeader>
          <CardTitle>{t("fiscal.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t("fiscal.body")}</p>
          <p>{t("fiscal.responsibility")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
