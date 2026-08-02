"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/server/domain/errors";
import type { ScopedRepairOrder } from "@/server/services/repair-order/service";
import {
  createRepairOrderAction,
  type RepairOrderMutationResult,
  updateRepairOrderAction,
} from "../_actions/repair-order-actions";

/** A Vehicle the order can be opened against — a pre-labelled projection. */
export type VehicleOption = { id: string; label: string };
/** A Mechanic that can be the optional lead. */
export type MechanicOption = { id: string; name: string };

type RepairOrderFormProps = {
  /** The edit target — absent when creating. */
  repairOrder?: ScopedRepairOrder;
  vehicles: VehicleOption[];
  mechanics: MechanicOption[];
  /** Preselect a Vehicle when creating (e.g. arriving from the Vehicle detail page). */
  defaultVehicleId?: string;
  /**
   * Link this new order to an Appointment (GF-19) — set when the front desk opens
   * the order from the agenda on arrival. Create-only: carried on the create call,
   * never on edit, so it can only ever be set once.
   */
  appointmentId?: string;
};

/** Radix Select forbids an empty item value, so "no lead" needs a sentinel. */
const NO_LEAD = "none";

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

export function RepairOrderForm({
  repairOrder,
  vehicles,
  mechanics,
  defaultVehicleId,
  appointmentId,
}: RepairOrderFormProps) {
  const t = useTranslations("repairOrders.form");
  const router = useRouter();
  const isEdit = Boolean(repairOrder);

  const [vehicleId, setVehicleId] = useState(repairOrder?.vehicleId ?? defaultVehicleId ?? "");
  const [mechanicId, setMechanicId] = useState(repairOrder?.mechanicId ?? "");
  const [complaint, setComplaint] = useState(repairOrder?.complaint ?? "");
  const [diagnosis, setDiagnosis] = useState(repairOrder?.diagnosis ?? "");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const values = { vehicleId, mechanicId, complaint, diagnosis };
    const result: RepairOrderMutationResult = isEdit
      ? await updateRepairOrderAction({ id: repairOrder?.id, ...values })
      : await createRepairOrderAction({ ...values, appointmentId });

    if (result.ok) {
      router.push(`/repair-orders/${result.data.id}`);
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    setFormError(result.error === "NOT_FOUND" ? t("notFound") : t("error"));
    setPending(false);
  }

  const vehicleError = firstError(fieldErrors, "vehicleId");

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      {!isEdit && appointmentId ? (
        <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          {t("appointmentLinked")}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="vehicle">{t("vehicle")}</Label>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger id="vehicle" aria-invalid={Boolean(vehicleError)}>
            <SelectValue placeholder={t("vehiclePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((vehicle) => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("vehicleHint")}</p>
        {vehicleError ? (
          <p className="text-sm font-medium text-destructive">{vehicleError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mechanic">{t("mechanic")}</Label>
        <Select
          value={mechanicId === "" ? NO_LEAD : mechanicId}
          onValueChange={(value) => setMechanicId(value === NO_LEAD ? "" : value)}
        >
          <SelectTrigger id="mechanic">
            <SelectValue placeholder={t("mechanicPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LEAD}>{t("noLead")}</SelectItem>
            {mechanics.map((mechanic) => (
              <SelectItem key={mechanic.id} value={mechanic.id}>
                {mechanic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("mechanicHint")}</p>
      </div>

      <Field
        label={t("complaint")}
        description={t("complaintHint")}
        error={firstError(fieldErrors, "complaint")}
      >
        <Textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          rows={3}
          placeholder={t("complaintPlaceholder")}
        />
      </Field>

      <Field
        label={t("diagnosis")}
        description={t("diagnosisHint")}
        error={firstError(fieldErrors, "diagnosis")}
      >
        <Textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          rows={3}
          placeholder={t("diagnosisPlaceholder")}
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
        <Link href="/repair-orders" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
