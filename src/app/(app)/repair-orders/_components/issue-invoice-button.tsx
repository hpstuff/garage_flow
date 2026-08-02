"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { issueInvoiceAction } from "../../invoices/_actions/invoice-actions";

/**
 * The "Issue invoice" control on a not-yet-invoiced Repair Order (GF-14). Issuing
 * freezes the Invoice and flips the RO's `invoice_status` (ADR-0002); on success it
 * navigates to the new document. A `CONFLICT` (already invoiced, or no Line Items)
 * surfaces inline, matching the board's stage-move error pattern.
 */
export function IssueInvoiceButton({ repairOrderId }: { repairOrderId: string }) {
  const t = useTranslations("repairOrders.detail");
  const tErr = useTranslations("invoices.issueError");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onIssue() {
    setError(null);
    startTransition(async () => {
      const result = await issueInvoiceAction(repairOrderId);
      if (result.ok) {
        router.push(`/invoices/${result.data.id}`);
        router.refresh();
        return;
      }
      // CONFLICT covers both "already invoiced" and "no line items"; everything
      // else (auth, not-found) shows the generic message.
      setError(result.error === "CONFLICT" ? tErr("conflict") : tErr("generic"));
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={onIssue} disabled={pending}>
        {pending ? t("issuingInvoice") : t("issueInvoice")}
      </Button>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
