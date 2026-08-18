import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_VAT_RATE, type VatConfig } from "@/lib/vat";
import { getScheduleConfigAction } from "./_actions/schedule-actions";
import { getVatConfigAction } from "./_actions/vat-actions";
import { ScheduleSettingsForm } from "./_components/schedule-settings-form";
import { VatSettingsForm } from "./_components/vat-settings-form";

/**
 * Location settings (GF-12, GF-20). Home of the per-Location VAT configuration
 * (ADR-0006), the working-schedule configuration, and the fiscal-device
 * disclosure: GarageFlow is not a касов апарат, so НАП/fiscal obligations remain
 * the shop's responsibility. This is where an owner onboards their VAT status
 * and working hours.
 */
export default async function SettingsPage() {
  const t = await getTranslations("settings");

  const [vatResult, scheduleResult] = await Promise.all([
    getVatConfigAction(),
    getScheduleConfigAction(),
  ]);
  if (!vatResult.ok && vatResult.error === "UNAUTHENTICATED") {
    redirect("/login");
  }
  // Fall back to the Location default (registered at the standard rate) if the
  // read fails for a non-auth reason, so the form is always editable.
  const vatConfig: VatConfig = vatResult.ok
    ? vatResult.data
    : { mode: "registered", rate: DEFAULT_VAT_RATE, vatNumber: null };
  // A failed schedule read falls back to the form's own defaults (Mon-Fri 09:00-18:00).
  const scheduleConfig = scheduleResult.ok ? scheduleResult.data : null;

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
          <VatSettingsForm config={vatConfig} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("schedule.title")}</CardTitle>
          <CardDescription>{t("schedule.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleSettingsForm config={scheduleConfig} />
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
