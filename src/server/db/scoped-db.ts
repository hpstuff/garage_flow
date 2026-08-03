/**
 * ScopedDb (ADR-0013) — the only database handle a service ever receives.
 *
 * It is bound to a `Scope` at construction, and every tenant-scoped access goes
 * through it, so no scoped query can be built without the scope. Later slices
 * add methods here (e.g. `listRepairOrders`, `createCustomer`) that constrain
 * every query by `accountId` + `locationId`; the raw, unscoped `db` stays
 * private to this class.
 */

import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../domain/errors";
import type { Db } from "./client";
import {
  ANONYMIZED_CUSTOMER_NAME,
  type AppointmentStatus,
  appointment,
  type ConsentPurpose,
  type CustomerKind,
  consent,
  creditNote,
  creditNoteLine,
  creditNoteSeries,
  customer,
  type InvoiceStatus,
  invoice,
  invoiceLine,
  invoiceSeries,
  type KanbanStage,
  type LineItemType,
  lineItem,
  location,
  mechanic,
  type PaymentMethod,
  type PaymentStatus,
  payment,
  repairOrder,
  TERMINAL_KANBAN_STAGE,
  type VatMode,
  type VehicleKind,
  vehicle,
} from "./schema";
import type { Scope } from "./scope";

export interface ScopedLocation {
  id: string;
  name: string;
}

/**
 * The current Location's raw VAT settings (GF-12) — the stored columns as-is:
 * `mode`, the default `rate` in basis points, and the ДДС `vatNumber`. The
 * service shapes these into the {@link VatConfig} value object; when the mode is
 * `not_registered`, `rate`/`vatNumber` are stored but carry no meaning.
 */
export interface ScopedVatSettings {
  mode: VatMode;
  rate: number;
  vatNumber: string | null;
}

/** The VAT settings a caller may write — scope-derived columns are never here. */
export interface VatSettingsWriteValues {
  mode: VatMode;
  rate: number;
  vatNumber: string | null;
}

