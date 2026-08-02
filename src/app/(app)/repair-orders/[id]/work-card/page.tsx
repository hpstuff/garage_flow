import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatQuantity } from "@/lib/format";
import { getWorkCardAction } from "../../_actions/work-card-actions";
import { stageBadgeVariant } from "../../_components/stages";

/**
 * Work Card (GF-13) — the operational, customer-facing document rendered **on
 * demand** from the current Repair Order (ADR-0009). It tells the story of the
 * visit: the Complaint, the Diagnosis, the work done (labor by Mechanic with
 * hours), the Parts, and photos. It is a live projection — never stored or frozen
 * — and deliberately carries **none** of the Invoice's frozen legal subset: no
 * prices, VAT, totals, invoice number, or invoice/payment status (that is GF-14's
 * document). A 404 for an order outside the caller's scope, never a cross-tenant
 * read.
 */
export default async function WorkCardPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("repairOrders.workCard");
  const tStatus = await getTranslations("repairOrders");
  const { id } = await params;

  const result = await getWorkCardAction(id);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const card = result.data;
  const vehicleTitle = card.vehiclePlate ?? card.vehicleVin ?? t("empty");
  const vehicleDescription = [card.vehicleMake, card.vehicleModel].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/repair-orders/${card.repairOrderId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <Badge variant={stageBadgeVariant[card.stage]}>{tStatus(`stage.${card.stage}`)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {[vehicleTitle, vehicleDescription, card.customerName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link
          href={`/repair-orders/${card.repairOrderId}`}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("back")}
        </Link>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          <Field label={t("vehicle")}>
            {[vehicleTitle, vehicleDescription].filter(Boolean).join(" · ")}
          </Field>
          <Field label={t("owner")}>{card.customerName}</Field>
          <Field label={t("createdAt")}>{formatDate(card.createdAt)}</Field>
          <Field label={t("complaint")} full>
            {card.complaint ?? t("empty")}
          </Field>
          <Field label={t("diagnosis")} full>
            {card.diagnosis ?? t("empty")}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("labor.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {card.laborByMechanic.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("labor.empty")}</p>
          ) : (
            card.laborByMechanic.map((group) => (
              <div key={group.mechanicId ?? "unassigned"} className="space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-medium">{group.mechanicName ?? t("labor.unassigned")}</h3>
                  <span className="text-sm text-muted-foreground">
                    {t("labor.totalHours", { hours: formatQuantity(group.totalHours) })}
                  </span>
                </div>
                <ul className="divide-y rounded-md border">
                  {group.entries.map((entry) => (
                    <li
                      key={entry.lineItemId}
                      className="flex justify-between gap-4 px-3 py-2 text-sm"
                    >
                      <span className="whitespace-pre-wrap">{entry.description}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {t("labor.hours", { hours: formatQuantity(entry.hours) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("parts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {card.parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("parts.empty")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {card.parts.map((part) => (
                <li key={part.lineItemId} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <span className="whitespace-pre-wrap">{part.description}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t("parts.quantity", { quantity: formatQuantity(part.quantity) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("photos.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {card.photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("photos.empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {card.photos.map((photo) => (
                // biome-ignore lint/performance/noImgElement: photos are user uploads (GF-11), not build-time assets.
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  className="aspect-square w-full rounded-md object-cover"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** One label/value pair in the identity grid; `full` spans both columns for prose. */
function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "space-y-0.5 sm:col-span-2" : "space-y-0.5"}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
