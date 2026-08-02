/**
 * Domain schema (ADR-0011). Speaks the ubiquitous language (CONTEXT.md).
 *
 * All operational data scopes to a **Location** (ADR-0003). A Location belongs
 * to an **Account** (the paying tenant, persisted as Better Auth's
 * `organization` — see auth-schema.ts). Later slices add tenant-scoped tables
 * (Customer, Vehicle, Repair Order, …), each carrying `accountId` + `locationId`
 * and reached only through ScopedDb (ADR-0013).
 */

import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_VAT_RATE, VAT_MODES } from "../../lib/vat";
import { organization, user } from "./auth-schema";

// VAT domain constants/types live in a transport-free module (src/lib/vat) so
// client components can import them without the DB client; re-exported here for
// server code that reaches for them via the schema (GF-12, ADR-0006).
export { DEFAULT_VAT_RATE, VAT_MODES, type VatMode } from "../../lib/vat";

/**
 * **Kanban Stage** (GF-10) — where a Vehicle physically is in the workflow
 * (CONTEXT.md). A **fixed, ordered** set of six: a Location may *hide* stages it
 * doesn't use but can never add or reorder them, so this tuple — declared once,
 * in order — is the single source of truth for the whole board. Stage is
 * deliberately independent of `invoice_status`/`payment_status` (ADR-0002): a car
 * can be `delivered` while still `unpaid`, or `repairing` while already invoiced.
 */
export const KANBAN_STAGES = [
  "waiting",
  "diagnosing",
  "waiting_for_parts",
  "repairing",
  "ready",
  "delivered",
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];
export const kanbanStage = pgEnum("kanban_stage", KANBAN_STAGES);

/** The opening stage every Repair Order starts in when the car arrives. */
export const INITIAL_KANBAN_STAGE: KanbanStage = "waiting";

/** `delivered` is **terminal** (CONTEXT.md): an order there does not move on. */
export const TERMINAL_KANBAN_STAGE: KanbanStage = "delivered";

/**
 * A Location's **VAT mode** column (GF-12, ADR-0006). VAT is a per-Location
 * setting: a `registered` Location charges VAT at its configured `vat_rate`; a
 * `not_registered` one (below the registration threshold) issues invoices that
 * carry **no VAT at all** — a *true* zero-VAT mode, not a cosmetic 0% rate. The
 * distinction drives the Invoice/VAT math (see `computeRepairOrderTotals`).
 */
export const vatMode = pgEnum("vat_mode", VAT_MODES);