/** A Customer as it crosses the service boundary — an explicit, safe projection. */
export interface ScopedCustomer {
  id: string;
  kind: CustomerKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  note: string | null;
  /** The Anonymization instant (GF-21) — `null` while live, the erasure time once anonymized. */
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The Customer fields a caller may set — scope-derived columns are never here. */
export interface CustomerWriteValues {
  kind: CustomerKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  note: string | null;
}

/** Explicit column projection — never return raw rows (ADR-0016). */
const customerColumns = {
  id: customer.id,
  kind: customer.kind,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  address: customer.address,
  taxId: customer.taxId,
  note: customer.note,
  anonymizedAt: customer.anonymizedAt,
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
} as const;

/**
 * A Consent as it crosses the service boundary (GF-20). A timestamped, revocable
 * record for one optional purpose (ADR-0004): `revokedAt` is `null` while it
 * stands and the withdrawal instant once revoked — never a boolean. A Customer
 * has many of these, so consumers read the set, not a flag.
 */
export interface ScopedConsent {
  id: string;
  customerId: string;
  purpose: ConsentPurpose;
  grantedAt: Date;
  revokedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The fields a caller may set when **granting** a Consent — scope-derived columns
 * are never here, and neither are `grantedAt`/`revokedAt`: granting stamps
 * `grantedAt = now` with `revokedAt = null`, and revocation is its own path
 * ({@link ScopedDb.revokeConsent}), never a free-form column write.
 */
export interface ConsentGrantValues {
  customerId: string;
  purpose: ConsentPurpose;
  note: string | null;
}

/** Explicit column projection — never return raw rows (ADR-0016). */
const consentColumns = {
  id: consent.id,
  customerId: consent.customerId,
  purpose: consent.purpose,
  grantedAt: consent.grantedAt,
  revokedAt: consent.revokedAt,
  note: consent.note,
  createdAt: consent.createdAt,
  updatedAt: consent.updatedAt,
} as const;

/**
 * A Vehicle as it crosses the service boundary. Carries the current owner's
 * `customerId` plus their `customerName`, joined for display so a list needn't
 * fetch each owner separately. `customerId` is `null` for a Vehicle whose owner
 * was **anonymized** (GF-21) — the erasure unlinks it — and in that case
 * `customerName` reads {@link ANONYMIZED_CUSTOMER_NAME}, coalesced from the absent
 * owner so the field stays a plain `string` for every consumer.
 */
export interface ScopedVehicle {
  id: string;
  customerId: string | null;
  customerName: string;
  kind: VehicleKind;
  plate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The Vehicle fields a caller may set — scope-derived columns are never here. */
export interface VehicleWriteValues {
  customerId: string;
  kind: VehicleKind;
  plate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  note: string | null;
}

/** Explicit column projection — never return raw rows (ADR-0016). */
const vehicleColumns = {
  id: vehicle.id,
  customerId: vehicle.customerId,
  kind: vehicle.kind,
  plate: vehicle.plate,
  vin: vehicle.vin,
  make: vehicle.make,
  model: vehicle.model,
  year: vehicle.year,
  color: vehicle.color,
  note: vehicle.note,
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
} as const;

/**
 * A Mechanic as it crosses the service boundary (GF-07). `userId` is the
 * optional Phase-2 login link — exposed here so future consumers (the Repair
 * Order lead picker, Labor Line Items) can read it, though the MVP never sets it.
 */
export interface ScopedMechanic {
  id: string;
  userId: string | null;
  name: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The Mechanic fields a caller may set — scope-derived columns are never here.
 * `userId` is deliberately excluded: linking a Mechanic to a login User is
 * Phase 2 (GF-07), so the MVP create/edit path writes only `name` + `note`.
 */
export interface MechanicWriteValues {
  name: string;
  note: string | null;
}

/** Explicit column projection — never return raw rows (ADR-0016). */
const mechanicColumns = {
  id: mechanic.id,
  userId: mechanic.userId,
  name: mechanic.name,
  note: mechanic.note,
  createdAt: mechanic.createdAt,
  updatedAt: mechanic.updatedAt,
} as const;

/**
 * An Appointment as it crosses the service boundary (GF-19). Carries the joined
 * display fields the agenda needs without a second fetch: the reserved Mechanic's
 * name, and the expected Vehicle's plate/VIN. `customerName` is resolved for
 * display — the **linked** Customer's own name when `customerId` is set, otherwise
 * the free-text name typed for a phone booking (CONTEXT.md), so a row always shows
 * who the slot is for. The `[startsAt, endsAt)` range and `status` are what the
 * overlap check and the day filter read.
 */
export interface ScopedAppointment {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  vehicleVin: string | null;
  mechanicId: string | null;
  mechanicName: string | null;
  bay: string | null;
  /** Who the slot is for: the linked Customer's name, else the free-text booking name. */
  customerName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The Appointment fields a caller may set — scope-derived columns are never here,
 * and `status` is excluded because it opens at `scheduled` and only ever moves
 * through {@link ScopedDb.cancelAppointment}, never a free-form column write. Each
 * of the optional links (`customerId`/`vehicleId`/`mechanicId`) is checked for
 * scope membership before the write, so none can point across the tenant boundary.
 */
export interface AppointmentWriteValues {
  customerId: string | null;
  vehicleId: string | null;
  mechanicId: string | null;
  bay: string | null;
  customerName: string | null;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
}

/** Explicit base column projection — the joined display fields are added per query. */
const appointmentColumns = {
  id: appointment.id,
  customerId: appointment.customerId,
  vehicleId: appointment.vehicleId,
  mechanicId: appointment.mechanicId,
  bay: appointment.bay,
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  status: appointment.status,
  note: appointment.note,
  createdAt: appointment.createdAt,
  updatedAt: appointment.updatedAt,
} as const;

/**
 * A Repair Order as it crosses the service boundary (GF-08). Carries the joined
 * Vehicle identity (plate/VIN/make/model) and owner name for display, plus the
 * optional lead Mechanic's name, so a list or detail needn't fetch them
 * separately. `invoiceStatus`/`paymentStatus` are surfaced read-only — they are
 * references set by GF-14/GF-15 (ADR-0002), never through the write path.
 */
export interface ScopedRepairOrder {
  id: string;
  vehicleId: string;
  vehiclePlate: string | null;
  vehicleVin: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  customerName: string;
  mechanicId: string | null;
  mechanicName: string | null;
  /** The Appointment this visit was booked as (GF-19) — read-only here; null for a walk-in. */
  appointmentId: string | null;
  complaint: string | null;
  diagnosis: string | null;
  /** Kanban Stage (GF-10) — where the car is on the board; independent of the statuses. */
  stage: KanbanStage;
  invoiceStatus: InvoiceStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The Repair Order fields a caller may set through the create/edit path — scope-
 * derived columns are never here; `invoiceStatus`/`paymentStatus` are excluded as
 * reference-only, owned by the invoicing/payment slices (ADR-0002); and `stage`
 * is excluded because it moves only through {@link ScopedDb.moveRepairOrderStage}
 * (GF-10), which enforces the terminal rule — never a free-form column write.
 *
 * The optional `appointmentId` link (GF-19) is deliberately **not** here either: it
 * is set once, at open time, as a separate argument to
 * {@link ScopedDb.createRepairOrder}, and the edit path never rewrites it.
 */
export interface RepairOrderWriteValues {
  vehicleId: string;
  mechanicId: string | null;
  complaint: string | null;
  diagnosis: string | null;
}

/** Explicit base column projection — the joined display fields are added per query. */
const repairOrderColumns = {
  id: repairOrder.id,
  vehicleId: repairOrder.vehicleId,
  mechanicId: repairOrder.mechanicId,
  appointmentId: repairOrder.appointmentId,
  complaint: repairOrder.complaint,
  diagnosis: repairOrder.diagnosis,
  stage: repairOrder.stage,
  invoiceStatus: repairOrder.invoiceStatus,
  paymentStatus: repairOrder.paymentStatus,
  createdAt: repairOrder.createdAt,
  updatedAt: repairOrder.updatedAt,
} as const;

/**
 * A Line Item as it crosses the service boundary (GF-09). Carries the attributed
 * Mechanic's name (joined, null on Part lines) for display. The money/quantity
 * columns keep their exact integer encodings (`quantity` in thousandths,
 * `unitPrice`/`amount` in minor units, `vatRate` in basis points — see schema.ts);
 * the formatting layer renders them.
 */
export interface ScopedLineItem {
  id: string;
  repairOrderId: string;
  type: LineItemType;
  mechanicId: string | null;
  mechanicName: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  amount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The Line Item fields a caller may set — scope-derived columns are never here,
 * and `currency` is a database default (BGN in the MVP, ADR-0011). `amount` is
 * computed by the service from `quantity` × `unitPrice`, never taken raw from the
 * caller, so a line total can never disagree with its inputs.
 */
export interface LineItemWriteValues {
  repairOrderId: string;
  type: LineItemType;
  mechanicId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  amount: number;
}

/** Explicit base column projection — the joined Mechanic name is added per query. */
const lineItemColumns = {
  id: lineItem.id,
  repairOrderId: lineItem.repairOrderId,
  type: lineItem.type,
  mechanicId: lineItem.mechanicId,
  description: lineItem.description,
  quantity: lineItem.quantity,
  unitPrice: lineItem.unitPrice,
  vatRate: lineItem.vatRate,
  amount: lineItem.amount,
  currency: lineItem.currency,
  createdAt: lineItem.createdAt,
  updatedAt: lineItem.updatedAt,
} as const;

/**
 * One **frozen** priced row on an issued Invoice as it crosses the service
 * boundary (GF-14). The money/quantity columns keep the same exact integer
 * encodings as a Line Item; unlike one, it never carries the attributed Mechanic —
 * labor attribution is the Work Card's, not the legal document's (ADR-0009).
 */
export interface ScopedInvoiceLine {
  id: string;
  position: number;
  type: LineItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  amount: number;
  currency: string;
}

/**
 * An issued **Invoice** as it crosses the service boundary (GF-14) — the frozen
 * header plus its frozen `lines`. Everything here is a snapshot taken at issue
 * (ADR-0002): `vat` is `null` for a not-registered Location (a true zero-VAT
 * invoice, ADR-0006), and the money columns are integer minor units (ADR-0011).
 */
export interface ScopedInvoice {
  id: string;
  repairOrderId: string;
  series: string;
  number: number;
  issuedAt: Date;
  vatMode: VatMode;
  sellerVatNumber: string | null;
  customerName: string;
  vehiclePlate: string | null;
  net: number;
  vat: number | null;
  gross: number;
  currency: string;
  lines: ScopedInvoiceLine[];
}

/**
 * The frozen snapshot a service hands {@link ScopedDb.issueInvoice} — everything
 * about the Invoice **except** the DB-assigned gapless `number` and the `issuedAt`
 * freeze time, which the transaction allocates. The service computes the totals
 * and shapes the lines (with `position`); ScopedDb owns only the atomic numbering,
 * inserts, and the RO-status flip.
 */
export interface InvoiceIssueValues {
  repairOrderId: string;
  series: string;
  vatMode: VatMode;
  sellerVatNumber: string | null;
  customerName: string;
  vehiclePlate: string | null;
  net: number;
  vat: number | null;
  gross: number;
  currency: string;
  lines: Array<{
    position: number;
    type: LineItemType;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    amount: number;
    currency: string;
  }>;
}

/** Explicit column projection for the frozen Invoice header — never raw rows (ADR-0016). */
const invoiceColumns = {
  id: invoice.id,
  repairOrderId: invoice.repairOrderId,
  series: invoice.series,
  number: invoice.number,
  issuedAt: invoice.issuedAt,
  vatMode: invoice.vatMode,
  sellerVatNumber: invoice.sellerVatNumber,
  customerName: invoice.customerName,
  vehiclePlate: invoice.vehiclePlate,
  net: invoice.net,
  vat: invoice.vat,
  gross: invoice.gross,
  currency: invoice.currency,
} as const;

/** Explicit column projection for the frozen Invoice lines. */
const invoiceLineColumns = {
  id: invoiceLine.id,
  position: invoiceLine.position,
  type: invoiceLine.type,
  description: invoiceLine.description,
  quantity: invoiceLine.quantity,
  unitPrice: invoiceLine.unitPrice,
  vatRate: invoiceLine.vatRate,
  amount: invoiceLine.amount,
  currency: invoiceLine.currency,
} as const;

/**
 * A **Payment** recorded against an Invoice as it crosses the service boundary
 * (GF-15). `amount` is integer minor units of `currency` (ADR-0011), copied from
 * the Invoice at record time; `method` is descriptive only (see schema.ts).
 */
export interface ScopedPayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  currency: string;
  createdAt: Date;
}

/**
 * The Payment fields a caller may set — scope-derived columns are never here, and
 * `currency` is copied from the settled Invoice by {@link ScopedDb.recordPayment}
 * (never trusted from the caller), so a Payment can never disagree in currency
 * with the document it settles. `amount` is already in exact minor units (ADR-0011).
 */
export interface PaymentWriteValues {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
}

/** Explicit column projection — never return raw rows (ADR-0016). */
const paymentColumns = {
  id: payment.id,
  invoiceId: payment.invoiceId,
  amount: payment.amount,
  method: payment.method,
  note: payment.note,
  currency: payment.currency,
  createdAt: payment.createdAt,
} as const;

/**
 * One **frozen** credited row on a Credit Note as it crosses the service boundary
 * (GF-16) — the same shape and integer encodings as a {@link ScopedInvoiceLine},
 * and like it never carrying the attributed Mechanic (ADR-0009).
 */
export interface ScopedCreditNoteLine {
  id: string;
  position: number;
  type: LineItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  amount: number;
  currency: string;
}

/**
 * An issued **Credit Note** as it crosses the service boundary (GF-16) — the frozen
 * header plus its frozen `lines`. Everything is a snapshot taken at issue from the
 * credited Invoice (ADR-0002): `invoiceSeries`/`invoiceNumber` echo the original
 * document's printed number, `vat` is `null` when the Invoice carried no VAT
 * (ADR-0006), and the money columns are integer minor units credited back (ADR-0011).
 */
export interface ScopedCreditNote {
  id: string;
  invoiceId: string;
  repairOrderId: string;
  series: string;
  number: number;
  issuedAt: Date;
  invoiceSeries: string;
  invoiceNumber: number;
  vatMode: VatMode;
  sellerVatNumber: string | null;
  customerName: string;
  vehiclePlate: string | null;
  net: number;
  vat: number | null;
  gross: number;
  reason: string | null;
  currency: string;
  lines: ScopedCreditNoteLine[];
}

/**
 * The frozen snapshot a service hands {@link ScopedDb.issueCreditNote} — everything
 * about the Credit Note **except** the DB-assigned gapless `number` and the
 * `issuedAt` freeze time, which the transaction allocates. The service copies the
 * credited Invoice into this shape; ScopedDb owns only the atomic numbering, the
 * insert, and the one-per-Invoice guard.
 */
export interface CreditNoteIssueValues {
  invoiceId: string;
  repairOrderId: string;
  series: string;
  invoiceSeries: string;
  invoiceNumber: number;
  vatMode: VatMode;
  sellerVatNumber: string | null;
  customerName: string;
  vehiclePlate: string | null;
  net: number;
  vat: number | null;
  gross: number;
  reason: string | null;
  currency: string;
  lines: Array<{
    position: number;
    type: LineItemType;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    amount: number;
    currency: string;
  }>;
}

/** Explicit column projection for the frozen Credit Note header — never raw rows (ADR-0016). */
const creditNoteColumns = {
  id: creditNote.id,
  invoiceId: creditNote.invoiceId,
  repairOrderId: creditNote.repairOrderId,
  series: creditNote.series,
  number: creditNote.number,
  issuedAt: creditNote.issuedAt,
  invoiceSeries: creditNote.invoiceSeries,
  invoiceNumber: creditNote.invoiceNumber,
  vatMode: creditNote.vatMode,
  sellerVatNumber: creditNote.sellerVatNumber,
  customerName: creditNote.customerName,
  vehiclePlate: creditNote.vehiclePlate,
  net: creditNote.net,
  vat: creditNote.vat,
  gross: creditNote.gross,
  reason: creditNote.reason,
  currency: creditNote.currency,
} as const;

/** Explicit column projection for the frozen Credit Note lines. */
const creditNoteLineColumns = {
  id: creditNoteLine.id,
  position: creditNoteLine.position,
  type: creditNoteLine.type,
  description: creditNoteLine.description,
  quantity: creditNoteLine.quantity,
  unitPrice: creditNoteLine.unitPrice,
  vatRate: creditNoteLine.vatRate,
  amount: creditNoteLine.amount,
  currency: creditNoteLine.currency,
} as const;

/**
 * A plate/VIN reduced to its bare identity: upper-cased with every space and
 * punctuation stripped. Comparing on this form is what lets "ca 1234-ab",
 * "CA1234AB" and "ca1234ab" all resolve to the same Vehicle — the loose,
 * front-desk-speed match at the heart of the search wedge (ADR-0008).
 */
const normalizedPlate = sql`regexp_replace(upper(coalesce(${vehicle.plate}, '')), '[^A-Z0-9]', '', 'g')`;
const normalizedVin = sql`regexp_replace(upper(coalesce(${vehicle.vin}, '')), '[^A-Z0-9]', '', 'g')`;

/** Reduce a raw search term to the same bare form the identifiers are matched on. */
function looseIdentifier(term: string): string {
  return term.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * The owner's display name for a Vehicle/Repair-Order projection, resilient to an
 * **anonymized** owner (GF-21). The owner join is `left` — a Vehicle whose Customer
 * was anonymized has its link cleared (ADR-0004), so there is no owner row — and
 * this coalesces the absent name to {@link ANONYMIZED_CUSTOMER_NAME}. Keeping the
 * fallback here lets `customerName` stay a plain `string` for every consumer while
 * the underlying link is honestly nullable.
 */
const ownerName = sql<string>`coalesce(${customer.name}, ${ANONYMIZED_CUSTOMER_NAME})`;

export class ScopedDb {
  readonly scope: Scope;
  readonly #db: Db;

  private constructor(scope: Scope, db: Db) {
    this.scope = scope;
    this.#db = db;
  }

  /** Bind a raw db handle to a resolved scope. */
  static create(scope: Scope, db: Db): ScopedDb {
    return new ScopedDb(scope, db);
  }

  /**
   * The current Location — the tenant boundary for everything else. The query
   * is constrained by both `locationId` and `accountId`, so a scope can only
   * ever read its own Account's Location.
   */
  async currentLocation(): Promise<ScopedLocation> {
    const rows = await this.#db
      .select({ id: location.id, name: location.name })
      .from(location)
      .where(
        and(eq(location.id, this.scope.locationId), eq(location.accountId, this.scope.accountId)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Location not found for the current scope");
    }
    return row;
  }

  /** The scope's `{ accountId, locationId }` as a reusable Location predicate. */
  #locationScope() {
    return and(
      eq(location.id, this.scope.locationId),
      eq(location.accountId, this.scope.accountId),
    );
  }

  /**
   * The Kanban Stages the current Location hides on its board (GF-10). A Location
   * can only *hide* stages it doesn't use — the set is fixed and cannot be added
   * to or reordered — so this is a subset of {@link KANBAN_STAGES}, empty when
   * every stage is shown.
   */
  async getHiddenStages(): Promise<KanbanStage[]> {
    const rows = await this.#db
      .select({ hiddenStages: location.hiddenStages })
      .from(location)
      .where(this.#locationScope())
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Location not found for the current scope");
    }
    return row.hiddenStages;
  }

  /**
   * Replace the current Location's hidden Stages (GF-10). Callers pass the exact
   * set to hide; there is no add/reorder path, so a plain overwrite is correct.
   * Scoped by `accountId` + `locationId`, so one Account can never touch another's
   * board configuration.
   */
  async setHiddenStages(stages: KanbanStage[]): Promise<KanbanStage[]> {
    const rows = await this.#db
      .update(location)
      .set({ hiddenStages: stages, updatedAt: new Date() })
      .where(this.#locationScope())
      .returning({ hiddenStages: location.hiddenStages });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Location not found for the current scope");
    }
    return row.hiddenStages;
  }

  /**
   * The current Location's VAT settings (GF-12, ADR-0006) — mode, default rate and
   * ДДС number. Scoped by `accountId` + `locationId`, so a scope only ever reads
   * its own Location's configuration.
   */
  async getVatSettings(): Promise<ScopedVatSettings> {
    const rows = await this.#db
      .select({
        mode: location.vatMode,
        rate: location.vatRate,
        vatNumber: location.vatNumber,
      })
      .from(location)
      .where(this.#locationScope())
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Location not found for the current scope");
    }
    return row;
  }

  /**
   * Replace the current Location's VAT settings (GF-12). Scoped by `accountId` +
   * `locationId`, so one Account can never touch another's VAT configuration.
   */
  async setVatSettings(values: VatSettingsWriteValues): Promise<ScopedVatSettings> {
    const rows = await this.#db
      .update(location)
      .set({
        vatMode: values.mode,
        vatRate: values.rate,
        vatNumber: values.vatNumber,
        updatedAt: new Date(),
      })
      .where(this.#locationScope())
      .returning({
        mode: location.vatMode,
        rate: location.vatRate,
        vatNumber: location.vatNumber,
      });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Location not found for the current scope");
    }
    return row;
  }

  /** The scope's `{ accountId, locationId }` as a reusable query predicate. */
  #customerScope() {
    return and(
      eq(customer.accountId, this.scope.accountId),
      eq(customer.locationId, this.scope.locationId),
    );
  }

  /**
   * Customers in the current Location, ordered by name. An optional `search`
   * matches (case-insensitively) name, phone, or email so the front desk can
   * find a walk-in fast.
   */
  async listCustomers(search: string | null): Promise<ScopedCustomer[]> {
    const term = search?.trim();
    const where = term
      ? and(
          this.#customerScope(),
          or(
            ilike(customer.name, `%${term}%`),
            ilike(customer.phone, `%${term}%`),
            ilike(customer.email, `%${term}%`),
          ),
        )
      : this.#customerScope();

    return this.#db.select(customerColumns).from(customer).where(where).orderBy(asc(customer.name));
  }

  /** A single Customer, or `NotFoundError` if it is not in the caller's scope. */
  async getCustomer(id: string): Promise<ScopedCustomer> {
    const rows = await this.#db
      .select(customerColumns)
      .from(customer)
      .where(and(eq(customer.id, id), this.#customerScope()))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Customer not found");
    }
    return row;
  }

  /** Create a Customer in the current Account + Location. */
  async createCustomer(values: CustomerWriteValues): Promise<ScopedCustomer> {
    const rows = await this.#db
      .insert(customer)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        ...values,
      })
      .returning(customerColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Customer could not be created");
    }
    return row;
  }

