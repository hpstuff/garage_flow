/**
 * The shape adapters return to the UI. Domain errors (ADR-0016) are translated
 * into an `error` code here; the UI decides how to present it (redirect, inline
 * message, toast).
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
