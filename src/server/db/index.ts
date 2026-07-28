/**
 * The database entry point services use. A service receives a `Scope` and calls
 * `scoped(scope)` to get a ScopedDb (ADR-0013); it never imports the raw,
 * unscoped `db` handle.
 */

import { db } from "./client";
import type { Scope } from "./scope";
import { ScopedDb } from "./scoped-db";

export function scoped(scope: Scope): ScopedDb {
  return ScopedDb.create(scope, db);
}

export { ScopedDb } from "./scoped-db";
export type { Scope, Role, ResolvedSession } from "./scope";
