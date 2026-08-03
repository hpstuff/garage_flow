"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { anonymizeCustomerAction } from "../_actions/customer-actions";

/**
 * Anonymize one Customer (GF-21, ADR-0004) — the right-to-erasure action. It is
 * irreversible (PII is stripped and the Vehicles unlinked), so it confirms first,
 * then calls the server action and refreshes the page so the section flips to the
 * "already anonymized" state. Issued Invoices are retained, untouched.
 */
export function AnonymizeCustomerButton({ id }: { id: string }) {
  const t = useTranslations("customers.anonymize");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onAnonymize() {
    if (!window.confirm(t("confirm"))) {
      return;
    }
    setPending(true);
    setError(false);
    const result = await anonymizeCustomerAction(id);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(true);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={onAnonymize}
      >
        {pending ? t("pending") : t("action")}
      </Button>
      {error ? <p className="text-sm text-destructive">{t("error")}</p> : null}
    </div>
  );
}
