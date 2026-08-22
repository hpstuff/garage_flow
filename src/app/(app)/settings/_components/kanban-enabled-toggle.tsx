"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setKanbanEnabledAction } from "../_actions/kanban-actions";

/**
 * Standalone on/off switch for the whole Kanban board (GF-22). Lives outside the
 * board card so it stays reachable regardless of state — turning it off hides
 * the `/repair-orders/board` page and its nav entry from Settings, not just its
 * per-stage visibility. Mirrors {@link ScheduleEnabledToggle}'s optimistic-update
 * pattern.
 */
export function KanbanEnabledToggle({ enabled: initialEnabled }: { enabled: boolean }) {
  const t = useTranslations("settings.kanban");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onCheckedChange(checked: boolean) {
    setEnabled(checked);
    startTransition(async () => {
      const result = await setKanbanEnabledAction(checked);
      if (result.ok) {
        router.refresh();
      } else {
        // Revert the optimistic toggle if the write failed.
        setEnabled(!checked);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{t("enabled")}</p>
        <p className="text-sm text-muted-foreground">{t("enabledHint")}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={onCheckedChange} disabled={pending} />
    </div>
  );
}
