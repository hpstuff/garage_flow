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

export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" }).format(new Date(value));
}
