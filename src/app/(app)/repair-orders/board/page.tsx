import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  type KanbanStage,
  type ScopedRepairOrder,
  TERMINAL_KANBAN_STAGE,
} from "@/server/services/repair-order/service";
import { getKanbanBoardAction } from "../_actions/repair-order-actions";
import { StageMover } from "../_components/stage-mover";
import { StageVisibilityMenu } from "../_components/stage-visibility-menu";
import { stageBadgeVariant } from "../_components/stages";

/**
 * Kanban board (GF-10) — the Repair Orders of the current Location laid out across
 * the six fixed stages (CONTEXT.md), in order. The front desk moves a car along
 * as work proceeds; `delivered` is terminal. A Location hides the stages it
 * doesn't use via the stage menu — it can never add or reorder them, since the set
 * is fixed. Stage is independent of invoice/payment status (ADR-0002).
 */
export default async function KanbanBoardPage() {
  const t = await getTranslations("repairOrders");
  const tBoard = await getTranslations("repairOrders.board");
  const tStage = await getTranslations("repairOrders.stage");

  const result = await getKanbanBoardAction();
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const board = result.data;
  // The full ordered set (for the hide menu) and the subset actually shown.
  const allStages = board.columns.map((column) => column.stage);
  const visibleColumns = board.columns.filter((column) => !column.hidden);
  const visibleStages = visibleColumns.map((column) => column.stage);
  const totalOrders = board.columns.reduce((sum, column) => sum + column.orders.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tBoard("title")}</h1>
          <p className="text-muted-foreground">{tBoard("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StageVisibilityMenu stages={allStages} hidden={board.hiddenStages} />
          <Link href="/repair-orders" className={buttonVariants({ variant: "outline" })}>
            {tBoard("list")}
          </Link>
          <Link href="/repair-orders/new" className={buttonVariants()}>
            {t("new")}
          </Link>
        </div>
      </div>

      {totalOrders === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {tBoard("empty")}
            <p className="mt-1 text-sm">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {visibleColumns.map((column) => (
            <section key={column.stage} className="flex w-72 shrink-0 flex-col gap-3">
              <header className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-semibold tracking-tight">{tStage(column.stage)}</h2>
                <Badge variant={stageBadgeVariant[column.stage]}>
                  {tBoard("count", { count: column.orders.length })}
                </Badge>
              </header>

              <div className="flex flex-col gap-3">
                {column.orders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    {tBoard("emptyColumn")}
                  </p>
                ) : (
                  column.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      stages={visibleStages}
                      terminal={column.stage === TERMINAL_KANBAN_STAGE}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** One Repair Order card in a stage column: the Vehicle, owner/mechanic, and the move control. */
function OrderCard({
  order,
  stages,
  terminal,
}: {
  order: ScopedRepairOrder;
  stages: KanbanStage[];
  terminal: boolean;
}) {
  const vehicleTitle = order.vehiclePlate ?? order.vehicleVin ?? "—";
  const description = [order.vehicleMake, order.vehicleModel].filter(Boolean).join(" ");

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="space-y-0.5">
          <Link href={`/repair-orders/${order.id}`} className="font-medium hover:underline">
            {vehicleTitle}
          </Link>
          <p className="text-xs text-muted-foreground">
            {[description, order.customerName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{order.mechanicName ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
        </div>
        <StageMover
          orderId={order.id}
          currentStage={order.stage}
          stages={stages}
          terminal={terminal}
        />
      </CardContent>
    </Card>
  );
}
