/**
 * ScopedDb tenant-isolation tests (ADR-0003, ADR-0013).
 *
 * The tenancy foundation's core promise is that a Scope can only ever reach its
 * own Account's data. `currentLocation` constrains by both `locationId` *and*
 * `accountId`, so even a Scope carrying another Account's `locationId` cannot
 * read across the tenant boundary. These integration tests exercise that
 * against real Postgres (ADR-0018).
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { NotFoundError } from "../domain/errors";
import { db } from "./client";
import { scoped } from "./index";
import { location, organization } from "./schema";
import { scopeFromSession } from "./scope";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  "ScopedDb.currentLocation — tenant isolation (real Postgres, ADR-0018)",
  () => {
    const accountA = `acc_${randomUUID()}`;
    const accountB = `acc_${randomUUID()}`;
    let locationA = "";
    let locationB = "";

    afterAll(async () => {
      // Cascades delete each Account's Location.
      await db.delete(organization).where(eq(organization.id, accountA));
      await db.delete(organization).where(eq(organization.id, accountB));
    });

    it("seeds two Accounts each with one Location", async () => {
      await db.insert(organization).values([
        { id: accountA, name: "Account A", createdAt: new Date() },
        { id: accountB, name: "Account B", createdAt: new Date() },
      ]);
      const [a] = await db
        .insert(location)
        .values({ accountId: accountA, name: "Location A" })
        .returning({ id: location.id });
      const [b] = await db
        .insert(location)
        .values({ accountId: accountB, name: "Location B" })
        .returning({ id: location.id });
      if (!a || !b) throw new Error("failed to seed locations");
      locationA = a.id;
      locationB = b.id;
    });

    it("returns the caller's own Location", async () => {
      const scope = scopeFromSession({ accountId: accountA, locationId: locationA, role: "owner" });
      await expect(scoped(scope).currentLocation()).resolves.toEqual({
        id: locationA,
        name: "Location A",
      });
    });

    it("cannot read another Account's Location even with its locationId", async () => {
      // A forged/leaked scope: Account A's identity but Account B's locationId.
      // The accountId guard must reject it — the scope is not bypassable.
      const forged = scopeFromSession({
        accountId: accountA,
        locationId: locationB,
        role: "owner",
      });
      await expect(scoped(forged).currentLocation()).rejects.toBeInstanceOf(NotFoundError);
    });
  },
);
