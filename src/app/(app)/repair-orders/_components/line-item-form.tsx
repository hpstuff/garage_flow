"use client";

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
import type { FieldErrors } from "@/server/domain/errors";
import type { ScopedLineItem } from "@/server/services/line-item/service";
import {
  createLineItemAction,
  type LineItemMutationResult,
  updateLineItemAction,
} from "../_actions/line-item-actions";

/** A Mechanic a Labor line can attribute to — hourlyRateMinor is their default rate in integer minor units (BGN), null when not set. */
export type MechanicOption = { id: string; name: string; hourlyRateMinor?: number | null };

type LineItemFormProps = {
  repairOrderId: string;
  mechanics: MechanicOption[];
  /** The edit target — absent when adding. */
  lineItem?: ScopedLineItem;
  /** Whether the Location charges VAT (GF-12) — hides the rate field when false. */
  vatRegistered: boolean;
  /** Default VAT rate (percentage) to prefill new lines when registered. */
  defaultVatRatePercent: number;
  /** Called after a successful save so the parent can refresh and close the form. */
  onSaved: () => void;
  onCancel: () => void;
};

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

/** Render a stored integer encoding back into the form's human-unit string. */
const fromThousandths = (v: number) => String(v / 1000);
const fromMinorUnits = (v: number) => String(v / 100);
const fromBasisPoints = (v: number) => String(v / 100);

export function LineItemForm({
  repairOrderId,
  mechanics,
  lineItem,
  vatRegistered,
  defaultVatRatePercent,
  onSaved,
  onCancel,
}: LineItemFormProps) {
  const t = useTranslations("repairOrders.lineItems");
  const isEdit = Boolean(lineItem);

  const [type, setType] = useState<"labor" | "part">(lineItem?.type ?? "labor");
  const [description, setDescription] = useState(lineItem?.description ?? "");
  const [mechanicId, setMechanicId] = useState(lineItem?.mechanicId ?? "");
  const [quantity, setQuantity] = useState(lineItem ? fromThousandths(lineItem.quantity) : "");
  // For a new row the price starts empty; when editing it's the saved value.
  const [unitPrice, setUnitPrice] = useState(lineItem ? fromMinorUnits(lineItem.unitPrice) : "");

  /** When a mechanic is selected on a *new* row and they have a default rate, prefill unitPrice. */
  function selectMechanicAndPrefill(id: string) {
    if (!lineItem && type === "labor") {
      const chosen = mechanics.find((m) => m.id === id);
      setUnitPrice(chosen?.hourlyRateMinor != null ? fromMinorUnits(chosen.hourlyRateMinor) : "");
    }
    setMechanicId(id);
  }
  // Prefill the rate from the Location's default (GF-12); the field is hidden and
  // submitted as 0 when the Location is not VAT-registered.
  const [vatRate, setVatRate] = useState(
    lineItem ? fromBasisPoints(lineItem.vatRate) : String(defaultVatRatePercent),
  );

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const values = {
      repairOrderId,
      type,
      description,
      mechanicId: type === "labor" ? mechanicId : "",
      quantity,
      unitPrice,
      // A not-registered Location carries no VAT (ADR-0006): store the line at 0.
      vatRate: vatRegistered ? vatRate : "0",
    };
    const result: LineItemMutationResult = isEdit
      ? await updateLineItemAction({ id: lineItem?.id, ...values })
      : await createLineItemAction(values);

    if (result.ok) {
      onSaved();
      return;
    }

    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
    }
    setFormError(result.error === "NOT_FOUND" ? t("notFound") : t("error"));
    setPending(false);
  }

  const isLabor = type === "labor";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="line-type">{t("type")}</Label>
          <Select value={type} onValueChange={(value) => setType(value as "labor" | "part")}>
            <SelectTrigger id="line-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="labor">{t("types.labor")}</SelectItem>
              <SelectItem value="part">{t("types.part")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Field
          label={t("description")}
          error={firstError(fieldErrors, "description")}
          className="sm:col-span-1"
        >
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </Field>
      </div>

      {isLabor ? (
        <div className="space-y-1.5">
          <Label htmlFor="line-mechanic">{t("mechanic")}</Label>
          <Select value={mechanicId} onValueChange={selectMechanicAndPrefill}>
            <SelectTrigger
              id="line-mechanic"
              aria-invalid={Boolean(firstError(fieldErrors, "mechanicId"))}
            >
              <SelectValue placeholder={t("mechanicPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {mechanics.map((mechanic) => (
                <SelectItem key={mechanic.id} value={mechanic.id}>
                  {mechanic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mechanics.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMechanics")}</p>
          ) : null}
          {firstError(fieldErrors, "mechanicId") ? (
            <p className="text-sm font-medium text-destructive">
              {firstError(fieldErrors, "mechanicId")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={vatRegistered ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
        <Field
          label={isLabor ? t("hours") : t("quantity")}
          error={firstError(fieldErrors, "quantity")}
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step={isLabor ? "0.25" : "0.001"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <Field
          label={isLabor ? t("rate") : t("unitPrice")}
          error={firstError(fieldErrors, "unitPrice")}
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </Field>

        {vatRegistered ? (
          <Field label={t("vatRate")} error={firstError(fieldErrors, "vatRate")}>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
          </Field>
        ) : null}
      </div>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
