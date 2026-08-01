import type { BadgeProps } from "@/components/ui/badge";
import type { KanbanStage } from "@/server/services/repair-order/service";

/**
 * Badge variant per Kanban Stage (GF-10) — display-only. The tint warms as the
 * order advances along the fixed six (CONTEXT.md): a neutral outline while it
 * waits, blues/purples through the active work, green once `ready`, and the solid
 * primary for the terminal `delivered`. Stage carries no billing meaning, so these
 * are independent of the invoice/payment badges (ADR-0002).
 *
 * Keyed by `KanbanStage`, so the compiler flags any stage the map forgets — the
 * ordered list of stages itself is the server's `KANBAN_STAGES` (the single source
 * of truth), reaching the client as props, never re-declared here.
 */
export const stageBadgeVariant: Record<KanbanStage, BadgeProps["variant"]> = {
  waiting: "outline",
  diagnosing: "info",
  waiting_for_parts: "accent",
  repairing: "info",
  ready: "success",
  delivered: "default",
};
