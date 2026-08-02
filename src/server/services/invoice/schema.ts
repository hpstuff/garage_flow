import { z } from "zod";

/**
 * Invoice input schemas (ADR-0016). Validation is authoritative in the service, so
 * every transport is protected — not just the web form. Scope-derived fields
 * (`accountId`, `locationId`) come from the `Scope`, never the caller, and the
 * gapless `number`, the `issuedAt` freeze time, and the whole frozen snapshot are
 * derived by the service/DB — never taken from input (ADR-0002).
 *
 * Issuing an Invoice takes only the Repair Order id: the document is a projection
 * of that order's current Line Items (ADR-0009), and the legal series is a single
 * default per Location in the MVP (GF-14).
 */
export const issueInvoiceSchema = z.object({ repairOrderId: z.uuid() }).strict();
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;

/** Read one issued Invoice by its own id. */
export const getInvoiceSchema = z.object({ id: z.uuid() }).strict();
export type GetInvoiceInput = z.infer<typeof getInvoiceSchema>;

/** Read the Invoice issued from a given Repair Order (the RO's reference, ADR-0002). */
export const getInvoiceForRepairOrderSchema = z.object({ repairOrderId: z.uuid() }).strict();
export type GetInvoiceForRepairOrderInput = z.infer<typeof getInvoiceForRepairOrderSchema>;
