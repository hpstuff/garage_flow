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

/** A Mechanic a Labor line can attribute to. */
export type MechanicOption = { id: string; name: string };

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
  const [unitPrice, setUnitPrice] = useState(lineItem ? fromMinorUnits(lineItem.unitPrice) : "");
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-28 space-y-1.5">
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
          className="min-w-48 flex-1"
        >
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </Field>

        {isLabor ? (
          <div className="w-48 space-y-1.5">
            <Label htmlFor="line-mechanic">{t("mechanic")}</Label>
            <Select value={mechanicId} onValueChange={setMechanicId}>
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
            {firstError(fieldErrors, "mechanicId") ? (
              <p className="text-sm font-medium text-destructive">
                {firstError(fieldErrors, "mechanicId")}
              </p>
            ) : null}
          </div>
        ) : null}

        <Field
          label={isLabor ? t("hours") : t("quantity")}
          error={firstError(fieldErrors, "quantity")}
          className="w-24"
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
          className="w-28"
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
          <Field label={t("vatRate")} error={firstError(fieldErrors, "vatRate")} className="w-24">
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

      {isLabor && mechanics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMechanics")}</p>
      ) : null}

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
