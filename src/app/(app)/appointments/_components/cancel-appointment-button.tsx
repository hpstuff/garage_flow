"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAppointmentAction } from "../_actions/appointment-actions";

/**
 * Cancel one Appointment from the agenda (GF-19). Confirms first (a booking is not
 * lightly dropped), calls the server action, and refreshes the day so the row
 * flips to `cancelled` and stops raising conflicts. There is no hard delete — the
 * slot stays on the agenda as a record of what was called off (CONTEXT.md).
 */
export function CancelAppointmentButton({ id }: { id: string }) {
  const t = useTranslations("appointments");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onCancel() {
    if (!window.confirm(t("cancelConfirm"))) {
      return;
    }
    setPending(true);
    const result = await cancelAppointmentAction(id);
    if (result.ok) {
      router.refresh();
      return;
    }
    setPending(false);
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
      {t("cancel")}
    </Button>
  );
}
