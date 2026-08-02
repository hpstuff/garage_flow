"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/server/domain/errors";
import {
  type AppointmentMutationResult,
  createAppointmentAction,
} from "../_actions/appointment-actions";

/** A Vehicle the slot can be booked for — a pre-labelled projection. */
export type VehicleOption = { id: string; label: string };
/** A Mechanic the slot can reserve. */
export type MechanicOption = { id: string; name: string };

type AppointmentFormProps = {
  vehicles: VehicleOption[];
  mechanics: MechanicOption[];
  /** The day the agenda sent us from — preselects the date and where we return. */
  defaultDate: string;
};

/** Radix Select forbids an empty item value, so "none" needs a sentinel. */
const NONE = "none";

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

/**
 * Book an Appointment (GF-19). A slot is, at minimum, a day and a start/end time;
 * the Mechanic, bay, Vehicle and caller name are all optional — a walk-in has none
 * (CONTEXT.md). The date and the two times are combined into the local instants
 * the service validates (`endsAt` must be after `startsAt`).
 */
export function AppointmentForm({ vehicles, mechanics, defaultDate }: AppointmentFormProps) {
  const t = useTranslations("appointments.form");
  const router = useRouter();

  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("10:00");
  const [mechanicId, setMechanicId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [bay, setBay] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const result: AppointmentMutationResult = await createAppointmentAction({
      // Combine the day with each time into a local instant the service parses.
      startsAt: `${date}T${startsAt}`,
      endsAt: `${date}T${endsAt}`,
      mechanicId,
      vehicleId,
      bay,
      customerName,
      note,
    });

    if (result.ok) {
      router.push(`/appointments?date=${date}`);
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
      <Field label={t("date")} error={firstError(fieldErrors, "startsAt")}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t("startsAt")} error={firstError(fieldErrors, "startsAt")}>
          <Input
            type="time"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </Field>
        <Field label={t("endsAt")} error={firstError(fieldErrors, "endsAt")}>
          <Input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mechanic">{t("mechanic")}</Label>
        <Select
          value={mechanicId === "" ? NONE : mechanicId}
          onValueChange={(value) => setMechanicId(value === NONE ? "" : value)}
        >
          <SelectTrigger id="mechanic">
            <SelectValue placeholder={t("mechanicPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noMechanic")}</SelectItem>
            {mechanics.map((mechanic) => (
              <SelectItem key={mechanic.id} value={mechanic.id}>
                {mechanic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("mechanicHint")}</p>
      </div>

      <Field label={t("bay")} description={t("bayHint")} error={firstError(fieldErrors, "bay")}>
        <Input value={bay} onChange={(e) => setBay(e.target.value)} />
      </Field>

      <div className="space-y-1.5">
        <Label htmlFor="vehicle">{t("vehicle")}</Label>
        <Select
          value={vehicleId === "" ? NONE : vehicleId}
          onValueChange={(value) => setVehicleId(value === NONE ? "" : value)}
        >
          <SelectTrigger id="vehicle">
            <SelectValue placeholder={t("vehiclePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noVehicle")}</SelectItem>
            {vehicles.map((vehicle) => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("vehicleHint")}</p>
      </div>

      <Field
        label={t("customerName")}
        description={t("customerNameHint")}
        error={firstError(fieldErrors, "customerName")}
      >
        <Input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder={t("customerNamePlaceholder")}
        />
      </Field>

      <Field label={t("note")} error={firstError(fieldErrors, "note")}>
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
        <Link
          href={`/appointments?date=${date}`}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
