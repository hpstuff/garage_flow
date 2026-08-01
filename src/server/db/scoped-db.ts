/**
 * ScopedDb (ADR-0013) — the only database handle a service ever receives.
 *
 * It is bound to a `Scope` at construction, and every tenant-scoped access goes
 * through it, so no scoped query can be built without the scope. Later slices
 * add methods here (e.g. `listRepairOrders`, `createCustomer`) that constrain
 * every query by `accountId` + `locationId`; the raw, unscoped `db` stays
 * private to this class.
 */

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { NotFoundError } from "../domain/errors";
import type { Db } from "./client";
import { type CustomerKind, customer, location } from "./schema";
import type { Scope } from "./scope";

export interface ScopedLocation {
  id: string;
  name: string;
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
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
} as const;

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
}
