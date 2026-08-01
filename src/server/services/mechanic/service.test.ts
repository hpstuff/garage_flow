/**
 * Mechanic service tests (GF-07).
 *
 * Validation tests need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the GF-07 promises: a Mechanic is a bare name with no login (`userId` null),
 * distinct from a User; Mechanics are listed and searched within a Location; and
 * a Mechanic is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createMechanic, getMechanic, listMechanics, updateMechanic } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("mechanic service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("requires a name (ADR-0016)", async () => {
    await expect(createMechanic(s, { note: "no name" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a blank name", async () => {
    await expect(createMechanic(s, { name: "   " })).rejects.toMatchObject({
      fieldErrors: { name: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("rejects unexpected keys (strict schema) — userId is not caller input in the MVP", async () => {
    await expect(createMechanic(s, { name: "Иван", userId: "usr_1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an update without a valid id", async () => {
    await expect(updateMechanic(s, { id: "nope", name: "Иван" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("mechanic service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location and its Mechanics.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, a Location each", async () => {
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

  it("creates a Mechanic as a bare name — no login (userId null)", async () => {
    const created = await createMechanic(scope(accountA, locationA), { name: "Иван Петров" });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Иван Петров");
    // A Mechanic need not have a login (CONTEXT.md) — distinct from a User.
    expect(created.userId).toBeNull();
    expect(created.note).toBeNull();
  });

  it("creates a Mechanic with an internal note", async () => {
    const created = await createMechanic(scope(accountA, locationA), {
      name: "Георги",
      note: "Специалист двигатели",
    });
    expect(created.note).toBe("Специалист двигатели");
  });

  it("lists Mechanics in the Location, ordered by name", async () => {
    const list = await listMechanics(scope(accountA, locationA), {});
    expect(list.map((m) => m.name)).toEqual(["Георги", "Иван Петров"]);
  });

  it("searches Mechanics by name (case-insensitive)", async () => {
    const found = await listMechanics(scope(accountA, locationA), { search: "иван" });
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe("Иван Петров");
  });

  it("edits a Mechanic's name and note", async () => {
    const created = await createMechanic(scope(accountA, locationA), { name: "Стоян" });
    const updated = await updateMechanic(scope(accountA, locationA), {
      id: created.id,
      name: "Стоян Иванов",
      note: "Ходова част",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Стоян Иванов");
    expect(updated.note).toBe("Ходова част");
  });

  it("cannot read, edit, or reassign a Mechanic across the tenant boundary", async () => {
    const mine = await createMechanic(scope(accountA, locationA), { name: "Само мой" });

    const intruder = scope(accountB, locationB);
    await expect(getMechanic(intruder, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateMechanic(intruder, { id: mine.id, name: "Откраднат" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A forged scope — Account A's identity but Account B's locationId — is also rejected.
    const forged = scope(accountA, locationB);
    await expect(getMechanic(forged, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);

    // Account B never sees Account A's Mechanics in its own list.
    const theirs = await listMechanics(intruder, {});
    expect(theirs.every((m) => m.name !== "Само мой")).toBe(true);
  });
});
