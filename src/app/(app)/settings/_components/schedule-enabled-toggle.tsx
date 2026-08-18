"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setScheduleEnabledAction } from "../_actions/schedule-actions";

/**
 * Standalone on/off switch for the whole working-schedule feature (GF-20).
 * Lives outside the Schedule card so it stays reachable regardless of state —
 * turning it off removes the entire card (weekly hours + exceptions) from
 * Settings, not just its enforcement. Mirrors {@link StageVisibilityMenu}'s
 * optimistic-update pattern (`../../repair-orders/_components/stage-visibility-menu`).
 */
export function ScheduleEnabledToggle({ enabled: initialEnabled }: { enabled: boolean }) {
  const t = useTranslations("settings.schedule");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onCheckedChange(checked: boolean) {
    setEnabled(checked);
    startTransition(async () => {
      const result = await setScheduleEnabledAction(checked);
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
