import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { loadDashboard } from "./_actions/load-dashboard";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const result = await loadDashboard();

  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const { location, metrics } = result.data;
  const cards = [
    { key: "activeRepairOrders", value: metrics.activeRepairOrders },
    { key: "customers", value: metrics.customers },
    { key: "vehicles", value: metrics.vehicles },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("welcome", { location: location.name })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-2">
              <CardDescription>{t(`metrics.${card.key}`)}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatNumber(card.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">{t("empty")}</CardContent>
      </Card>
    </div>
  );
}
