import { z } from "zod";

/**
 * Dashboard query input (ADR-0016). Empty for now, but present so the service
 * validates its input like every other operation — the reference pattern.
 */
export const dashboardQuerySchema = z.object({}).strict();

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
