"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KanbanStage } from "@/server/services/repair-order/service";
import { setHiddenStagesAction } from "../_actions/repair-order-actions";

type StageVisibilityMenuProps = {
  /** All six stages, in fixed order — the full set the Location chooses from. */
  stages: KanbanStage[];
  /** The stages currently hidden on this Location's board. */
  hidden: KanbanStage[];
};

/**
 * The show/hide-stages control on the Kanban board (GF-10). The stage set is
 * fixed — a Location can only hide stages it doesn't use, never add or reorder —
 * so this is a checklist of the six stages (checked = shown). Toggling one writes
 * the Location's new hidden set and refreshes the board. Items don't close the
 * menu on select, so several can be toggled in one pass.
 */
export function StageVisibilityMenu({ stages, hidden }: StageVisibilityMenuProps) {
  const t = useTranslations("repairOrders.board");
  const tStage = useTranslations("repairOrders.stage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hiddenSet, setHiddenSet] = useState<Set<KanbanStage>>(new Set(hidden));

  function onToggle(stage: KanbanStage, shown: boolean) {
    const next = new Set(hiddenSet);
    // Checked means "shown", so a checked box removes the stage from the hidden set.
    if (shown) {
      next.delete(stage);
    } else {
      next.add(stage);
    }
    setHiddenSet(next);

    startTransition(async () => {
      const result = await setHiddenStagesAction([...next]);
      if (result.ok) {
        router.refresh();
      } else {
        // Revert the optimistic toggle if the write failed.
        setHiddenSet(new Set(hiddenSet));
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {t("visibility")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("visibilityHint")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stages.map((stage) => (
          <DropdownMenuCheckboxItem
            key={stage}
            checked={!hiddenSet.has(stage)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggle(stage, checked)}
          >
            {tStage(stage)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
