"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentMethod } from "@/server/db/schema";
import type { FieldErrors } from "@/server/domain/errors";
import { recordPaymentAction } from "../_actions/payment-actions";

/** The fixed method options, mirrored here so the client bundle never pulls in the DB schema. */
const METHOD_OPTIONS: readonly PaymentMethod[] = ["cash", "card", "bank_transfer"];

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

/**
 * Record-payment form on the Invoice page (GF-15). Records a Payment against the
 * Invoice — partial payments sum toward the total (ADR-0002) — then refreshes so the
 * server re-renders the fresh balance, status and Payment list. The amount defaults
 * to the outstanding balance, the common "settle it in full" case, but is editable
 * for a partial payment. Validation is authoritative in the service (ADR-0016);
 * field errors surface inline.
 */
export function RecordPaymentForm({
  invoiceId,
  defaultAmount,
}: {
  invoiceId: string;
  defaultAmount: string;
}) {
  const t = useTranslations("invoices.payments");
  const tMethod = useTranslations("invoices.payments.methods");
  const router = useRouter();

  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const result = await recordPaymentAction({ invoiceId, amount, method, note });

    if (result.ok) {
      setNote("");
      setAmount("");
      setPending(false);
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    setFormError(result.error === "NOT_FOUND" ? t("notFound") : t("error"));
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("amount")} error={firstError(fieldErrors, "amount")}>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountPlaceholder")}
          />
        </Field>

        <div className="space-y-1.5">
          <Label htmlFor="payment-method">{t("method")}</Label>
          <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
            <SelectTrigger id="payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {tMethod(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Field label={t("note")} error={firstError(fieldErrors, "note")}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
        />
      </Field>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("recording") : t("record")}
      </Button>
    </form>
  );
}
