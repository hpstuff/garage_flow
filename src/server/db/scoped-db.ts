/**
 * ScopedDb (ADR-0013) — the only database handle a service ever receives.
 *
 * It is bound to a `Scope` at construction, and every tenant-scoped access goes
 * through it, so no scoped query can be built without the scope. Later slices
 * add methods here (e.g. `listRepairOrders`, `createCustomer`) that constrain
 * every query by `accountId` + `locationId`; the raw, unscoped `db` stays
 * private to this class.
 */

import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../domain/errors";
import type { Db } from "./client";
import { location } from "./schema";
import type { Scope } from "./scope";

export interface ScopedLocation {
  id: string;
  name: string;
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
}
