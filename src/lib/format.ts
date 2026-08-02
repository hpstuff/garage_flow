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

/** Render the time-of-day only (e.g. 09:30) — used by the Appointment agenda (GF-19). */
export function formatTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, { timeStyle: "short" }).format(new Date(value));
}

/** Render a full day-and-weekday heading for the agenda (e.g. "неделя, 2 август 2026 г."). */
export function formatDateFull(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "full" }).format(new Date(value));
}

/**
 * Render an Invoice's gapless number as it appears on the фактура (GF-14): the
 * legal `series` and the sequential number zero-padded to ten digits, the standard
 * Bulgarian presentation (e.g. `A-0000000001`). The stored number stays a plain
 * integer (ADR-0011) — this is display only.
 */
export function formatInvoiceNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(10, "0")}`;
}
