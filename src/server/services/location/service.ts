/**
 * Location settings service (GF-12) — read and update a Location's VAT
 * configuration (ADR-0006), Location-scoped.
 *
 * Follows the reference contract (ADR-0005/0015): each function is
 * `(scope, input) => Promise<plainData>`, validates its input at the top
 * (ADR-0016), works through ScopedDb (ADR-0013), and throws typed domain errors.
 *
 * VAT is a **per-Location** setting (ADR-0006): a `registered` Location charges
 * VAT at its configured rate; a `not_registered` one issues invoices that carry
 * **no VAT at all**. That distinction is the whole point of GF-12 — the money math
 * (`computeRepairOrderTotals`) consumes the {@link VatConfig} produced here to
 * render a true zero-VAT invoice, not a cosmetic 0% rate.
 */

import { z } from "zod";
import { DEFAULT_VAT_RATE_PERCENT, type VatConfig } from "../../../lib/vat";
import { type Scope, scoped } from "../../db";
import { ValidationError } from "../../domain/errors";
import { setScheduleConfigSchema, setVatConfigSchema } from "./schema";

// The VAT constants/types are transport-free (src/lib/vat) so client components
// can import them too; re-exported here for server-side ergonomics (GF-12).
export {
  DEFAULT_VAT_RATE,
  DEFAULT_VAT_RATE_PERCENT,
  type VatConfig,
  type VatMode,
} from "../../../lib/vat";

/**
 * Shape the raw stored settings into the {@link VatConfig} value object. A
 * `not_registered` Location drops its rate/number entirely — they are stored but
 * meaningless — so downstream code cannot accidentally treat it as "0% VAT".
 */
export function toVatConfig(settings: ScopedVatSettings): VatConfig {
  return settings.mode === "registered"
    ? { mode: "registered", rate: settings.rate, vatNumber: settings.vatNumber }
    : { mode: "not_registered" };
}

/** The current Location's VAT configuration (GF-12). */
export async function getVatConfig(scope: Scope): Promise<VatConfig> {
  return toVatConfig(await scoped(scope).getVatSettings());
}

/**
 * Update the current Location's VAT configuration (GF-12). A `registered` Location
 * gets its rate (percentage → basis points) and optional ДДС number; a
 * `not_registered` one clears the number — a non-registered shop has none — while
 * the rate is retained only as a remembered default should it re-register.
 */
export async function setVatConfig(scope: Scope, input: unknown): Promise<VatConfig> {
  const parsed = setVatConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid VAT settings", z.flattenError(parsed.error).fieldErrors);
  }

  const { mode, rate, vatNumber } = parsed.data;
  const saved = await scoped(scope).setVatSettings({
    mode,
    rate: Math.round((rate ?? DEFAULT_VAT_RATE_PERCENT) * 100),
    vatNumber: mode === "registered" ? vatNumber : null,
  });
  return toVatConfig(saved);
}

/** The current Location's working schedule (GF-20). Returns the {@link ScheduleConfig} value object. */
export async function getScheduleConfig(scope: Scope): Promise<ScheduleConfig> {
  const raw = await scoped(scope).getScheduleSettings();
  return raw.config;
}

/**
 * Update the current Location's working schedule (GF-20). Validates input and persists it.
 */
export async function setScheduleConfig(scope: Scope, input: unknown): Promise<ScheduleConfig> {
  const parsed = setScheduleConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid schedule config", z.flattenError(parsed.error).fieldErrors);
  }

  const saved = await scoped(scope).setScheduleSettings(parsed.data);
  return saved.config;
}
