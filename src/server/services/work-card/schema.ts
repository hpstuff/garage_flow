import { z } from "zod";

/**
 * Work Card input schema (ADR-0016). The Work Card is a **projection** of an
 * existing Repair Order (ADR-0009), so its only input is the RO id — there are no
 * writable fields, because the Work Card is never stored or edited. Scope-derived
 * columns come from the `Scope`, never the caller.
 */
export const getWorkCardSchema = z.object({ id: z.uuid() }).strict();
export type GetWorkCardInput = z.infer<typeof getWorkCardSchema>;
