import { z } from "zod";

/**
 * Service History input schema (ADR-0016). The Service History is a **derived
 * view** over a Vehicle's Repair Orders (CONTEXT.md, GF-18) — never stored — so
 * its only input is the Vehicle id. Scope-derived columns come from the `Scope`,
 * never the caller.
 */
export const getServiceHistorySchema = z.object({ vehicleId: z.uuid() }).strict();
export type GetServiceHistoryInput = z.infer<typeof getServiceHistorySchema>;