export const location = pgTable("location", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /**
   * VAT registration mode (GF-12, ADR-0006). Defaults to `registered`: the common
   * case for shops adopting the software, and it preserves the standard 20%-VAT
   * фактура until an owner explicitly switches a below-threshold Location to
   * `not_registered` in settings. Never fabricates the *opposite* error silently —
   * onboarding surfaces the choice alongside the fiscal-device disclosure.
   */
  vatMode: vatMode("vat_mode").notNull().default("registered"),
  /**
   * The Location's default VAT rate in **basis points** (20% → 2000), applied to
   * new Line Items when `registered`. Individual lines may still carry a reduced
   * rate; this only seeds the form. Ignored entirely when `not_registered`.
   */
  vatRate: integer("vat_rate").notNull().default(DEFAULT_VAT_RATE),
  /** ДДС registration number, shown on issued фактури; null when not registered. */
  vatNumber: text("vat_number"),
  /**
   * Kanban Stages this Location hides on its board (GF-10). The set of stages is
   * fixed (see {@link KANBAN_STAGES}) — a Location can only *hide* the ones it
   * doesn't use, never add or reorder — so this is a subset of that tuple, empty
   * by default (every stage shown).
   */
  hiddenStages: kanbanStage("hidden_stages").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LocationRow = typeof location.$inferSelect;

/**
 * A **Customer** is a person or organization the garage does work for
 * (CONTEXT.md). The `kind` distinguishes the two so the UI and, later, invoicing
 * can treat an individual differently from a company (which carries a tax id).
 */
export const CUSTOMER_KINDS = ["person", "organization"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];
export const customerKind = pgEnum("customer_kind", CUSTOMER_KINDS);

/**
 * Customer (GF-04) — the core-loop entry point. Scoped to a **Location**
 * (ADR-0003): every row carries `accountId` + `locationId` and is only ever
 * reached through ScopedDb (ADR-0013). A Customer owns zero or more Vehicles
 * (GF-05 adds the link), so it can exist on its own.
 *
 * There is deliberately no hard-delete path: right-to-erasure is Anonymization,
 * handled separately (ADR-0004, GF-21), not row removal.
 */
export const customer = pgTable("customer", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  kind: customerKind("kind").notNull().default("person"),
  /** Person's full name or organization name — what lists show. */
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  /** Company tax id (ЕИК/ДДС) — relevant for organization Customers. */
  taxId: text("tax_id"),
  /** Internal free-text note, never shown to the Customer. */
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CustomerRow = typeof customer.$inferSelect;

/**
 * A **Vehicle** is a specific car or motorcycle the garage services
 * (CONTEXT.md). ADR-0001 scopes the MVP to general repair, so `kind` is limited
 * to those two — no tire/body/fleet variants.
 */
export const VEHICLE_KINDS = ["car", "motorcycle"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];
export const vehicleKind = pgEnum("vehicle_kind", VEHICLE_KINDS);

/**
 * Vehicle (GF-05). Identified primarily by registration `plate` and `vin`
 * (CONTEXT.md); the plate/VIN pair is the search wedge (ADR-0008). Scoped to a
 * **Location** like every operational row (ADR-0003) and reached only through
 * ScopedDb (ADR-0013).
 *
 * `customerId` is the **current owner** — a pointer, not history. Ownership can
 * change over time (resale): reassigning it is a plain update. The Service
 * History (GF-18) keys off the Vehicle via Repair Orders, never off this owner
 * link, so a Vehicle keeps its full history across owners. There is deliberately
 * no hard-delete path, matching Customer.
 */
export const vehicle = pgTable("vehicle", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The current-owner Customer. Cascades so tearing down an Account is clean. */
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customer.id, { onDelete: "cascade" }),
  kind: vehicleKind("kind").notNull().default("car"),
  /** Registration plate — the everyday identifier the front desk searches by. */
  plate: text("plate"),
  /** Vehicle Identification Number — the stable, globally-unique identifier. */
  vin: text("vin"),
  make: text("make"),
  model: text("model"),
  /** Model/manufacture year. */
  year: integer("year"),
  color: text("color"),
  /** Internal free-text note, never shown to the Customer. */
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type VehicleRow = typeof vehicle.$inferSelect;

/**
 * A **Mechanic** is an assignable worker a Repair Order or Line Item is given to
 * (CONTEXT.md, GF-07). In the MVP it is often just a `name` with no login —
 * deliberately distinct from a **User**: the per-plan "mechanic" limit counts
 * Mechanics, not Users, and a Mechanic need not be able to sign in.
 *
 * `userId` is the optional, Phase-2 link to a login User (granted when a Mechanic
 * gets mobile-app access). It stays `null` in the MVP and is not surfaced in the
 * UI yet; `on delete set null` means removing that User only unlinks the login,
 * it never deletes the Mechanic or its labor attribution. Scoped to a
 * **Location** like every operational row (ADR-0003), reached only through
 * ScopedDb (ADR-0013). There is no hard-delete path, matching Customer/Vehicle —
 * a Mechanic referenced by past Line Items must survive for labor history.
 */
export const mechanic = pgTable("mechanic", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** Optional Phase-2 link to a login User (mobile-app access). Null in the MVP. */
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  /** The Mechanic's name — what pickers and lists show. */
  name: text("name").notNull(),
  /** Internal free-text note (specialty, phone, …), never shown to the Customer. */
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MechanicRow = typeof mechanic.$inferSelect;

/**
 * Whether a Repair Order has been turned into an Invoice yet. This is a
 * **reference only** on the RO (ADR-0002): the Invoice is the immutable
 * first-class document, and this flag is set by the invoicing slice (GF-14),
 * never by editing an issued Invoice. `not_invoiced` is the opening state.
 */
export const INVOICE_STATUSES = ["not_invoiced", "invoiced"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatus = pgEnum("invoice_status", INVOICE_STATUSES);

/**
 * Where a Repair Order stands on getting paid. Also a **reference only** on the
 * RO (ADR-0002): Payments are recorded against the Invoice (GF-15), which sets
 * this — supporting partial payment. `unpaid` is the opening state.
 */
export const PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatus = pgEnum("payment_status", PAYMENT_STATUSES);

/**
 * How a **Payment** against an Invoice was taken (GF-15). A small fixed set for
 * the MVP — the front desk records cash, a card terminal, or a bank transfer.
 * Purely descriptive: the method never affects the payment math or the derived
 * `payment_status`, it just records how the money arrived. `cash` is the opening
 * default, the common walk-in case.
 */
export const PAYMENT_METHODS = ["cash", "card", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);

/**
 * A **Repair Order** is the central work record for one visit of one Vehicle
 * (CONTEXT.md, GF-08) — the heart of the app. It captures the **Complaint** (the
 * customer's words) and the **Diagnosis** (the mechanic's finding) as two
 * distinct fields (ADR-0009), both optional so an order can be opened the moment
 * a car arrives and filled in as work proceeds.
 *
 * `mechanicId` is the single assigned **lead** Mechanic — an *optional* owner of
 * the order (ADR-0009); the actual "who did what, for how long" is attributed on
 * Labor Line Items later, not here. `on delete set null` keeps the order (and its
 * history) when a Mechanic is unlinked.
 *
 * `stage` is the **Kanban Stage** (GF-10) — where the car is in the workflow. It
 * opens in {@link INITIAL_KANBAN_STAGE} and advances across the fixed six
 * (CONTEXT.md); it is independent of the invoice/payment references below
 * (ADR-0002), so progress on the board never implies anything about billing.
 *
 * `invoiceStatus` and `paymentStatus` live here as **references only** (ADR-0002):
 * the Invoice is a separate immutable legal document, and these flags are set by
 * the invoicing/payment slices (GF-14/GF-15) — never by this create/edit path,
 * which is why they are absent from the caller-settable write values. Scoped to a
 * **Location** like every operational row (ADR-0003), reached only through
 * ScopedDb (ADR-0013). There is no hard-delete path, matching the other tables.
 */
export const repairOrder = pgTable("repair_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The Vehicle this visit is about. Cascades so tearing down an Account is clean. */
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicle.id, { onDelete: "cascade" }),
  /** Optional lead Mechanic (ADR-0009). Unlinking a Mechanic nulls this, not the order. */
  mechanicId: uuid("mechanic_id").references(() => mechanic.id, { onDelete: "set null" }),
  /** The problem in the customer's own words (CONTEXT.md). Distinct from the Diagnosis. */
  complaint: text("complaint"),
  /** The mechanic's finding after inspection (CONTEXT.md). Distinct from the Complaint. */
  diagnosis: text("diagnosis"),
  /** Kanban Stage (GF-10) — opens at `waiting`, independent of invoice/payment (ADR-0002). */
  stage: kanbanStage("stage").notNull().default(INITIAL_KANBAN_STAGE),
  /** Reference-only invoicing state (ADR-0002) — set by GF-14, not by editing an Invoice. */
  invoiceStatus: invoiceStatus("invoice_status").notNull().default("not_invoiced"),
  /** Reference-only payment state (ADR-0002) — set by GF-15 from Payments on the Invoice. */
  paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RepairOrderRow = typeof repairOrder.$inferSelect;

/**
 * A **Line Item**'s kind (ADR-0009). A **Labor** line attributes to a Mechanic
 * and carries hours × rate; a **Part** line carries quantity × unit price. Both
 * feed the Invoice and all revenue/profit reporting (CONTEXT.md).
 */
export const LINE_ITEM_TYPES = ["labor", "part"] as const;
export type LineItemType = (typeof LINE_ITEM_TYPES)[number];
export const lineItemType = pgEnum("line_item_type", LINE_ITEM_TYPES);

/**
 * A **Line Item** is one priced row on a Repair Order, typed Labor or Part
 * (CONTEXT.md, GF-09, ADR-0009). The Invoice and all revenue/profit reporting
 * build from Line Items — the RO's lead Mechanic is *not* used for labor
 * attribution.
 *
 * Money and quantities are stored exact — never floats (ADR-0011):
 * - `quantity` is in **thousandths** — the hours on a Labor line (1.5h → 1500),
 *   the count on a Part line (4 → 4000). Three decimals covers quarter-hours and
 *   split quantities (e.g. 2.5 L of oil).
 * - `unitPrice` and `amount` are **integer minor units** of `currency` — the
 *   hourly rate / unit price, and the computed net line total
 *   (`amount = round(quantity × unitPrice / 1000)`), (re)set on every write.
 * - `vatRate` is in **basis points** (20% → 2000), carried per line and consumed
 *   by GF-12/GF-14 (invoicing); it is *not* folded into `amount`, which is net.
 *
 * `mechanicId` is the labor attribution — the Mechanic who performed a Labor line,
 * so several mechanics can contribute to one order; it is null on Part lines.
 * `on delete set null` keeps a line (and its money) if a Mechanic is ever
 * unlinked, matching the RO lead. Unlike the aggregates, a Line Item **is**
 * deletable: it is a child row of a not-yet-invoiced Repair Order — the Invoice
 * freezes its lines at issue (ADR-0002), and until then the front desk adds,
 * edits and removes them freely. Scoped to a **Location** (ADR-0003), reached
 * only through ScopedDb (ADR-0013).
 */
export const lineItem = pgTable("line_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The Repair Order this line belongs to. Cascades so removing an order is clean. */
  repairOrderId: uuid("repair_order_id")
    .notNull()
    .references(() => repairOrder.id, { onDelete: "cascade" }),
  type: lineItemType("type").notNull(),
  /** Labor attribution — the Mechanic who did the work (ADR-0009); null on Part lines. */
  mechanicId: uuid("mechanic_id").references(() => mechanic.id, { onDelete: "set null" }),
  /** What the line is, in words — shown on the Work Card and the Invoice. */
  description: text("description").notNull(),
  /** Hours (Labor) or count (Part), in thousandths — never a float (ADR-0011). */
  quantity: integer("quantity").notNull(),
  /** Hourly rate (Labor) or unit price (Part), in integer minor units of `currency`. */
  unitPrice: integer("unit_price").notNull(),
  /** Per-line VAT rate in basis points (20% → 2000), consumed by GF-12/GF-14. */
  vatRate: integer("vat_rate").notNull(),
  /** Net line total = round(quantity × unitPrice / 1000), in minor units; set on write. */
  amount: integer("amount").notNull(),
  /** Explicit currency for the money columns (ADR-0011); BGN in the MVP. */
  currency: text("currency").notNull().default("BGN"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LineItemRow = typeof lineItem.$inferSelect;

/**
 * The **legal series** an Invoice's gapless number is drawn from. Bulgarian VAT
 * law numbers invoices per series; the MVP issues from a single default series
 * per Location, but the concept is modelled from day one so multiple series ship
 * as a feature, not a migration (mirrors how Location is modelled before
 * multi-branch, ADR-0003).
 */
export const DEFAULT_INVOICE_SERIES = "A";

/**
 * The gapless-numbering counter (GF-14, ADR-0002/0006). Bulgarian VAT law requires
 * a **gapless sequential number per legal series per Location** — so the counter is
 * keyed by `(locationId, series)` and holds the **last** number issued in that
 * series. Issuing an Invoice increments it atomically (an `ON CONFLICT` upsert
 * serialised on the unique key, inside the same transaction as the Invoice insert),
 * so two concurrent issues can never take the same number and a rolled-back issue
 * releases its number rather than leaving a gap. This is deliberately its own
 * table, not a column on the Invoice — the number source must survive independently
 * of any single document (ADR-0002: do not "simplify" the machinery away).
 */
export const invoiceSeries = pgTable(
  "invoice_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    /** The legal series these numbers belong to (CONTEXT.md); `A` in the MVP. */
    series: text("series").notNull().default(DEFAULT_INVOICE_SERIES),
    /** The last number issued in this `(location, series)`; the next Invoice takes `+1`. */
    lastNumber: integer("last_number").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("invoice_series_location_series_unique").on(t.locationId, t.series)],
);

export type InvoiceSeriesRow = typeof invoiceSeries.$inferSelect;

/**
 * An **Invoice** is a first-class legal document generated from a Repair Order's
 * Line Items and **frozen at issue time** (CONTEXT.md, GF-14, ADR-0002): it
 * snapshots the priced lines, the amounts, and the VAT, and never changes
 * afterward — corrections happen through a Credit Note, never by editing. The
 * table is **append-only**: there is no update or delete path in the domain, so
 * editing the source Repair Order (its lines, its Customer) cannot alter an issued
 * Invoice.
 *
 * `number` is the **gapless sequential number** within `series`, drawn from
 * {@link invoiceSeries}; the `(locationId, series, number)` unique index is the
 * hard guarantee that a number is never duplicated. `issuedAt` is the freeze time.
 *
 * Everything else is a **snapshot** taken at issue, not a live reference:
 * - `vatMode` + `sellerVatNumber` — the Location's VAT registration as it stood,
 *   so a later settings change never rewrites history (ADR-0006).
 * - `customerName` + `vehiclePlate` — the buyer/vehicle identity as printed.
 * - `net` / `vat` / `gross` — the money totals in **integer minor units** of
 *   `currency` (ADR-0011). `vat` is **null** when the Location is not VAT-registered
 *   — a true zero-VAT invoice, distinct from a `0` that would mean "VAT applies and
 *   is zero" (ADR-0006).
 *
 * `repairOrderId` records which order it was issued from (a back-reference for the
 * RO's `invoice_status`, ADR-0002); it deliberately carries **none** of the Work
 * Card's internal narrative (Complaint/Diagnosis) — the Invoice is the
 * financial/legal subset only (ADR-0009). Scoped to a **Location** (ADR-0003),
 * reached only through ScopedDb (ADR-0013).
 */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    /** The Repair Order this Invoice was issued from (ADR-0002 back-reference). */
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id, { onDelete: "cascade" }),
    /** The legal series (CONTEXT.md); pairs with {@link invoiceSeries}. */
    series: text("series").notNull().default(DEFAULT_INVOICE_SERIES),
    /** Gapless sequential number within `series` — unique per Location per series. */
    number: integer("number").notNull(),
    /** The freeze time — when the lines/amounts/VAT below became immutable. */
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    /** Snapshot of the Location's VAT mode at issue (ADR-0006). */
    vatMode: vatMode("vat_mode").notNull(),
    /** Snapshot of the seller's ДДС number at issue; null when not registered. */
    sellerVatNumber: text("seller_vat_number"),
    /** Snapshot of the buyer's name as printed on the document. */
    customerName: text("customer_name").notNull(),
    /** Snapshot of the Vehicle's registration plate, when it had one. */
    vehiclePlate: text("vehicle_plate"),
    /** Net total (sum of line amounts) in integer minor units (ADR-0011). */
    net: integer("net").notNull(),
    /** VAT total in minor units, or **null** when the Location is not registered (ADR-0006). */
    vat: integer("vat"),
    /** Gross total (`net + vat`, or `net` when no VAT applies) in minor units. */
    gross: integer("gross").notNull(),
    /** Explicit currency for the money columns (ADR-0011); BGN in the MVP. */
    currency: text("currency").notNull().default("BGN"),
  },
  (t) => [unique("invoice_location_series_number_unique").on(t.locationId, t.series, t.number)],
);

export type InvoiceRow = typeof invoice.$inferSelect;

/**
 * One **frozen** priced row on an issued Invoice (GF-14, ADR-0002) — the snapshot
 * of a Line Item as it stood at issue time. It is a *copy*, not a reference: the
 * source Line Item stays editable/deletable on a not-yet-invoiced Repair Order, but
 * once frozen here nothing about it changes. `position` preserves the order the
 * lines were entered, which is how they read on the document.
 *
 * The money/quantity columns keep the same exact integer encodings as Line Item
 * (`quantity` in thousandths, `unitPrice`/`amount` in minor units, `vatRate` in
 * basis points — see {@link lineItem}). It deliberately does **not** copy the
 * attributed Mechanic: labor attribution belongs to the Work Card (ADR-0009), not
 * the legal document. Scoped to a **Location** (ADR-0003), reached only through
 * ScopedDb (ADR-0013).
 */
export const invoiceLine = pgTable("invoice_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The Invoice this frozen line belongs to. Cascades with the Invoice. */
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  /** 1-based order the line appeared on the source Repair Order, preserved on the document. */
  position: integer("position").notNull(),
  type: lineItemType("type").notNull(),
  /** What the line is, in words — copied from the Line Item at issue. */
  description: text("description").notNull(),
  /** Hours (Labor) or count (Part), in thousandths — frozen (ADR-0011). */
  quantity: integer("quantity").notNull(),
  /** Hourly rate (Labor) or unit price (Part), in integer minor units — frozen. */
  unitPrice: integer("unit_price").notNull(),
  /** Per-line VAT rate in basis points (20% → 2000) — frozen. */
  vatRate: integer("vat_rate").notNull(),
  /** Net line total in minor units — frozen at the value computed at issue. */
  amount: integer("amount").notNull(),
  /** Explicit currency for the money columns (ADR-0011); BGN in the MVP. */
  currency: text("currency").notNull().default("BGN"),
});

export type InvoiceLineRow = typeof invoiceLine.$inferSelect;

/**
 * A **Payment** recorded against an Invoice (GF-15, ADR-0002). Payments settle the
 * Invoice — never the Repair Order and never the frozen document itself: an
 * Invoice can take **several** Payments, and their `amount`s **sum toward its
 * gross total**, which is how partial payment works. The RO's `payment_status` is
 * derived from that sum versus the Invoice total and updated as a **reference**
 * (ADR-0002), so recording a Payment touches the RO's status flag but leaves the
 * immutable Invoice snapshot untouched.
 *
 * The table is **append-only**, matching the Invoice's immutability theme: a
 * Payment is a financial record, so there is no update or delete path in the
 * domain — a mistaken Payment is corrected by a future reversing entry, not by
 * editing history. `amount` is **integer minor units** of `currency` (ADR-0011),
 * copied from the Invoice at record time so a Payment can never be in a different
 * currency than the document it settles. `method` records *how* the money arrived
 * (see {@link PAYMENT_METHODS}); it never affects the math. `createdAt` is the
 * record/receipt time — the single timestamp the MVP needs (back-dating a Payment
 * is a later concern). Scoped to a **Location** (ADR-0003), reached only through
 * ScopedDb (ADR-0013).
 */
export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The Invoice this Payment settles (ADR-0002). Cascades with the Invoice. */
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  /** The amount received, in integer minor units of `currency` (ADR-0011); always > 0. */
  amount: integer("amount").notNull(),
  /** How the money arrived (GF-15); descriptive only, never affects the math. */
  method: paymentMethod("method").notNull().default("cash"),
  /** Optional free-text note (a reference number, a remark), never shown to the Customer. */
  note: text("note"),
  /** Explicit currency, copied from the Invoice at record time (ADR-0011); BGN in the MVP. */
  currency: text("currency").notNull().default("BGN"),
  /** When the Payment was recorded/received — the single timestamp the MVP needs. */
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PaymentRow = typeof payment.$inferSelect;

/**
 * The **legal series** a Credit Note's gapless number is drawn from — its **own**
 * series, kept separate from the Invoice's (GF-16, ADR-0002). Bulgarian VAT law
 * numbers corrective documents sequentially; the MVP issues from a single default
 * series per Location, modelled from day one like {@link DEFAULT_INVOICE_SERIES}.
 * A Credit Note draws from {@link creditNoteSeries}, never from the Invoice
 * counter, so the two document types never share or interleave numbers — a unified
 * legal sequence across document types is a fiscalization concern, deferred by
 * ADR-0006.
 */
export const DEFAULT_CREDIT_NOTE_SERIES = "A";

/**
 * The gapless-numbering counter for Credit Notes (GF-16, ADR-0002) — the exact
 * twin of {@link invoiceSeries}, keyed by `(locationId, series)` and holding the
 * **last** number issued in that series. Issuing a Credit Note increments it
 * atomically (an `ON CONFLICT` upsert serialised on the unique key, inside the same
 * transaction as the Credit Note insert), so two concurrent issues can never take
 * the same number and a rolled-back issue releases its number rather than leaving a
 * gap. Its own table, distinct from {@link invoiceSeries}: the Credit Note's number
 * source must survive independently and never draw from the Invoice counter.
 */
export const creditNoteSeries = pgTable(
  "credit_note_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    /** The legal series these numbers belong to (CONTEXT.md); `A` in the MVP. */
    series: text("series").notNull().default(DEFAULT_CREDIT_NOTE_SERIES),
    /** The last number issued in this `(location, series)`; the next Credit Note takes `+1`. */
    lastNumber: integer("last_number").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("credit_note_series_location_series_unique").on(t.locationId, t.series)],
);