  /**
   * Update a Customer within the caller's scope. The `WHERE` is constrained by
   * `accountId` + `locationId`, so a Customer in another Account's Location is
   * invisible and updating it raises `NotFoundError`, never a cross-tenant write.
   */
  async updateCustomer(id: string, values: CustomerWriteValues): Promise<ScopedCustomer> {
    const rows = await this.#db
      .update(customer)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(customer.id, id), this.#customerScope()))
      .returning(customerColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Customer not found");
    }
    return row;
  }

  /**
   * **Anonymize** a Customer within the caller's scope (GF-21, ADR-0004) — the
   * right-to-erasure action, which is *not* a delete. In a single transaction it:
   *
   * 1. Locks the Customer row (`FOR UPDATE`) within scope, 404-ing a cross-tenant
   *    Customer and serialising concurrent erasures.
   * 2. Is **idempotent**: an already-anonymized Customer (its `anonymizedAt` set) is
   *    returned unchanged — the PII is already gone and its Vehicles already
   *    unlinked, so re-running never re-stamps the instant or touches Vehicles.
   * 3. Strips the PII: `name` → {@link ANONYMIZED_CUSTOMER_NAME} (the column is
   *    `NOT NULL`, so it is replaced, not blanked), and `email`/`phone`/`address`/
   *    `taxId`/`note` → null. Stamps `anonymizedAt` with the erasure instant — the
   *    anonymized state, distinct from row deletion.
   * 4. **Unlinks every Vehicle**: clears `customerId` on the Customer's Vehicles in
   *    scope, so no Vehicle points back at the erased person. Each Vehicle survives
   *    (its Service History keys off Repair Orders, not this link).
   *
   * It deliberately never touches Invoices: an issued Invoice snapshots the buyer
   * name at issue and references the Repair Order, so it retains its legally-required
   * minimum untouched, and — because this is an update, never a delete, and the
   * Vehicle FK is `set null` — no cascade path can remove it (ADR-0004). Consents
   * are left as-is; they cascade only on a real Customer/Account teardown, which this
   * is not. Commits or rolls back together, so PII-strip and unlink never diverge.
   */
  async anonymizeCustomer(id: string): Promise<ScopedCustomer> {
    return this.#db.transaction(async (tx) => {
      // 1. Lock the Customer in scope; a cross-tenant id is invisible → 404.
      const currentRows = await tx
        .select(customerColumns)
        .from(customer)
        .where(and(eq(customer.id, id), this.#customerScope()))
        .for("update")
        .limit(1);

      const current = currentRows[0];
      if (!current) {
        throw new NotFoundError("Customer not found");
      }

      // 2. Idempotent: already anonymized → return as-is, touch nothing.
      if (current.anonymizedAt !== null) {
        return current;
      }

      // 3. Strip the PII and stamp the erasure instant.
      const now = new Date();
      const rows = await tx
        .update(customer)
        .set({
          name: ANONYMIZED_CUSTOMER_NAME,
          email: null,
          phone: null,
          address: null,
          taxId: null,
          note: null,
          anonymizedAt: now,
          updatedAt: now,
        })
        .where(and(eq(customer.id, id), this.#customerScope()))
        .returning(customerColumns);

      const anonymized = rows[0];
      if (!anonymized) {
        throw new NotFoundError("Customer not found");
      }

      // 4. Unlink every Vehicle the Customer owned (in scope) — no back-reference survives.
      await tx
        .update(vehicle)
        .set({ customerId: null, updatedAt: now })
        .where(and(eq(vehicle.customerId, id), this.#vehicleScope()));

      return anonymized;
    });
  }

  /** The scope's `{ accountId, locationId }` as a reusable Consent predicate. */
  #consentScope() {
    return and(
      eq(consent.accountId, this.scope.accountId),
      eq(consent.locationId, this.scope.locationId),
    );
  }

  /**
   * Every Consent a Customer holds (GF-20), newest decision first — the full,
   * un-collapsed history, so a revoked purpose and a later re-grant both show. The
   * Customer is asserted in scope first, so listing another Account's Customer
   * raises `NotFoundError` rather than silently returning an empty set. The service
   * derives "currently consented to X" from this set (a purpose whose `revokedAt`
   * is `null`); this method never applies that rule, it just returns the records.
   */
  async listConsents(customerId: string): Promise<ScopedConsent[]> {
    await this.#assertCustomerInScope(customerId);
    return this.#db
      .select(consentColumns)
      .from(consent)
      .where(and(eq(consent.customerId, customerId), this.#consentScope()))
      .orderBy(desc(consent.grantedAt), desc(consent.createdAt), asc(consent.id));
  }

  /** A single Consent, or `NotFoundError` if it is not in the caller's scope. */
  async getConsent(id: string): Promise<ScopedConsent> {
    const rows = await this.#db
      .select(consentColumns)
      .from(consent)
      .where(and(eq(consent.id, id), this.#consentScope()))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Consent not found");
    }
    return row;
  }

  /**
   * Grant a Consent for one optional purpose (GF-20, ADR-0004). The Customer is
   * asserted in scope first, so a Consent can never be attached to a cross-tenant
   * Customer. **Idempotent per active purpose**: if the Customer already has a
   * standing (un-revoked) Consent for this purpose, that record is returned
   * unchanged rather than inserting a duplicate — so at most one Consent is active
   * for a given purpose, while a fresh grant *after* a revocation still makes a new
   * record, preserving the decision history. Concurrent grants of the same purpose
   * are benign: two active rows carry the same meaning, and the service's "latest
   * active wins" read collapses them.
   */
  async grantConsent(values: ConsentGrantValues): Promise<ScopedConsent> {
    await this.#assertCustomerInScope(values.customerId);

    const active = await this.#db
      .select(consentColumns)
      .from(consent)
      .where(
        and(
          eq(consent.customerId, values.customerId),
          eq(consent.purpose, values.purpose),
          isNull(consent.revokedAt),
          this.#consentScope(),
        ),
      )
      .orderBy(desc(consent.grantedAt))
      .limit(1);

    const standing = active[0];
    if (standing) {
      return standing;
    }

    const rows = await this.#db
      .insert(consent)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        customerId: values.customerId,
        purpose: values.purpose,
        note: values.note,
      })
      .returning(consentColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Consent could not be granted");
    }
    return row;
  }

  /**
   * Revoke a Consent within the caller's scope (GF-20) — stamps `revokedAt` with
   * the withdrawal instant (ADR-0004), the only change a Consent ever makes (there
   * is no hard delete, matching the other tables). The row is loaded scoped first,
   * so one in another Account's Location is invisible and revoking it raises
   * `NotFoundError`. **Idempotent**: revoking an already-revoked Consent is a no-op
   * that returns it with its original `revokedAt` intact.
   */
  async revokeConsent(id: string): Promise<ScopedConsent> {
    const current = await this.getConsent(id);
    if (current.revokedAt !== null) {
      return current;
    }

    const now = new Date();
    const rows = await this.#db
      .update(consent)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(consent.id, id), this.#consentScope()))
      .returning(consentColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Consent not found");
    }
    return row;
  }

  /** The scope's `{ accountId, locationId }` as a reusable Vehicle predicate. */
  #vehicleScope() {
    return and(
      eq(vehicle.accountId, this.scope.accountId),
      eq(vehicle.locationId, this.scope.locationId),
    );
  }

  /**
   * Resolve the owner Customer's name, but only within the caller's scope. A
   * `customerId` from another Account's Location is invisible here, so a Vehicle
   * can never be attached (or reassigned) to a cross-tenant owner.
   */
  async #ownerNameInScope(customerId: string): Promise<string> {
    const rows = await this.#db
      .select({ name: customer.name })
      .from(customer)
      .where(and(eq(customer.id, customerId), this.#customerScope()))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Owner not found");
    }
    return row.name;
  }

  /**
   * The OR-predicate that makes a Vehicle match a free-text `term`: plate and VIN
   * matched *loosely* — case-, space- and punctuation-insensitive, so a plate
   * typed as "ca 1234 ab" still finds "CA1234AB" (the fast-search wedge,
   * ADR-0008) — plus make, model and owner name matched case-insensitively.
   * Returns `null` for a term with no searchable characters.
   */
  #vehicleMatch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      return null;
    }
    const conditions = [
      ilike(vehicle.make, `%${trimmed}%`),
      ilike(vehicle.model, `%${trimmed}%`),
      ilike(customer.name, `%${trimmed}%`),
    ];
    const loose = looseIdentifier(trimmed);
    if (loose) {
      const pattern = `%${loose}%`;
      conditions.unshift(
        sql`${normalizedPlate} like ${pattern}`,
        sql`${normalizedVin} like ${pattern}`,
      );
    }
    return or(...conditions);
  }

  /**
   * Vehicles in the current Location with their current owner's name. An optional
   * `customerId` narrows to one owner's Vehicles; an optional `search` matches
   * plate, VIN, make, model, or owner name (see {@link ScopedDb.searchVehicles}
   * for the plate/VIN loose-matching, ADR-0008).
   */
  async listVehicles(filter: {
    search: string | null;
    customerId: string | null;
  }): Promise<ScopedVehicle[]> {
    const conditions = [this.#vehicleScope()];
    if (filter.customerId) {
      conditions.push(eq(vehicle.customerId, filter.customerId));
    }
    const match = filter.search ? this.#vehicleMatch(filter.search) : null;
    if (match) {
      conditions.push(match);
    }

    return this.#db
      .select({ ...vehicleColumns, customerName: ownerName })
      .from(vehicle)
      .leftJoin(customer, eq(customer.id, vehicle.customerId))
      .where(and(...conditions))
      .orderBy(asc(vehicle.plate));
  }

  /**
   * Fast plate/VIN search (GF-06) — the primary way the front desk reaches a
   * Vehicle. Resolves a loosely-typed plate or VIN (spacing/case ignored) to its
   * Vehicles with the current owner, best matches first: an exact plate/VIN hit
   * ranks above a partial one. Also matches make, model and owner name so a
   * half-remembered car is still findable. Capped at `limit` for a snappy picker.
   *
   * At single-Location scale a scan is instant, so this deliberately favours the
   * loose, index-free predicate over raw speed; add a functional index here if a
   * Location ever grows large enough to need one.
   */
  async searchVehicles(query: string, limit: number): Promise<ScopedVehicle[]> {
    const match = this.#vehicleMatch(query);
    if (!match) {
      return [];
    }

    const loose = looseIdentifier(query.trim());
    const rank = sql`case when ${normalizedPlate} = ${loose} or ${normalizedVin} = ${loose} then 0 else 1 end`;
    const orderBy = loose ? [rank, asc(vehicle.plate)] : [asc(vehicle.plate)];

    return this.#db
      .select({ ...vehicleColumns, customerName: ownerName })
      .from(vehicle)
      .leftJoin(customer, eq(customer.id, vehicle.customerId))
      .where(and(this.#vehicleScope(), match))
      .orderBy(...orderBy)
      .limit(limit);
  }

  /** A single Vehicle, or `NotFoundError` if it is not in the caller's scope. */
  async getVehicle(id: string): Promise<ScopedVehicle> {
    const rows = await this.#db
      .select({ ...vehicleColumns, customerName: ownerName })
      .from(vehicle)
      .leftJoin(customer, eq(customer.id, vehicle.customerId))
      .where(and(eq(vehicle.id, id), this.#vehicleScope()))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Vehicle not found");
    }
    return row;
  }

  /** Create a Vehicle owned by an in-scope Customer, in the current Location. */
  async createVehicle(values: VehicleWriteValues): Promise<ScopedVehicle> {
    const customerName = await this.#ownerNameInScope(values.customerId);
    const rows = await this.#db
      .insert(vehicle)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        ...values,
      })
      .returning(vehicleColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Vehicle could not be created");
    }
    return { ...row, customerName };
  }

  /**
   * Update a Vehicle within the caller's scope. Reassigning `customerId` is how
   * ownership changes on resale; the new owner must also be in scope. The `WHERE`
   * is constrained by `accountId` + `locationId`, so a Vehicle in another
   * Account's Location is invisible and updating it raises `NotFoundError`.
   */
  async updateVehicle(id: string, values: VehicleWriteValues): Promise<ScopedVehicle> {
    const customerName = await this.#ownerNameInScope(values.customerId);
    const rows = await this.#db
      .update(vehicle)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(vehicle.id, id), this.#vehicleScope()))
      .returning(vehicleColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Vehicle not found");
    }
    return { ...row, customerName };
  }

  /** The scope's `{ accountId, locationId }` as a reusable Mechanic predicate. */
  #mechanicScope() {
    return and(
      eq(mechanic.accountId, this.scope.accountId),
      eq(mechanic.locationId, this.scope.locationId),
    );
  }

  /**
   * Mechanics in the current Location, ordered by name — the list the front desk
   * browses and the source the future Repair Order lead / Labor Line Item pickers
   * draw from. An optional `search` matches the name case-insensitively.
   */
  async listMechanics(search: string | null): Promise<ScopedMechanic[]> {
    const term = search?.trim();
    const where = term
      ? and(this.#mechanicScope(), ilike(mechanic.name, `%${term}%`))
      : this.#mechanicScope();

    return this.#db.select(mechanicColumns).from(mechanic).where(where).orderBy(asc(mechanic.name));
  }

  /** A single Mechanic, or `NotFoundError` if it is not in the caller's scope. */
  async getMechanic(id: string): Promise<ScopedMechanic> {
    const rows = await this.#db
      .select(mechanicColumns)
      .from(mechanic)
      .where(and(eq(mechanic.id, id), this.#mechanicScope()))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Mechanic not found");
    }
    return row;
  }

  /** Create a Mechanic in the current Account + Location. */
  async createMechanic(values: MechanicWriteValues): Promise<ScopedMechanic> {
    const rows = await this.#db
      .insert(mechanic)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        ...values,
      })
      .returning(mechanicColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Mechanic could not be created");
    }
    return row;
  }

  /**
   * Update a Mechanic within the caller's scope. The `WHERE` is constrained by
   * `accountId` + `locationId`, so a Mechanic in another Account's Location is
   * invisible and updating it raises `NotFoundError`, never a cross-tenant write.
   */
  async updateMechanic(id: string, values: MechanicWriteValues): Promise<ScopedMechanic> {
    const rows = await this.#db
      .update(mechanic)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(mechanic.id, id), this.#mechanicScope()))
      .returning(mechanicColumns);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Mechanic not found");
    }
    return row;
  }

  /** The scope's `{ accountId, locationId }` as a reusable Repair Order predicate. */
  #repairOrderScope() {
    return and(
      eq(repairOrder.accountId, this.scope.accountId),
      eq(repairOrder.locationId, this.scope.locationId),
    );
  }

