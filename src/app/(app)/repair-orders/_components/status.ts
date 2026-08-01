import type { BadgeProps } from "@/components/ui/badge";
import type { InvoiceStatus, PaymentStatus } from "@/server/db/schema";

/**
 * Badge variant per status reference (ADR-0002). These flags are set by GF-14/15
 * — here they are shown read-only, so the mapping is display-only: a neutral
 * outline for the opening state, warmer tints as the order progresses to
 * invoiced / paid.
 */
export const invoiceStatusVariant: Record<InvoiceStatus, BadgeProps["variant"]> = {
  not_invoiced: "outline",
  invoiced: "info",
};

export const paymentStatusVariant: Record<PaymentStatus, BadgeProps["variant"]> = {
  unpaid: "outline",
  partially_paid: "accent",
  paid: "success",
};