export type CreditNoteSeriesRow = typeof creditNoteSeries.$inferSelect;

/**
 * A **Credit Note** is the corrective legal document that adjusts an already-issued
 * Invoice — the only way to "change" one (CONTEXT.md, GF-16, ADR-0002). It
 * **references** the Invoice it corrects (`invoiceId`) and, like the Invoice, is
 * **frozen at issue** and **append-only**: no update or delete path in the domain,
 * so issuing a Credit Note never edits the original Invoice, which stays immutable.
 *
 * `number` is the **gapless sequential number** within `series`, drawn from
 * {@link creditNoteSeries}; the `(locationId, series, number)` unique index is the
 * hard guarantee a number is never duplicated. `issuedAt` is the freeze time.
 *
 * Everything else is a **snapshot** taken at issue, copied from the credited
 * Invoice so the corrective document is self-contained and a later change to the
 * source can never rewrite it:
 * - `invoiceSeries` + `invoiceNumber` — the original Invoice's printed number, so
 *   the Credit Note reads "corrective to Invoice A-0000000001" without a join.
 * - `vatMode` + `sellerVatNumber` — the Invoice's VAT registration as it stood.
 * - `customerName` + `vehiclePlate` — the buyer/vehicle identity as printed.
 * - `net` / `vat` / `gross` — the amounts credited back, in **integer minor units**
 *   of `currency` (ADR-0011), stored as positive values (the value returned to the
 *   Customer). `vat` is **null** when the Invoice carried no VAT (ADR-0006).
 * - `reason` — optional free text recording *why* the correction was issued.
 *
 * The MVP issues a **full** Credit Note (it credits the whole Invoice), so at most
 * one references any Invoice — the guard lives in {@link ScopedDb.issueCreditNote}.
 * `repairOrderId` is a carry-through back-reference (the RO the Invoice came from).
 * Scoped to a **Location** (ADR-0003), reached only through ScopedDb (ADR-0013).
 */
