"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQuantity, formatVatRate } from "@/lib/format";
import type { RepairOrderTotals, ScopedLineItem } from "@/server/services/line-item/service";
import { deleteLineItemAction } from "../_actions/line-item-actions";
import { LineItemForm, type MechanicOption } from "./line-item-form";

type LineItemsEditorProps = {
  repairOrderId: string;
  items: ScopedLineItem[];
  totals: RepairOrderTotals;
  mechanics: MechanicOption[];
};

/** No row is being edited, or the sentinel for the blank "add" form. */
type Editing = null | "new" | string;

export function LineItemsEditor({ repairOrderId, items, totals, mechanics }: LineItemsEditorProps) {
  const t = useTranslations("repairOrders.lineItems");
  const router = useRouter();

  const [editing, setEditing] = useState<Editing>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSaved() {
    setEditing(null);
    router.refresh();
  }

  async function onRemove(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deleteLineItemAction(id, repairOrderId);
    if (result.ok) {
      router.refresh();
    } else {
      setError(t("error"));
    }
    setDeletingId(null);
  }

  const editTarget =
    typeof editing === "string" && editing !== "new"
      ? items.find((item) => item.id === editing)
      : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {editing === null ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              {t("add")}
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.description")}</TableHead>
                <TableHead>{t("columns.mechanic")}</TableHead>
                <TableHead className="text-right">{t("columns.quantity")}</TableHead>
                <TableHead className="text-right">{t("columns.unitPrice")}</TableHead>
                <TableHead className="text-right">{t("columns.vat")}</TableHead>
                <TableHead className="text-right">{t("columns.amount")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant={item.type === "labor" ? "info" : "secondary"}>
                      {t(`types.${item.type}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.mechanicName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.unitPrice, item.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVatRate(item.vatRate)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(item.amount, item.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(item.id)}
                        disabled={editing !== null || deletingId !== null}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onRemove(item.id)}
                        disabled={editing !== null || deletingId !== null}
                      >
                        {deletingId === item.id ? t("removing") : t("remove")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {editing !== null ? (
          <LineItemForm
            key={editTarget?.id ?? "new"}
            repairOrderId={repairOrderId}
            mechanics={mechanics}
            lineItem={editTarget}
            onSaved={onSaved}
            onCancel={() => setEditing(null)}
          />
        ) : null}

        {items.length > 0 ? (
          <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("totals.net")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.net, totals.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("totals.vat")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.vat, totals.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <dt>{t("totals.gross")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.gross, totals.currency)}</dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
