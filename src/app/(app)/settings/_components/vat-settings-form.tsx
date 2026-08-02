"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DEFAULT_VAT_RATE_PERCENT, type VatConfig, type VatMode } from "@/lib/vat";
import type { FieldErrors } from "@/server/domain/errors";
import { setVatConfigAction } from "../_actions/vat-actions";

/** Render a stored config back into the form's editable fields. */
function initialState(config: VatConfig) {
  return {
    mode: config.mode,
    rate:
      config.mode === "registered" ? String(config.rate / 100) : String(DEFAULT_VAT_RATE_PERCENT),
    vatNumber: config.mode === "registered" ? (config.vatNumber ?? "") : "",
  };
}

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

/**
 * VAT configuration form (GF-12, ADR-0006). VAT is a per-Location setting:
 * `registered` charges VAT at a configurable rate; `not_registered` issues
 * invoices with no VAT at all. The rate and ДДС number only apply when registered,
 * so they are hidden otherwise.
 */
export function VatSettingsForm({ config }: { config: VatConfig }) {
  const t = useTranslations("settings.vat");

  const initial = initialState(config);
  const [mode, setMode] = useState<VatMode>(initial.mode);
  const [rate, setRate] = useState(initial.rate);
  const [vatNumber, setVatNumber] = useState(initial.vatNumber);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);
    setSaved(false);

    const result = await setVatConfigAction({ mode, rate, vatNumber });

    if (result.ok) {
      setSaved(true);
      setPending(false);
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    setFormError(t("error"));
    setPending(false);
  }

  const isRegistered = mode === "registered";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("mode")}</legend>
        <RadioGroup
          value={mode}
          onValueChange={(value) => {
            setMode(value as VatMode);
            setSaved(false);
          }}
        >
          <label
            htmlFor="vat-mode-registered"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-primary"
          >
            <RadioGroupItem value="registered" id="vat-mode-registered" className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("registered.label")}</span>
              <span className="block text-sm text-muted-foreground">{t("registered.hint")}</span>
            </span>
          </label>
          <label
            htmlFor="vat-mode-not-registered"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-primary"
          >
            <RadioGroupItem
              value="not_registered"
              id="vat-mode-not-registered"
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("notRegistered.label")}</span>
              <span className="block text-sm text-muted-foreground">{t("notRegistered.hint")}</span>
            </span>
          </label>
        </RadioGroup>
      </fieldset>

      {isRegistered ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("rate")}
            description={t("rateHint")}
            error={firstError(fieldErrors, "rate")}
          >
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          <Field
            label={t("vatNumber")}
            description={t("vatNumberHint")}
            error={firstError(fieldErrors, "vatNumber")}
          >
            <Input
              value={vatNumber}
              onChange={(e) => {
                setVatNumber(e.target.value);
                setSaved(false);
              }}
              placeholder={t("vatNumberPlaceholder")}
            />
          </Field>
        </div>
      ) : null}

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-accent-green" role="status">
          {t("saved")}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
