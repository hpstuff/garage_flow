/**
 * VAT domain constants and types (GF-12, ADR-0006), kept **transport-free** so
 * both the server (schema, services) and client components can import them
 * without pulling the database client into the browser bundle.
 *
 * VAT is a per-Location setting: a `registered` Location charges VAT at a
 * configurable rate; a `not_registered` one issues invoices that carry **no VAT
 * at all** — a true zero-VAT mode, not a cosmetic 0% rate.
 */

/** The two VAT modes a Location can be in (ADR-0006). */
export const VAT_MODES = ["registered", "not_registered"] as const;
export type VatMode = (typeof VAT_MODES)[number];

/** Standard Bulgarian VAT rate in **basis points** (20% → 2000) — the default. */
export const DEFAULT_VAT_RATE = 2000;

/** The same default as a **percentage** (20), for form/UI prefill. */
export const DEFAULT_VAT_RATE_PERCENT = DEFAULT_VAT_RATE / 100;

/**
 * A Location's VAT configuration as a value object. The discriminated union is
 * deliberate: a `not_registered` Location has **no** rate and **no** VAT number —
 * its invoices carry no VAT whatsoever. This is exactly what lets the invoice math
 * express a true zero-VAT invoice instead of a cosmetic 0%-rated line.
 */
export type VatConfig =
  | { mode: "registered"; rate: number; vatNumber: string | null }
  | { mode: "not_registered" };
