/**
 * resolveScope tests (GF-03, ADR-0013/0014).
 *
 * `resolveScope` is the sole session → `{ Account, active Location, role }`
 * mapping — the seam GF-03 formalises. These integration tests prove, against
 * real Postgres (ADR-0018), that a session resolves to its Account + active
 * Location + role, that the session's active Account wins when a User belongs to
 * several, that Better Auth's free-text role is mapped onto our Role, and that a
 * User with no membership (or an Account with no Location) is rejected.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import { location, member, organization, user } from "../db/schema";
import { NotFoundError } from "../domain/errors";
import { resolveScope } from "./resolve-scope";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  "resolveScope — session → Account + Location + role (real Postgres)",
  () => {
    // A User with a single Account membership.
    const soleUserId = `usr_${randomUUID()}`;
    const soleAccountId = `acc_${randomUUID()}`;
    let soleLocationId = "";

    // A User who belongs to two Accounts, with a different role in each.
    const multiUserId = `usr_${randomUUID()}`;
    const accountManager = `acc_${randomUUID()}`; // role: "manager"
    const accountRaw = `acc_${randomUUID()}`; // role: "member" → mapped to "front-desk"
    let locationManager = "";
    let locationRaw = "";

    // An Account with a member but no Location.
    const locationlessUserId = `usr_${randomUUID()}`;
    const locationlessAccountId = `acc_${randomUUID()}`;

    afterAll(async () => {
      // Cascades delete each Account's Location and membership rows.
      for (const id of [soleAccountId, accountManager, accountRaw, locationlessAccountId]) {
        await db.delete(organization).where(eq(organization.id, id));
      }
      for (const id of [soleUserId, multiUserId, locationlessUserId]) {
        await db.delete(user).where(eq(user.id, id));
      }
    });

    it("seeds Users, Accounts, memberships and Locations", async () => {
      const now = new Date();

      await db.insert(user).values([
        { id: soleUserId, name: "Sole", email: `sole+${soleUserId}@example.com` },
        { id: multiUserId, name: "Multi", email: `multi+${multiUserId}@example.com` },
        {
          id: locationlessUserId,
          name: "Locationless",
          email: `none+${locationlessUserId}@example.com`,
        },
      ]);

      await db.insert(organization).values([
        { id: soleAccountId, name: "Sole Account", createdAt: now },
        { id: accountManager, name: "Manager Account", createdAt: now },
        { id: accountRaw, name: "Raw-role Account", createdAt: now },
        { id: locationlessAccountId, name: "Locationless Account", createdAt: now },
      ]);

      await db.insert(member).values([
        {
          id: randomUUID(),
          organizationId: soleAccountId,
          userId: soleUserId,
          role: "owner",
          createdAt: now,
        },
        {
          id: randomUUID(),
          organizationId: accountManager,
          userId: multiUserId,
          role: "manager",
          createdAt: now,
        },
        {
          id: randomUUID(),
          organizationId: accountRaw,
          userId: multiUserId,
          role: "member", // Better Auth's default free-text role.
          createdAt: now,
        },
        {
          id: randomUUID(),
          organizationId: locationlessAccountId,
          userId: locationlessUserId,
          role: "owner",
          createdAt: now,
        },
      ]);

      const [sole] = await db
        .insert(location)
        .values({ accountId: soleAccountId, name: "Sole Location" })
        .returning({ id: location.id });
      const [mgr] = await db
        .insert(location)
        .values({ accountId: accountManager, name: "Manager Location" })
        .returning({ id: location.id });
      const [raw] = await db
        .insert(location)
        .values({ accountId: accountRaw, name: "Raw-role Location" })
        .returning({ id: location.id });
      if (!sole || !mgr || !raw) throw new Error("failed to seed locations");
      soleLocationId = sole.id;
      locationManager = mgr.id;
      locationRaw = raw.id;
    });

    it("resolves a single membership to its Account, Location and role", async () => {
      // No active Account on the session → the User's sole membership is used.
      const scope = await resolveScope({ userId: soleUserId });
      expect(scope).toEqual({
        accountId: soleAccountId,
        locationId: soleLocationId,
        role: "owner",
      });
    });

    it("prefers the session's active Account when the User belongs to several", async () => {
      const scope = await resolveScope({ userId: multiUserId, activeAccountId: accountManager });
      expect(scope.accountId).toBe(accountManager);
      expect(scope.locationId).toBe(locationManager);
      expect(scope.role).toBe("manager");
    });

    it("maps an unknown Better Auth role onto the least-privileged Role", async () => {
      const scope = await resolveScope({ userId: multiUserId, activeAccountId: accountRaw });
      expect(scope.accountId).toBe(accountRaw);
      expect(scope.locationId).toBe(locationRaw);
      expect(scope.role).toBe("front-desk");
    });

    it("rejects a User with no Account membership", async () => {
      await expect(resolveScope({ userId: `usr_${randomUUID()}` })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("rejects an Account that has no Location", async () => {
      await expect(
        resolveScope({ userId: locationlessUserId, activeAccountId: locationlessAccountId }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  },
);
