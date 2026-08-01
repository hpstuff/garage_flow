/**
 * ScopedDb (ADR-0013) — the only database handle a service ever receives.
 *
 * It is bound to a `Scope` at construction, and every tenant-scoped access goes
 * through it, so no scoped query can be built without the scope. Later slices
 * add methods here (e.g. `listRepairOrders`, `createCustomer`) that constrain
 * every query by `accountId` + `locationId`; the raw, unscoped `db` stays
 * private to this class.
 */

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { NotFoundError } from "../domain/errors";
import type { Db } from "./client";
import { type CustomerKind, customer, location, type VehicleKind, vehicle } from "./schema";
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

/**
 * A Vehicle as it crosses the service boundary. Carries the current owner's
 * `customerId` plus their `customerName`, joined for display so a list needn't
 * fetch each owner separately.
 */
export interface ScopedVehicle {
  id: string;
  customerId: string;
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
      .select({ ...vehicleColumns, customerName: customer.name })
      .from(vehicle)
      .innerJoin(customer, eq(customer.id, vehicle.customerId))
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
      .select({ ...vehicleColumns, customerName: customer.name })
      .from(vehicle)
      .innerJoin(customer, eq(customer.id, vehicle.customerId))
      .where(and(this.#vehicleScope(), match))
      .orderBy(...orderBy)
      .limit(limit);
  }

  /** A single Vehicle, or `NotFoundError` if it is not in the caller's scope. */
  async getVehicle(id: string): Promise<ScopedVehicle> {
    const rows = await this.#db
      .select({ ...vehicleColumns, customerName: customer.name })
      .from(vehicle)
      .innerJoin(customer, eq(customer.id, vehicle.customerId))
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
}
