import type { BadgeProps } from "@/components/ui/badge";
import type { InvoiceStatus, PaymentStatus } from "@/server/db/schema";

/**
 * Badge variant per status reference (ADR-0002). These flags are set by
 * GF-14/15/16 — here they are shown read-only, so the mapping is display-only: a
 * neutral outline for the opening state, warmer tints as the order progresses to
 * invoiced / paid, and a warning tint for `credited` — a voided Invoice needs
 * attention, distinct from a live one.
 */
export const invoiceStatusVariant: Record<InvoiceStatus, BadgeProps["variant"]> = {
  not_invoiced: "outline",
  invoiced: "info",
  credited: "warning",
};

export const paymentStatusVariant: Record<PaymentStatus, BadgeProps["variant"]> = {
  unpaid: "outline",
  partially_paid: "accent",
  paid: "success",
  credited: "warning",
};
