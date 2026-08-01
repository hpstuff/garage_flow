/**
 * Domain schema (ADR-0011). Speaks the ubiquitous language (CONTEXT.md).
 *
 * All operational data scopes to a **Location** (ADR-0003). A Location belongs
 * to an **Account** (the paying tenant, persisted as Better Auth's
 * `organization` — see auth-schema.ts). Later slices add tenant-scoped tables
 * (Customer, Vehicle, Repair Order, …), each carrying `accountId` + `locationId`
 * and reached only through ScopedDb (ADR-0013).
 */

import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

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

export const location = pgTable("location", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** VAT configuration (rates, registration number). Filled in by GF-12. */
  vatConfig: text("vat_config"),
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

// Re-export the auth infrastructure tables so a single `schema` object covers
// the whole database for the Drizzle client and drizzle-kit migrations.
export * from "./auth-schema";
