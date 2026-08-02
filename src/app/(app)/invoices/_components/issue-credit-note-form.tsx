"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/server/domain/errors";
import { issueCreditNoteAction } from "../_actions/credit-note-actions";

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

/**
 * Issue-credit-note form on the Invoice page (GF-16). Issues a full Credit Note
 * against the Invoice — a corrective document that references it (ADR-0002) — with an
 * optional reason, then navigates to the new document. Issuing never edits the
 * Invoice, which stays immutable; a `CONFLICT` (already credited) surfaces inline.
 * Validation is authoritative in the service (ADR-0016); field errors surface inline.
 */
export function IssueCreditNoteForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoices.creditNote");
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const result = await issueCreditNoteAction({ invoiceId, reason });

    if (result.ok) {
      router.push(`/credit-notes/${result.data.id}`);
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    // CONFLICT means the Invoice already has a Credit Note; everything else
    // (auth, not-found) shows the generic message.
    setFormError(result.error === "CONFLICT" ? t("conflict") : t("error"));
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>

      <Field label={t("reason")} error={firstError(fieldErrors, "reason")}>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          rows={2}
        />
      </Field>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? t("issuing") : t("issue")}
      </Button>
    </form>
  );
}
