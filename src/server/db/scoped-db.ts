/**
 * ScopedDb (ADR-0013) — the only database handle a service ever receives.
 *
 * It is bound to a `Scope` at construction, and every tenant-scoped access goes
 * through it, so no scoped query can be built without the scope. Later slices
 * add methods here (e.g. `listRepairOrders`, `createCustomer`) that constrain
 * every query by `accountId` + `locationId`; the raw, unscoped `db` stays
 * private to this class.
 */

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../domain/errors";
import type { Db } from "./client";
import {
  type CustomerKind,
  customer,
  type InvoiceStatus,
  type KanbanStage,
  type LineItemType,
  lineItem,
  location,
  mechanic,
  type PaymentStatus,
  repairOrder,
  TERMINAL_KANBAN_STAGE,
  type VehicleKind,
  vehicle,
} from "./schema";
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
   * the FK alone would not stop that, since it is not scope-aware.
   */
  async #assertVehicleInScope(vehicleId: string): Promise<void> {
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
   * identity, owner name, and optional lead Mechanic name. The Vehicle/owner
   * joins are inner (an RO always has both); the Mechanic join is left (the lead
   * is optional, so `mechanicName` is null when unassigned). Constrained to the
   * caller's scope by `where`.
   */
  #selectRepairOrders(where: ReturnType<typeof and>) {
    return this.#db
      .select({
        ...repairOrderColumns,
        vehiclePlate: vehicle.plate,
        vehicleVin: vehicle.vin,
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        customerName: customer.name,
        mechanicName: mechanic.name,
      })
      .from(repairOrder)
      .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .innerJoin(customer, eq(customer.id, vehicle.customerId))
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
   * Vehicle and the optional lead Mechanic are checked for scope membership first,
   * so neither can point across the tenant boundary.
   */
  async createRepairOrder(values: RepairOrderWriteValues): Promise<ScopedRepairOrder> {
    await this.#assertVehicleInScope(values.vehicleId);
    await this.#assertMechanicInScope(values.mechanicId);

    const rows = await this.#db
      .insert(repairOrder)
      .values({
        accountId: this.scope.accountId,
        locationId: this.scope.locationId,
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
}
