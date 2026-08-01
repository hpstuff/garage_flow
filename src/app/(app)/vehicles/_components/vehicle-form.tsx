"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VehicleKind } from "@/server/db/schema";
import type { FieldErrors } from "@/server/domain/errors";
import type { ScopedVehicle } from "@/server/services/vehicle/service";
import {
  createVehicleAction,
  updateVehicleAction,
  type VehicleMutationResult,
} from "../_actions/vehicle-actions";

/** The owners the front desk can pick from — a minimal projection of Customer. */
export type OwnerOption = { id: string; name: string };

/** The edit target — absent when creating. `owners` populates the owner picker. */
type VehicleFormProps = { vehicle?: ScopedVehicle; owners: OwnerOption[] };

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

export function VehicleForm({ vehicle, owners }: VehicleFormProps) {
  const t = useTranslations("vehicles.form");
  const tKind = useTranslations("vehicles.kind");
  const router = useRouter();
  const isEdit = Boolean(vehicle);

  const [kind, setKind] = useState<VehicleKind>(vehicle?.kind ?? "car");
  const [customerId, setCustomerId] = useState(vehicle?.customerId ?? "");
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [vin, setVin] = useState(vehicle?.vin ?? "");
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
  const [color, setColor] = useState(vehicle?.color ?? "");
  const [note, setNote] = useState(vehicle?.note ?? "");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const values = { kind, customerId, plate, vin, make, model, year, color, note };
    const result: VehicleMutationResult = isEdit
      ? await updateVehicleAction({ id: vehicle?.id, ...values })
      : await createVehicleAction(values);

    if (result.ok) {
      router.push("/vehicles");
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    setFormError(result.error === "NOT_FOUND" ? t("notFound") : t("error"));
    setPending(false);
  }

  const ownerError = firstError(fieldErrors, "customerId");

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <fieldset className="space-y-2">
        <Label>{t("kind")}</Label>
        <RadioGroup
          className="flex gap-6"
          value={kind}
          onValueChange={(value) => setKind(value as VehicleKind)}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="kind-car" value="car" />
            <Label htmlFor="kind-car" className="font-normal">
              {tKind("car")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="kind-motorcycle" value="motorcycle" />
            <Label htmlFor="kind-motorcycle" className="font-normal">
              {tKind("motorcycle")}
            </Label>
          </div>
        </RadioGroup>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="owner">{t("owner")}</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger id="owner" aria-invalid={Boolean(ownerError)}>
            <SelectValue placeholder={t("ownerPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("ownerHint")}</p>
        {ownerError ? <p className="text-sm font-medium text-destructive">{ownerError}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("plate")} error={firstError(fieldErrors, "plate")}>
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            className="uppercase"
            autoFocus
          />
        </Field>
        <Field label={t("vin")} error={firstError(fieldErrors, "vin")}>
          <Input value={vin} onChange={(e) => setVin(e.target.value)} className="uppercase" />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("make")} error={firstError(fieldErrors, "make")}>
          <Input value={make} onChange={(e) => setMake(e.target.value)} />
        </Field>
        <Field label={t("model")} error={firstError(fieldErrors, "model")}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("year")} error={firstError(fieldErrors, "year")}>
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            type="number"
            inputMode="numeric"
            min={1900}
          />
        </Field>
        <Field label={t("color")} error={firstError(fieldErrors, "color")}>
          <Input value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
      </div>

      <Field label={t("note")} description={t("noteHint")} error={firstError(fieldErrors, "note")}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
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
        <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
