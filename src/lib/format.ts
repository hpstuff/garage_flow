/**
 * Locale-aware formatting (ADR-0017). All number/date/currency display goes
 * through `Intl` with the Bulgarian locale.
 *
 * Money is stored and computed as **integer minor units** with an explicit
 * currency (ADR-0011) — never floats. The definitive BGN/EUR invoicing rules
 * belong to the invoicing ADRs; this only renders.
 */

const LOCALE = "bg-BG";

/** Render integer minor units (e.g. 12345 → "123,45 лв.") in the given currency. */
export function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
  }).format(minorUnits / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/**
 * Render a Line Item quantity stored in thousandths (ADR-0011) — hours or count
 * (e.g. 1500 → "1,5"). Up to three decimals, trailing zeros dropped.
 */
export function formatQuantity(thousandths: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(thousandths / 1000);
}

/** Render a VAT rate stored in basis points (2000 → "20 %"). */
export function formatVatRate(basisPoints: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(basisPoints / 10000);
}

export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" }).format(new Date(value));
}
