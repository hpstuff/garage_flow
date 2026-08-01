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

export const location = pgTable("location", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** VAT configuration (rates, registration number). Filled in by GF-12. */
  vatConfig: text("vat_config"),
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

// Re-export the auth infrastructure tables so a single `schema` object covers
// the whole database for the Drizzle client and drizzle-kit migrations.
export * from "./auth-schema";
