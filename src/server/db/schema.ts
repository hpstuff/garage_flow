/**
 * Domain schema (ADR-0011). Speaks the ubiquitous language (CONTEXT.md).
 *
 * All operational data scopes to a **Location** (ADR-0003). A Location belongs
 * to an **Account** (the paying tenant, persisted as Better Auth's
 * `organization` — see auth-schema.ts). Later slices add tenant-scoped tables
 * (Customer, Vehicle, Repair Order, …), each carrying `accountId` + `locationId`
 * and reached only through ScopedDb (ADR-0013).
 */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

export const location = pgTable("location", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LocationRow = typeof location.$inferSelect;

// Re-export the auth infrastructure tables so a single `schema` object covers
// the whole database for the Drizzle client and drizzle-kit migrations.
export * from "./auth-schema";