  /**
   * Assert a Vehicle is in the caller's scope, or raise `NotFoundError`. A
   * `vehicleId` from another Account's Location is invisible here, so a Repair
   * Order can never be opened against (or moved onto) a cross-tenant Vehicle —
   * the FK alone would not stop that, since it is not scope-aware. `null` (an
   * Appointment with no expected Vehicle — a walk-in slot) is always fine.
   */
  async #assertVehicleInScope(vehicleId: string | null): Promise<void> {
    if (vehicleId === null) {
      return;
    }
    const rows = await this.#db
      .select({ id: vehicle.id })
      .from(vehicle)
      .where(and(eq(vehicle.id, vehicleId), this.#vehicleScope()))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundError("Vehicle not found");
    }
  }

  /**
   * Assert an optional lead Mechanic is in the caller's scope. `null` (no lead)
   * is always fine; a `mechanicId` from another Account's Location raises
   * `NotFoundError`, so the lead can never point across the tenant boundary.
   */
  async #assertMechanicInScope(mechanicId: string | null): Promise<void> {
    if (mechanicId === null) {
      return;
    }
    const rows = await this.#db
      .select({ id: mechanic.id })
      .from(mechanic)
      .where(and(eq(mechanic.id, mechanicId), this.#mechanicScope()))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundError("Mechanic not found");
    }
  }

