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
import { Textarea } from "@/components/ui/textarea";
import type { CustomerKind } from "@/server/db/schema";
import type { FieldErrors } from "@/server/domain/errors";
import type { ScopedCustomer } from "@/server/services/customer/service";
import {
  type CustomerMutationResult,
  createCustomerAction,
  updateCustomerAction,
} from "../_actions/customer-actions";

/** The edit target — absent when creating. */
type CustomerFormProps = { customer?: ScopedCustomer };

function firstError(errors: FieldErrors, key: string): string | undefined {
  return errors[key]?.[0];
}

export function CustomerForm({ customer }: CustomerFormProps) {
  const t = useTranslations("customers.form");
  const tKind = useTranslations("customers.kind");
  const router = useRouter();
  const isEdit = Boolean(customer);

  const [kind, setKind] = useState<CustomerKind>(customer?.kind ?? "person");
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [taxId, setTaxId] = useState(customer?.taxId ?? "");
  const [note, setNote] = useState(customer?.note ?? "");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const values = { kind, name, email, phone, address, taxId, note };
    const result: CustomerMutationResult = isEdit
      ? await updateCustomerAction({ id: customer?.id, ...values })
      : await createCustomerAction(values);

    if (result.ok) {
      router.push("/customers");
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
      <fieldset className="space-y-2">
        <Label>{t("kind")}</Label>
        <RadioGroup
          className="flex gap-6"
          value={kind}
          onValueChange={(value) => setKind(value as CustomerKind)}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="kind-person" value="person" />
            <Label htmlFor="kind-person" className="font-normal">
              {tKind("person")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="kind-organization" value="organization" />
            <Label htmlFor="kind-organization" className="font-normal">
              {tKind("organization")}
            </Label>
          </div>
        </RadioGroup>
      </fieldset>

      <Field label={t("name")} error={firstError(fieldErrors, "name")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "organization" ? t("nameOrgPlaceholder") : t("namePersonPlaceholder")
          }
          required
          autoFocus
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("phone")} error={firstError(fieldErrors, "phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        </Field>
        <Field label={t("email")} error={firstError(fieldErrors, "email")}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Field>
      </div>

      {kind === "organization" ? (
        <Field label={t("taxId")} error={firstError(fieldErrors, "taxId")}>
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </Field>
      ) : null}

      <Field label={t("address")} error={firstError(fieldErrors, "address")}>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>

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
        <Link href="/customers" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
