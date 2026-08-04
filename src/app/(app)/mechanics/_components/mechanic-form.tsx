"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/server/domain/errors";
import type { ScopedMechanic } from "@/server/services/mechanic/service";
import {
  createMechanicAction,
  type MechanicMutationResult,
  updateMechanicAction,
} from "../_actions/mechanic-actions";

/** The edit target — absent when creating. */
type MechanicFormProps = { mechanic?: ScopedMechanic };

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

export function MechanicForm({ mechanic }: MechanicFormProps) {
  const t = useTranslations("mechanics.form");
  const router = useRouter();
  const isEdit = Boolean(mechanic);

  const [name, setName] = useState(mechanic?.name ?? "");
  const [note, setNote] = useState(mechanic?.note ?? "");
  // Convert stored minor-units back to human BGN string for the form.
  const [hourlyRate, setHourlyRate] = useState(
    mechanic && mechanic.hourlyRate != null ? String(mechanic.hourlyRate / 100) : "",
  );

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    // Convert form string → minor-units number; blank stays undefined (service coerces to 0).
    const hourlyRateValue = hourlyRate.trim() !== "" ? Number(hourlyRate) : undefined;
    const values = { name, note, ...(hourlyRateValue != null && { hourlyRate: hourlyRateValue }) };
    const result: MechanicMutationResult = isEdit
      ? await updateMechanicAction({ id: mechanic?.id, ...values })
      : await createMechanicAction(values);

    if (result.ok) {
      router.push("/mechanics");
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
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <Field label={t("name")} error={firstError(fieldErrors, "name")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          required
          autoFocus
        />
      </Field>

      <Field label={t("note")} description={t("noteHint")} error={firstError(fieldErrors, "note")}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Field>

      <Field
        label={t("hourlyRate")}
        description={t("hourlyRateHint")}
        error={firstError(fieldErrors, "hourlyRate")}
      >
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
      </Field>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Link href="/mechanics" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
