import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadDashboard } from "./_actions/load-dashboard";
import { OrdersByStageChart } from "./_components/orders-by-stage-chart";

const METRIC_TINTS = {
  activeRepairOrders: "bg-tint-blue",
  customers: "bg-tint-lavender",
  vehicles: "bg-accent-green/20",
} as const;

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tStage = await getTranslations("repairOrders.stage");
  const result = await loadDashboard();

  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const { location, metrics, ordersByStage } = result.data;
  const cards = [
    { key: "activeRepairOrders", value: metrics.activeRepairOrders },
    { key: "customers", value: metrics.customers },
    { key: "vehicles", value: metrics.vehicles },
  ] as const;
  const totalOrders = ordersByStage.reduce((sum, { count }) => sum + count, 0);
  const stageChartData = ordersByStage
    .filter(({ count }) => count > 0)
    .map(({ stage, count }) => ({ name: tStage(stage), value: count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("welcome", { location: location.name })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key} className={cn("border-none", METRIC_TINTS[card.key])}>
            <CardHeader className="pb-2">
              <CardDescription>{t(`metrics.${card.key}`)}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatNumber(card.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {totalOrders > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("stageChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersByStageChart data={stageChartData} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
