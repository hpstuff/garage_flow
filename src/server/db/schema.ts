/**
 * Domain schema (ADR-0011). Speaks the ubiquitous language (CONTEXT.md).
 *
 * All operational data scopes to a **Location** (ADR-0003). A Location belongs
 * to an **Account** (the paying tenant, persisted as Better Auth's
 * `organization` — see auth-schema.ts). Later slices add tenant-scoped tables
 * (Customer, Vehicle, Repair Order, …), each carrying `accountId` + `locationId`
 * and reached only through ScopedDb (ADR-0013).
 */

import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

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

// Re-export the auth infrastructure tables so a single `schema` object covers
// the whole database for the Drizzle client and drizzle-kit migrations.
export * from "./auth-schema";
