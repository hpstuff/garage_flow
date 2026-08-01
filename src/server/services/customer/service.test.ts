/**
 * Customer service tests (GF-04).
 *
 * Validation tests need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the core-loop promises: a Customer can be created with no Vehicles, edited,
 * and listed within its Location — and is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("customer service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a missing name (ADR-0016)", async () => {
    await expect(createCustomer(s, { kind: "person" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown kind", async () => {
    await expect(
      createCustomer(s, { kind: "robot", name: "X" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(
      createCustomer(s, { kind: "person", name: "X", role: "admin" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-email in the email field", async () => {
    await expect(
      createCustomer(s, { kind: "person", name: "X", email: "not-an-email" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an update without a valid id", async () => {
    await expect(
      updateCustomer(s, { id: "nope", kind: "person", name: "X" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces field-keyed messages for a form adapter", async () => {
    await expect(createCustomer(s, { kind: "person", name: "" })).rejects.toMatchObject({
      fieldErrors: { name: expect.arrayContaining([expect.any(String)]) },
    });
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("customer service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location and its Customers.
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

  it("creates a person Customer with no Vehicles and blank contact fields", async () => {
    const created = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Иван Петров",
      phone: "",
    });

    expect(created.id).toBeTruthy();
    expect(created.kind).toBe("person");
    expect(created.name).toBe("Иван Петров");
    // Blank contact fields normalise to null, not "".
    expect(created.phone).toBeNull();
    expect(created.email).toBeNull();
  });

  it("creates an organization Customer with a tax id", async () => {
    const created = await createCustomer(scope(accountA, locationA), {
      kind: "organization",
      name: "Ауто ЕООД",
      taxId: "BG123456789",
      email: "office@auto.bg",
    });

    expect(created.kind).toBe("organization");
    expect(created.taxId).toBe("BG123456789");
    expect(created.email).toBe("office@auto.bg");
  });

  it("lists Customers in the Location, ordered by name", async () => {
    const list = await listCustomers(scope(accountA, locationA), {});
    expect(list.map((c) => c.name)).toEqual(["Ауто ЕООД", "Иван Петров"]);
  });

  it("filters the list by a case-insensitive search", async () => {
    const list = await listCustomers(scope(accountA, locationA), { search: "иван" });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Иван Петров");
  });

  it("edits an existing Customer", async () => {
    const created = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Георги",
    });
    const updated = await updateCustomer(scope(accountA, locationA), {
      id: created.id,
      kind: "person",
      name: "Георги Иванов",
      phone: "+359888000000",
    });

    expect(updated.name).toBe("Георги Иванов");
    expect(updated.phone).toBe("+359888000000");
    expect(updated.id).toBe(created.id);
  });

  it("cannot read or edit a Customer from another Account's Location", async () => {
    const mine = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Само за A",
    });

    const intruder = scope(accountB, locationB);
    await expect(getCustomer(intruder, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateCustomer(intruder, { id: mine.id, kind: "person", name: "hijack" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A forged scope — Account A's identity but Account B's locationId — is also rejected.
    const forged = scope(accountA, locationB);
    await expect(getCustomer(forged, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
