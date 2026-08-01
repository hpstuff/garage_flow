"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KanbanStage } from "@/server/services/repair-order/service";
import { moveRepairOrderStageAction } from "../_actions/repair-order-actions";

type StageMoverProps = {
  orderId: string;
  /** The order's current stage — the picker opens on it. */
  currentStage: KanbanStage;
  /** The stages this order can sit in (the board's visible stages, in fixed order). */
  stages: KanbanStage[];
  /** True when the order is in the terminal stage — it shows a marker, not a picker. */
  terminal: boolean;
};

/**
 * The per-card stage control on the Kanban board (GF-10). A terminal (`delivered`)
 * order is a dead end, so it shows a static marker instead of a picker. Otherwise
 * the picker sits on the current stage and choosing another one moves the order
 * and refreshes the board; a failed move (e.g. the order was delivered meanwhile)
 * surfaces inline.
 */
export function StageMover({ orderId, currentStage, stages, terminal }: StageMoverProps) {
  const t = useTranslations("repairOrders.board");
  const tStage = useTranslations("repairOrders.stage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (terminal) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("terminal")}
      </Badge>
    );
  }

  function onMove(stage: string) {
    // Radix fires only on a real change, so this is always a move to a new stage.
    setError(false);
    startTransition(async () => {
      const result = await moveRepairOrderStageAction(orderId, stage as KanbanStage);
      if (result.ok) {
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-1">
      <Select value={currentStage} onValueChange={onMove} disabled={pending || stages.length <= 1}>
        <SelectTrigger className="h-8 text-xs" aria-label={t("move")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage} value={stage}>
              {tStage(stage)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t("moveError")}
        </p>
      ) : null}
    </div>
  );
}