  /**
   * The full Repair Order projection: base columns plus the joined Vehicle
   * identity, owner name, and optional lead Mechanic name. The Vehicle join is
   * inner (an RO always has a Vehicle); the owner join is **left**, because the
   * Vehicle's owner may have been anonymized and unlinked (GF-21) — `customerName`
   * then coalesces to {@link ANONYMIZED_CUSTOMER_NAME} via {@link ownerName}. The
   * Mechanic join is left too (the lead is optional, so `mechanicName` is null when
   * unassigned). Constrained to the caller's scope by `where`.
   */
  #selectRepairOrders(where: ReturnType<typeof and>) {
    return this.#db
      .select({
        ...repairOrderColumns,
        vehiclePlate: vehicle.plate,
        vehicleVin: vehicle.vin,
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        customerName: ownerName,
        mechanicName: mechanic.name,
      })
      .from(repairOrder)
      .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .leftJoin(customer, eq(customer.id, vehicle.customerId))
      .leftJoin(mechanic, eq(mechanic.id, repairOrder.mechanicId))
      .where(where);
  }

  /**
   * Repair Orders in the current Location, newest first — the work list the front
   * desk browses. An optional `vehicleId` narrows to one Vehicle's orders (its
   * Service History surface, GF-08 lands here from the Vehicle detail page).
   */
  async listRepairOrders(filter: { vehicleId: string | null }): Promise<ScopedRepairOrder[]> {
    const conditions = [this.#repairOrderScope()];
    if (filter.vehicleId) {
      conditions.push(eq(repairOrder.vehicleId, filter.vehicleId));
    }
    return this.#selectRepairOrders(and(...conditions)).orderBy(desc(repairOrder.createdAt));
  }

  /** A single Repair Order, or `NotFoundError` if it is not in the caller's scope. */
  async getRepairOrder(id: string): Promise<ScopedRepairOrder> {
    const rows = await this.#selectRepairOrders(
      and(eq(repairOrder.id, id), this.#repairOrderScope()),
    ).limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Repair order not found");
    }
    return row;
  }

  /**
   * Open a Repair Order against an in-scope Vehicle, in the current Location. The
   * Vehicle, the optional lead Mechanic, and the optional booking `appointmentId`
   * (GF-19) are checked for scope membership first, so none can point across the
   * tenant boundary. `appointmentId` is a **create-only** link — the car arrived,
   * so this order *is* that Appointment (CONTEXT.md); the edit path never rewrites
   * it. Defaults to `null` for a walk-in.
   */
  async createRepairOrder(
    values: RepairOrderWriteValues,
    appointmentId: string | null = null,
  ): Promise<ScopedRepairOrder> {
    await this.#assertVehicleInScope(values.vehicleId);
    await this.#assertMechanicInScope(values.mechanicId);
    await this.#assertAppointmentInScope(appointmentId);

    const rows = await this.#db
      .insert(repairOrder)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        appointmentId,
        ...values,
      })
      .returning({ id: repairOrder.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Repair order could not be created");
    }
    return this.getRepairOrder(row.id);
  }

  /**
   * Update a Repair Order within the caller's scope. The reassigned Vehicle and
   * optional lead Mechanic must also be in scope. The `WHERE` is constrained by
   * `accountId` + `locationId`, so an order in another Account's Location is
   * invisible and updating it raises `NotFoundError`, never a cross-tenant write.
   * `invoiceStatus`/`paymentStatus` are intentionally never touched here — they
   * are set by GF-14/GF-15 (ADR-0002).
   */
  async updateRepairOrder(id: string, values: RepairOrderWriteValues): Promise<ScopedRepairOrder> {
    await this.#assertVehicleInScope(values.vehicleId);
    await this.#assertMechanicInScope(values.mechanicId);

    const rows = await this.#db
      .update(repairOrder)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(repairOrder.id, id), this.#repairOrderScope()))
      .returning({ id: repairOrder.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Repair order not found");
    }
    return this.getRepairOrder(row.id);
  }

  /**
   * Move a Repair Order to another Kanban Stage (GF-10). The stages are a fixed,
   * ordered set (CONTEXT.md); moving is a plain stage assignment — any target is
   * reachable, since the board is a workflow, not a strict pipeline. The one rule
   * is that **`delivered` is terminal**: an order already delivered cannot move
   * on, so that raises `ConflictError`. The order is loaded scoped first, so one
   * in another Account's Location is invisible and raises `NotFoundError` — never
   * a cross-tenant write. Stage is independent of the invoice/payment references,
   * which this never touches (ADR-0002).
   */
  async moveRepairOrderStage(id: string, stage: KanbanStage): Promise<ScopedRepairOrder> {
    const current = await this.getRepairOrder(id);
    if (current.stage === TERMINAL_KANBAN_STAGE) {
      throw new ConflictError("A delivered repair order is terminal and cannot be moved");
    }

    await this.#db
      .update(repairOrder)
      .set({ stage, updatedAt: new Date() })
      .where(and(eq(repairOrder.id, id), this.#repairOrderScope()));

    return this.getRepairOrder(id);
  }

  /** The scope's `{ accountId, locationId }` as a reusable Line Item predicate. */
  #lineItemScope() {
    return and(
      eq(lineItem.accountId, this.scope.accountId),
      eq(lineItem.locationId, this.scope.locationId),
    );
  }

  /**
   * Assert a Repair Order is in the caller's scope, or raise `NotFoundError`. An
   * order from another Account's Location is invisible here, so a Line Item can
   * never be attached to a cross-tenant order — the FK alone would not stop that.
   */
  async #assertRepairOrderInScope(repairOrderId: string): Promise<void> {
    const rows = await this.#db
      .select({ id: repairOrder.id })
      .from(repairOrder)
      .where(and(eq(repairOrder.id, repairOrderId), this.#repairOrderScope()))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundError("Repair order not found");
    }
  }

  /**
   * The full Line Item projection: base columns plus the attributed Mechanic's
   * name. The Mechanic join is left (Part lines have no Mechanic, and a Labor
   * line's Mechanic can be unlinked), so `mechanicName` is null in those cases.
   * Constrained to the caller's scope by `where`.
   */
  #selectLineItems(where: ReturnType<typeof and>) {
    return this.#db
      .select({ ...lineItemColumns, mechanicName: mechanic.name })
      .from(lineItem)
      .leftJoin(mechanic, eq(mechanic.id, lineItem.mechanicId))
      .where(where);
  }

  /**
   * A Repair Order's Line Items, oldest first — the order they were entered, which
   * is how they read on the Work Card and the Invoice. Scoped, so lines on another
   * Account's order are invisible (an out-of-scope `repairOrderId` yields none).
   */
  async listLineItems(repairOrderId: string): Promise<ScopedLineItem[]> {
    return this.#selectLineItems(
      and(eq(lineItem.repairOrderId, repairOrderId), this.#lineItemScope()),
    ).orderBy(asc(lineItem.createdAt), asc(lineItem.id));
  }

  /** A single Line Item, or `NotFoundError` if it is not in the caller's scope. */
  async getLineItem(id: string): Promise<ScopedLineItem> {
    const rows = await this.#selectLineItems(and(eq(lineItem.id, id), this.#lineItemScope())).limit(
      1,
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Line item not found");
    }
    return row;
  }

