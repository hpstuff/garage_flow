"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ConsentPurpose } from "@/server/db/schema";
import type { ScopedConsent } from "@/server/services/consent/service";
import { grantConsentAction, revokeConsentAction } from "../_actions/consent-actions";

/** The fixed purpose set, mirrored here so the client bundle never pulls in the DB schema. */
const PURPOSE_OPTIONS: readonly ConsentPurpose[] = ["sms", "viber", "marketing"];

/** The standing (un-revoked) Consent for a purpose, or `null` if none stands (ADR-0004). */
function activeConsentFor(
  consents: ScopedConsent[],
  purpose: ConsentPurpose,
): ScopedConsent | null {
  return consents.find((c) => c.purpose === purpose && c.revokedAt === null) ?? null;
}

/**
 * Grant/revoke Consent per optional purpose (GF-20, GF-63) on the Customer edit
 * page. One row per fixed purpose (SMS/Viber/marketing, ADR-0004): shows whether
 * it currently stands and lets staff flip it. Granting/revoking is idempotent at
 * the service layer, so a double click is harmless; each action refreshes so the
 * row reflects the fresh state.
 */
export function ConsentSection({
  customerId,
  consents,
}: {
  customerId: string;
  consents: ScopedConsent[];
}) {
  const t = useTranslations("customers.consent");
  const router = useRouter();
  const [pendingPurpose, setPendingPurpose] = useState<ConsentPurpose | null>(null);
  const [errorPurpose, setErrorPurpose] = useState<ConsentPurpose | null>(null);

  async function onGrant(purpose: ConsentPurpose) {
    setPendingPurpose(purpose);
    setErrorPurpose(null);
    const result = await grantConsentAction({ customerId, purpose, note: null });
    if (result.ok) {
      router.refresh();
    } else {
      setErrorPurpose(purpose);
    }
    setPendingPurpose(null);
  }

  async function onRevoke(purpose: ConsentPurpose, id: string) {
    if (!window.confirm(t("confirmRevoke"))) {
      return;
    }
    setPendingPurpose(purpose);
    setErrorPurpose(null);
    const result = await revokeConsentAction({ id });
    if (result.ok) {
      router.refresh();
    } else {
      setErrorPurpose(purpose);
    }
    setPendingPurpose(null);
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="space-y-2">
        {PURPOSE_OPTIONS.map((purpose) => {
          const active = activeConsentFor(consents, purpose);
          const pending = pendingPurpose === purpose;
          return (
            <div
              key={purpose}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t(`purposes.${purpose}`)}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={active ? "success" : "outline"}>
                    {active ? t("active", { date: formatDate(active.grantedAt) }) : t("notGranted")}
                  </Badge>
                </div>
              </div>
              {active ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onRevoke(purpose, active.id)}
                >
                  {pending ? t("revoking") : t("revoke")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onGrant(purpose)}
                >
                  {pending ? t("granting") : t("grant")}
                </Button>
              )}
              {errorPurpose === purpose ? (
                <p className="w-full text-sm text-destructive">{t("error")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