export const creditNote = pgTable(
  "credit_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    /** The Invoice this Credit Note references and corrects (ADR-0002). Cascades with it. */
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    /** The Repair Order the credited Invoice was issued from (a carry-through back-reference). */
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id, { onDelete: "cascade" }),
    /** The Credit Note's own legal series (CONTEXT.md); pairs with {@link creditNoteSeries}. */
    series: text("series").notNull().default(DEFAULT_CREDIT_NOTE_SERIES),
    /** Gapless sequential number within `series` — unique per Location per series. */
    number: integer("number").notNull(),
    /** The freeze time — when the snapshot below became immutable. */
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    /** Snapshot of the credited Invoice's series, for the "corrective to …" reference. */
    invoiceSeries: text("invoice_series").notNull(),
    /** Snapshot of the credited Invoice's gapless number. */
    invoiceNumber: integer("invoice_number").notNull(),
    /** Snapshot of the Invoice's VAT mode at issue (ADR-0006). */
    vatMode: vatMode("vat_mode").notNull(),
    /** Snapshot of the seller's ДДС number; null when not registered. */
    sellerVatNumber: text("seller_vat_number"),
    /** Snapshot of the buyer's name as printed on the document. */
    customerName: text("customer_name").notNull(),
    /** Snapshot of the Vehicle's registration plate, when it had one. */
    vehiclePlate: text("vehicle_plate"),
    /** Net total credited in integer minor units (ADR-0011). */
    net: integer("net").notNull(),
    /** VAT total credited in minor units, or **null** when the Invoice carried no VAT (ADR-0006). */
    vat: integer("vat"),
    /** Gross total credited (`net + vat`, or `net` when no VAT applies) in minor units. */
    gross: integer("gross").notNull(),
    /** Optional free-text reason for the correction; never shown to the Customer. */
    reason: text("reason"),
    /** Explicit currency for the money columns (ADR-0011); BGN in the MVP. */
    currency: text("currency").notNull().default("BGN"),
  },
  (t) => [unique("credit_note_location_series_number_unique").on(t.locationId, t.series, t.number)],
);