  /**
   * Add a Line Item to an in-scope Repair Order. The order and the optional
   * attributed Mechanic are checked for scope membership first, so neither can
   * point across the tenant boundary.
   */
  async createLineItem(values: LineItemWriteValues): Promise<ScopedLineItem> {
    await this.#assertRepairOrderInScope(values.repairOrderId);
    await this.#assertMechanicInScope(values.mechanicId);

    const rows = await this.#db
      .insert(lineItem)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        ...values,
      })
      .returning({ id: lineItem.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Line item could not be created");
    }
    return this.getLineItem(row.id);
  }

  /**
   * Update a Line Item within the caller's scope. The parent order and the
   * optional attributed Mechanic must also be in scope. The `WHERE` is constrained
   * by `accountId` + `locationId`, so a line on another Account's order is
   * invisible and updating it raises `NotFoundError`, never a cross-tenant write.
   */
  async updateLineItem(id: string, values: LineItemWriteValues): Promise<ScopedLineItem> {
    await this.#assertRepairOrderInScope(values.repairOrderId);
    await this.#assertMechanicInScope(values.mechanicId);

    const rows = await this.#db
      .update(lineItem)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(lineItem.id, id), this.#lineItemScope()))
      .returning({ id: lineItem.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Line item not found");
    }
    return this.getLineItem(row.id);
  }

  /**
   * Remove a Line Item within the caller's scope. Line Items are child rows of a
   * not-yet-invoiced order (ADR-0002), so a real delete is correct here. The
   * `WHERE` is scoped, so a line on another Account's order is invisible and
   * deleting it raises `NotFoundError`.
   */
  async deleteLineItem(id: string): Promise<{ id: string }> {
    const rows = await this.#db
      .delete(lineItem)
      .where(and(eq(lineItem.id, id), this.#lineItemScope()))
      .returning({ id: lineItem.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Line item not found");
    }
    return row;
  }

  /** The scope's `{ accountId, locationId }` as a reusable Invoice predicate. */
  #invoiceScope() {
    return and(
      eq(invoice.accountId, this.scope.accountId),
      eq(invoice.locationId, this.scope.locationId),
    );
  }

  /** The scope's `{ accountId, locationId }` as a reusable Invoice-line predicate. */
  #invoiceLineScope() {
    return and(
      eq(invoiceLine.accountId, this.scope.accountId),
      eq(invoiceLine.locationId, this.scope.locationId),
    );
  }

  /** The frozen lines of one Invoice, in document order (`position`), scoped. */
  async #loadInvoiceLines(invoiceId: string): Promise<ScopedInvoiceLine[]> {
    return this.#db
      .select(invoiceLineColumns)
      .from(invoiceLine)
      .where(and(eq(invoiceLine.invoiceId, invoiceId), this.#invoiceLineScope()))
      .orderBy(asc(invoiceLine.position));
  }

  /** A single Invoice with its frozen lines, or `NotFoundError` if out of scope. */
  async getInvoice(id: string): Promise<ScopedInvoice> {
    const rows = await this.#db
      .select(invoiceColumns)
      .from(invoice)
      .where(and(eq(invoice.id, id), this.#invoiceScope()))
      .limit(1);

    const header = rows[0];
    if (!header) {
      throw new NotFoundError("Invoice not found");
    }
    return { ...header, lines: await this.#loadInvoiceLines(header.id) };
  }

  /**
   * The Invoice issued from a given Repair Order (ADR-0002 back-reference), or
   * `null` when the order has not been invoiced. Scoped, so an order in another
   * Account's Location yields `null`, never a cross-tenant read. One issued Invoice
   * per order in v1; if that ever changes, the newest number wins.
   */
  async getInvoiceForRepairOrder(repairOrderId: string): Promise<ScopedInvoice | null> {
    const rows = await this.#db
      .select(invoiceColumns)
      .from(invoice)
      .where(and(eq(invoice.repairOrderId, repairOrderId), this.#invoiceScope()))
      .orderBy(desc(invoice.number))
      .limit(1);

    const header = rows[0];
    if (!header) {
      return null;
    }
    return { ...header, lines: await this.#loadInvoiceLines(header.id) };
  }

  /**
   * Issue an Invoice from a Repair Order (GF-14, ADR-0002) — the one place the
   * frozen legal document is created, atomically. In a single transaction it:
   *
   * 1. Locks the RO row (`FOR UPDATE`) within scope, 404-ing a cross-tenant order
   *    and raising `ConflictError` if it is already invoiced — the authoritative
   *    double-issue guard, held under the lock so two concurrent issues can't both
   *    pass.
   * 2. Takes the **next gapless number** for `(location, series)` via an atomic
   *    `ON CONFLICT` upsert on {@link invoiceSeries} — serialised on the unique key,
   *    so numbers are unique and sequential; a rollback releases the number rather
   *    than leaving a gap.
   * 3. Inserts the frozen header and its frozen lines (the caller's snapshot).
   * 4. Flips the RO's `invoice_status` to `invoiced` — a reference only (ADR-0002),
   *    never a rewrite of the Invoice.
   *
   * The whole thing commits or rolls back together, so a failure never leaves a
   * consumed number, a half-written Invoice, or a mismatched RO status.
   */
  async issueInvoice(values: InvoiceIssueValues): Promise<ScopedInvoice> {
    return this.#db.transaction(async (tx) => {
      // 1. Lock the order and guard double-issue under the lock.
      const orderRows = await tx
        .select({ id: repairOrder.id, invoiceStatus: repairOrder.invoiceStatus })
        .from(repairOrder)
        .where(
          and(
            eq(repairOrder.id, values.repairOrderId),
            eq(repairOrder.accountId, this.scope.accountId),
            eq(repairOrder.locationId, this.scope.locationId),
          ),
        )
        .for("update")
        .limit(1);

      const order = orderRows[0];
      if (!order) {
        throw new NotFoundError("Repair order not found");
      }
      if (order.invoiceStatus !== "not_invoiced") {
        throw new ConflictError("Repair order already has an Invoice");
      }

      // 2. Allocate the next gapless number for this (location, series).
      const counterRows = await tx
        .insert(invoiceSeries)
        .values({
          accountId: this.scope.accountId,
          locationId: this.scope.locationId,
          series: values.series,
          lastNumber: 1,
        })
        .onConflictDoUpdate({
          target: [invoiceSeries.locationId, invoiceSeries.series],
          set: { lastNumber: sql`${invoiceSeries.lastNumber} + 1`, updatedAt: new Date() },
        })
        .returning({ lastNumber: invoiceSeries.lastNumber });

      const number = counterRows[0]?.lastNumber;
      if (number === undefined) {
        throw new ConflictError("Could not allocate an invoice number");
      }

      // 3. Freeze the header…
      const headerRows = await tx
        .insert(invoice)
        .values({
          accountId: this.scope.accountId,
          locationId: this.scope.locationId,
          repairOrderId: values.repairOrderId,
          series: values.series,
          number,
          vatMode: values.vatMode,
          sellerVatNumber: values.sellerVatNumber,
          customerName: values.customerName,
          vehiclePlate: values.vehiclePlate,
          net: values.net,
          vat: values.vat,
          gross: values.gross,
          currency: values.currency,
        })
        .returning(invoiceColumns);

      const header = headerRows[0];
      if (!header) {
        throw new ConflictError("Invoice could not be issued");
      }

      // …and its lines.
      if (values.lines.length > 0) {
        await tx.insert(invoiceLine).values(
          values.lines.map((line) => ({
            accountId: this.scope.accountId,
            locationId: this.scope.locationId,
            invoiceId: header.id,
            position: line.position,
            type: line.type,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            amount: line.amount,
            currency: line.currency,
          })),
        );
      }

      // 4. Update the RO's invoice_status reference (ADR-0002).
      await tx
        .update(repairOrder)
        .set({ invoiceStatus: "invoiced", updatedAt: new Date() })
        .where(
          and(
            eq(repairOrder.id, values.repairOrderId),
            eq(repairOrder.accountId, this.scope.accountId),
            eq(repairOrder.locationId, this.scope.locationId),
          ),
        );

      const lines = await tx
        .select(invoiceLineColumns)
        .from(invoiceLine)
        .where(
          and(
            eq(invoiceLine.invoiceId, header.id),
            eq(invoiceLine.accountId, this.scope.accountId),
            eq(invoiceLine.locationId, this.scope.locationId),
          ),
        )
        .orderBy(asc(invoiceLine.position));

      return { ...header, lines };
    });
  }

  /** The scope's `{ accountId, locationId }` as a reusable Payment predicate. */
  #paymentScope() {
    return and(
      eq(payment.accountId, this.scope.accountId),
      eq(payment.locationId, this.scope.locationId),
    );
  }

  /**
   * The Payments recorded against an Invoice, oldest first (GF-15) — the order they
   * were taken, which is how they read on the document. Scoped, so Payments on
   * another Account's Invoice are invisible (an out-of-scope `invoiceId` yields none).
   */
  async listPayments(invoiceId: string): Promise<ScopedPayment[]> {
    return this.#db
      .select(paymentColumns)
      .from(payment)
      .where(and(eq(payment.invoiceId, invoiceId), this.#paymentScope()))
      .orderBy(asc(payment.createdAt), asc(payment.id));
  }

  /**
   * Record a Payment against an Invoice (GF-15, ADR-0002) — the one place a Payment
   * is taken, atomically. In a single transaction it:
   *
   * 1. Locks the Invoice row (`FOR UPDATE`) within scope, 404-ing a cross-tenant
   *    Invoice — and serialising concurrent Payments on the same Invoice, so two at
   *    once can't both read a stale paid-so-far sum and derive the wrong status.
   * 2. Refuses once a Credit Note has voided the Invoice (GF-16, ADR-0002) — a
   *    `ConflictError`, checked under the same lock, so a concurrent credit-note
   *    issue can't race a Payment through.
   * 3. Inserts the Payment, copying the Invoice's `currency` (never the caller's), so
   *    a Payment can never disagree in currency with the document it settles.
   * 4. Sums **all** the Invoice's Payments (the new one included) and derives the
   *    `payment_status` from that total versus the Invoice `gross` via `deriveStatus`
   *    — the domain rule stays in the service (this class never owns status
   *    semantics), applied here so the read+derive is atomic under the lock.
   * 5. Updates the source Repair Order's `payment_status` **reference** (ADR-0002) —
   *    it never touches the frozen Invoice snapshot, which stays immutable.
   *
   * Commits or rolls back together, so a failure never leaves a Payment without its
   * matching RO status, or a status derived from a half-applied set of Payments.
   */
  async recordPayment(
    values: PaymentWriteValues,
    deriveStatus: (totalPaidMinor: number, invoiceGrossMinor: number) => PaymentStatus,
  ): Promise<ScopedPayment> {
    return this.#db.transaction(async (tx) => {
      // 1. Lock the Invoice and read the fields the derivation needs, in scope.
      const invoiceRows = await tx
        .select({
          id: invoice.id,
          repairOrderId: invoice.repairOrderId,
          gross: invoice.gross,
          currency: invoice.currency,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.id, values.invoiceId),
            eq(invoice.accountId, this.scope.accountId),
            eq(invoice.locationId, this.scope.locationId),
          ),
        )
        .for("update")
        .limit(1);

      const settled = invoiceRows[0];
      if (!settled) {
        throw new NotFoundError("Invoice not found");
      }

      // 2. Refuse once the Invoice has been voided by a Credit Note (GF-16,
      // ADR-0002) — a credited Invoice takes no further Payments, checked under
      // the same lock so a concurrent credit-note issue can't race a Payment.
      const creditNoteRows = await tx
        .select({ id: creditNote.id })
        .from(creditNote)
        .where(
          and(
            eq(creditNote.invoiceId, settled.id),
            eq(creditNote.accountId, this.scope.accountId),
            eq(creditNote.locationId, this.scope.locationId),
          ),
        )
        .limit(1);
      if (creditNoteRows[0]) {
        throw new ConflictError("Invoice has been credited — no further Payments can be recorded");
      }

      // 3. Insert the Payment, copying the Invoice's currency (never the caller's).
      const paymentRows = await tx
        .insert(payment)
        .values({
          accountId: this.scope.accountId,
          locationId: this.scope.locationId,
          invoiceId: settled.id,
          amount: values.amount,
          method: values.method,
          note: values.note,
          currency: settled.currency,
        })
        .returning(paymentColumns);

      const created = paymentRows[0];
      if (!created) {
        throw new ConflictError("Payment could not be recorded");
      }

      // 4. Sum every Payment on this Invoice (the new one included) and derive status.
      const totalRows = await tx
        .select({ totalPaid: sql<number>`coalesce(sum(${payment.amount}), 0)` })
        .from(payment)
        .where(
          and(
            eq(payment.invoiceId, settled.id),
            eq(payment.accountId, this.scope.accountId),
            eq(payment.locationId, this.scope.locationId),
          ),
        );
      const totalPaid = Number(totalRows[0]?.totalPaid ?? 0);
      const status = deriveStatus(totalPaid, settled.gross);

      // 5. Update the RO's payment_status reference (ADR-0002) — never the Invoice.
      await tx
        .update(repairOrder)
        .set({ paymentStatus: status, updatedAt: new Date() })
        .where(
          and(
            eq(repairOrder.id, settled.repairOrderId),
            eq(repairOrder.accountId, this.scope.accountId),
            eq(repairOrder.locationId, this.scope.locationId),
          ),
        );

      return created;
    });
  }

  /** The scope's `{ accountId, locationId }` as a reusable Credit Note predicate. */
  #creditNoteScope() {
    return and(
      eq(creditNote.accountId, this.scope.accountId),
      eq(creditNote.locationId, this.scope.locationId),
    );
  }

  /** The scope's `{ accountId, locationId }` as a reusable Credit-Note-line predicate. */
  #creditNoteLineScope() {
    return and(
      eq(creditNoteLine.accountId, this.scope.accountId),
      eq(creditNoteLine.locationId, this.scope.locationId),
    );
  }

  /** The frozen lines of one Credit Note, in document order (`position`), scoped. */
  async #loadCreditNoteLines(creditNoteId: string): Promise<ScopedCreditNoteLine[]> {
    return this.#db
      .select(creditNoteLineColumns)
      .from(creditNoteLine)
      .where(and(eq(creditNoteLine.creditNoteId, creditNoteId), this.#creditNoteLineScope()))
      .orderBy(asc(creditNoteLine.position));
  }

  /** A single Credit Note with its frozen lines, or `NotFoundError` if out of scope. */
  async getCreditNote(id: string): Promise<ScopedCreditNote> {
    const rows = await this.#db
      .select(creditNoteColumns)
      .from(creditNote)
      .where(and(eq(creditNote.id, id), this.#creditNoteScope()))
      .limit(1);

    const header = rows[0];
    if (!header) {
      throw new NotFoundError("Credit note not found");
    }
    return { ...header, lines: await this.#loadCreditNoteLines(header.id) };
  }

  /**
   * The Credit Note that corrects a given Invoice (ADR-0002 reference), or `null`
   * when the Invoice has not been credited. Scoped, so an Invoice in another
   * Account's Location yields `null`, never a cross-tenant read. At most one Credit
   * Note per Invoice in the MVP (a full correction); if that ever changes, the
   * newest number wins.
   */
  async getCreditNoteForInvoice(invoiceId: string): Promise<ScopedCreditNote | null> {
    const rows = await this.#db
      .select(creditNoteColumns)
      .from(creditNote)
      .where(and(eq(creditNote.invoiceId, invoiceId), this.#creditNoteScope()))
      .orderBy(desc(creditNote.number))
      .limit(1);

    const header = rows[0];
    if (!header) {
      return null;
    }
    return { ...header, lines: await this.#loadCreditNoteLines(header.id) };
  }

  /**
   * Issue a Credit Note against an issued Invoice (GF-16, ADR-0002) — the one place
   * the frozen corrective document is created, atomically. In a single transaction
   * it:
   *
   * 1. Locks the **Invoice** row (`FOR UPDATE`) within scope, 404-ing a cross-tenant
   *    Invoice. The lock only serialises concurrent issuance and confirms the Invoice
   *    exists — it never writes the Invoice, which stays immutable.
   * 2. Guards **one Credit Note per Invoice** (the MVP's full correction): if one
   *    already references this Invoice, raises `ConflictError` — checked under the
   *    lock so two concurrent issues can't both pass.
   * 3. Takes the **next gapless number** for `(location, series)` via an atomic
   *    `ON CONFLICT` upsert on {@link creditNoteSeries} — serialised on the unique
   *    key, so numbers are unique and sequential; a rollback releases the number.
   * 4. Inserts the frozen header and its frozen lines (the caller's snapshot).
   * 5. Flips the RO's `invoiceStatus`/`paymentStatus` references to `credited` — so
   *    a voided Invoice is never left showing as still `invoiced`/`paid` on the RO
   *    list/board, and so {@link recordPayment}'s own guard has a state to check.
   *
   * It deliberately never touches the Invoice itself — a Credit Note is a pure
   * append, so the original Invoice remains immutable (the load-bearing ADR-0002
   * rule). Commits or rolls back together, so a failure never leaves a consumed
   * number, a half-written Credit Note, or an RO status out of step with it.
   */
  async issueCreditNote(values: CreditNoteIssueValues): Promise<ScopedCreditNote> {
    return this.#db.transaction(async (tx) => {
      // 1. Lock the Invoice and confirm it is in scope — never mutating it.
      const invoiceRows = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(
          and(
            eq(invoice.id, values.invoiceId),
            eq(invoice.accountId, this.scope.accountId),
            eq(invoice.locationId, this.scope.locationId),
          ),
        )
        .for("update")
        .limit(1);

      if (!invoiceRows[0]) {
        throw new NotFoundError("Invoice not found");
      }

      // 2. Guard one Credit Note per Invoice (MVP full correction), under the lock.
      const existing = await tx
        .select({ id: creditNote.id })
        .from(creditNote)
        .where(
          and(
            eq(creditNote.invoiceId, values.invoiceId),
            eq(creditNote.accountId, this.scope.accountId),
            eq(creditNote.locationId, this.scope.locationId),
          ),
        )
        .limit(1);

      if (existing[0]) {
        throw new ConflictError("Invoice already has a credit note");
      }

      // 3. Allocate the next gapless number for this (location, series).
      const counterRows = await tx
        .insert(creditNoteSeries)
        .values({
          accountId: this.scope.accountId,
          locationId: this.scope.locationId,
          series: values.series,
          lastNumber: 1,
        })
        .onConflictDoUpdate({
          target: [creditNoteSeries.locationId, creditNoteSeries.series],
          set: { lastNumber: sql`${creditNoteSeries.lastNumber} + 1`, updatedAt: new Date() },
        })
        .returning({ lastNumber: creditNoteSeries.lastNumber });

      const number = counterRows[0]?.lastNumber;
      if (number === undefined) {
        throw new ConflictError("Could not allocate a credit note number");
      }

      // 4. Freeze the header…
      const headerRows = await tx
        .insert(creditNote)
        .values({
          accountId: this.scope.accountId,
          locationId: this.scope.locationId,
          invoiceId: values.invoiceId,
          repairOrderId: values.repairOrderId,
          series: values.series,
          number,
          invoiceSeries: values.invoiceSeries,
          invoiceNumber: values.invoiceNumber,
          vatMode: values.vatMode,
          sellerVatNumber: values.sellerVatNumber,
          customerName: values.customerName,
          vehiclePlate: values.vehiclePlate,
          net: values.net,
          vat: values.vat,
          gross: values.gross,
          reason: values.reason,
          currency: values.currency,
        })
        .returning(creditNoteColumns);

      const header = headerRows[0];
      if (!header) {
        throw new ConflictError("Credit note could not be issued");
      }

      // …and its lines.
      if (values.lines.length > 0) {
        await tx.insert(creditNoteLine).values(
          values.lines.map((line) => ({
            accountId: this.scope.accountId,
            locationId: this.scope.locationId,
            creditNoteId: header.id,
            position: line.position,
            type: line.type,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            amount: line.amount,
            currency: line.currency,
          })),
        );
      }

      const lines = await tx
        .select(creditNoteLineColumns)
        .from(creditNoteLine)
        .where(
          and(
            eq(creditNoteLine.creditNoteId, header.id),
            eq(creditNoteLine.accountId, this.scope.accountId),
            eq(creditNoteLine.locationId, this.scope.locationId),
          ),
        )
        .orderBy(asc(creditNoteLine.position));

      // 5. Flip the RO's invoice/payment status references (ADR-0002) — never the
      // Invoice above.
      await tx
        .update(repairOrder)
        .set({ invoiceStatus: "credited", paymentStatus: "credited", updatedAt: new Date() })
        .where(
          and(
            eq(repairOrder.id, values.repairOrderId),
            eq(repairOrder.accountId, this.scope.accountId),
            eq(repairOrder.locationId, this.scope.locationId),
          ),
        );

      return { ...header, lines };
    });
  }

  /** The scope's `{ accountId, locationId }` as a reusable Appointment predicate. */
  #appointmentScope() {
    return and(
      eq(appointment.accountId, this.scope.accountId),
      eq(appointment.locationId, this.scope.locationId),
    );
  }

  /**
   * Assert an optional Customer is in the caller's scope. `null` (a walk-in slot,
   * no named Customer) is always fine; a `customerId` from another Account's
   * Location raises `NotFoundError`, so an Appointment can never name a
   * cross-tenant Customer — the FK alone is not scope-aware.
   */
  async #assertCustomerInScope(customerId: string | null): Promise<void> {
    if (customerId === null) {
      return;
    }
    const rows = await this.#db
      .select({ id: customer.id })
      .from(customer)
      .where(and(eq(customer.id, customerId), this.#customerScope()))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundError("Customer not found");
    }
  }

  /**
   * Assert an optional Appointment is in the caller's scope (GF-19). `null` (a
   * walk-in, no booking) is always fine; an `appointmentId` from another Account's
   * Location raises `NotFoundError`, so a Repair Order can never link to a
   * cross-tenant Appointment.
   */
  async #assertAppointmentInScope(appointmentId: string | null): Promise<void> {
    if (appointmentId === null) {
      return;
    }
    const rows = await this.#db
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.id, appointmentId), this.#appointmentScope()))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundError("Appointment not found");
    }
  }

  /**
   * The full Appointment projection: base columns plus the joined Vehicle
   * identity, the reserved Mechanic's name, and the resolved `customerName` — the
   * linked Customer's own name when present, else the free-text booking name
   * (CONTEXT.md). Every join is left: each link is optional (a walk-in has none),
   * so the joined fields are null when unset. Constrained to the caller's scope by
   * `where`.
   */
  #selectAppointments(where: ReturnType<typeof and>) {
    return this.#db
      .select({
        ...appointmentColumns,
        vehiclePlate: vehicle.plate,
        vehicleVin: vehicle.vin,
        mechanicName: mechanic.name,
        customerName: sql<string | null>`coalesce(${customer.name}, ${appointment.customerName})`,
      })
      .from(appointment)
      .leftJoin(customer, eq(customer.id, appointment.customerId))
      .leftJoin(vehicle, eq(vehicle.id, appointment.vehicleId))
      .leftJoin(mechanic, eq(mechanic.id, appointment.mechanicId))
      .where(where);
  }

  /**
   * Appointments whose slot **starts** within the half-open `[from, to)` range,
   * earliest first — the query behind one day of the agenda (GF-19). Ordering is
   * by `startsAt` then `endsAt` then `id`, a total order so the day reads
   * deterministically. Scoped, so another Account's slots are invisible.
   */
  async listAppointments(range: { from: Date; to: Date }): Promise<ScopedAppointment[]> {
    return this.#selectAppointments(
      and(
        this.#appointmentScope(),
        gte(appointment.startsAt, range.from),
        lt(appointment.startsAt, range.to),
      ),
    ).orderBy(asc(appointment.startsAt), asc(appointment.endsAt), asc(appointment.id));
  }

  /** A single Appointment, or `NotFoundError` if it is not in the caller's scope. */
  async getAppointment(id: string): Promise<ScopedAppointment> {
    const rows = await this.#selectAppointments(
      and(eq(appointment.id, id), this.#appointmentScope()),
    ).limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Appointment not found");
    }
    return row;
  }

  /**
   * Book an Appointment in the current Location (GF-19). The optional Customer,
   * Vehicle and Mechanic links are each checked for scope membership first, so
   * none can point across the tenant boundary. It deliberately never checks for an
   * overlapping slot: ADR-0007 defers double-booking *prevention* — conflicts are
   * surfaced on the agenda, not blocked here.
   */
  async createAppointment(values: AppointmentWriteValues): Promise<ScopedAppointment> {
    await this.#assertCustomerInScope(values.customerId);
    await this.#assertVehicleInScope(values.vehicleId);
    await this.#assertMechanicInScope(values.mechanicId);

    const rows = await this.#db
      .insert(appointment)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
        ...values,
      })
      .returning({ id: appointment.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Appointment could not be created");
    }
    return this.getAppointment(row.id);
  }

  /**
   * Cancel an Appointment within the caller's scope (GF-19) — the only status
   * change the slot ever makes (there is no hard delete, matching the other
   * tables). The `WHERE` is scoped, so a slot in another Account's Location is
   * invisible and cancelling it raises `NotFoundError`. Idempotent: cancelling an
   * already-cancelled slot is a no-op that still returns it.
   */
  async cancelAppointment(id: string): Promise<ScopedAppointment> {
    const rows = await this.#db
      .update(appointment)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(appointment.id, id), this.#appointmentScope()))
      .returning({ id: appointment.id });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Appointment not found");
    }
    return this.getAppointment(row.id);
  }
}