export type CreditNoteRow = typeof creditNote.$inferSelect;

/**
 * One **frozen** credited row on a Credit Note (GF-16, ADR-0002) — the snapshot of
 * an Invoice line as it stood on the corrected Invoice. A *copy*, not a reference:
 * once frozen here nothing about it changes, and it deliberately carries **no**
 * Mechanic attribution (that is the Work Card's, ADR-0009). The money/quantity
 * columns keep the same exact integer encodings as {@link invoiceLine} (and
 * {@link lineItem}). Scoped to a **Location** (ADR-0003), reached only through
 * ScopedDb (ADR-0013).
 */
export const creditNoteLine = pgTable("credit_note_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id, { onDelete: "cascade" }),
  /** The Credit Note this frozen line belongs to. Cascades with the Credit Note. */
  creditNoteId: uuid("credit_note_id")
    .notNull()
    .references(() => creditNote.id, { onDelete: "cascade" }),
  /** 1-based order the line appeared on the corrected Invoice, preserved on the document. */
  position: integer("position").notNull(),
  type: lineItemType("type").notNull(),
  /** What the line is, in words — copied from the Invoice line at issue. */
  description: text("description").notNull(),
  /** Hours (Labor) or count (Part), in thousandths — frozen (ADR-0011). */
  quantity: integer("quantity").notNull(),
  /** Hourly rate (Labor) or unit price (Part), in integer minor units — frozen. */
  unitPrice: integer("unit_price").notNull(),
  /** Per-line VAT rate in basis points (20% → 2000) — frozen. */
  vatRate: integer("vat_rate").notNull(),
  /** Net line total credited in minor units — frozen at the Invoice line's value. */
  amount: integer("amount").notNull(),
  /** Explicit currency for the money columns (ADR-0011); BGN in the MVP. */
  currency: text("currency").notNull().default("BGN"),
});

export type CreditNoteLineRow = typeof creditNoteLine.$inferSelect;

// Re-export the auth infrastructure tables so a single `schema` object covers
// the whole database for the Drizzle client and drizzle-kit migrations.
export * from "./auth-schema";
