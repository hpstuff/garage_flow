/**
 * Vehicle service tests (GF-05).
 *
 * Validation tests need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the GF-05 promises: a Vehicle is created with plate/VIN as primary identifiers
 * and a current-owner link; the owner can be reassigned (resale) without the
 * Vehicle — and thus its Service History key — changing; and a Vehicle is
 * invisible, and un-attachable to a foreign owner, across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createCustomer } from "../customer/service";
import { createVehicle, getVehicle, listVehicles, updateVehicle } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("vehicle service — validation (no DB)", () => {
  const s = scope("acc", "loc");
  const owner = randomUUID();

  it("rejects a missing owner (ADR-0016)", async () => {
    await expect(createVehicle(s, { kind: "car", plate: "CA1234AB" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("requires at least one of plate or VIN", async () => {
    await expect(createVehicle(s, { kind: "car", customerId: owner })).rejects.toMatchObject({
      fieldErrors: { plate: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("rejects an unknown kind", async () => {
    await expect(
      createVehicle(s, { kind: "boat", customerId: owner, plate: "CA1234AB" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-numeric year", async () => {
    await expect(
      createVehicle(s, { kind: "car", customerId: owner, plate: "CA1234AB", year: "notayear" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(
      createVehicle(s, { kind: "car", customerId: owner, plate: "CA1234AB", role: "admin" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an update without a valid id", async () => {
    await expect(
      updateVehicle(s, { id: "nope", kind: "car", customerId: owner, plate: "CA1234AB" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("vehicle service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";
  let ownerA = "";
  let ownerA2 = "";
  let ownerB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location, its Customers and their Vehicles.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, a Location each, and owner Customers", async () => {
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

    ownerA = (await createCustomer(scope(accountA, locationA), { kind: "person", name: "Иван" }))
      .id;
    ownerA2 = (await createCustomer(scope(accountA, locationA), { kind: "person", name: "Мария" }))
      .id;
    ownerB = (await createCustomer(scope(accountB, locationB), { kind: "person", name: "Петър" }))
      .id;
  });

  it("creates a Vehicle with plate + VIN and links the current owner", async () => {
    const created = await createVehicle(scope(accountA, locationA), {
      kind: "car",
      customerId: ownerA,
      plate: "ca1234ab",
      vin: "wvwzzz1jz3w000001",
      make: "VW",
      model: "Golf",
      year: 2018,
    });

    expect(created.id).toBeTruthy();
    expect(created.customerId).toBe(ownerA);
    expect(created.customerName).toBe("Иван");
    // Plate and VIN are normalised to uppercase.
    expect(created.plate).toBe("CA1234AB");
    expect(created.vin).toBe("WVWZZZ1JZ3W000001");
    expect(created.year).toBe(2018);
  });

  it("creates a motorcycle identified by VIN alone (no plate yet)", async () => {
    const created = await createVehicle(scope(accountA, locationA), {
      kind: "motorcycle",
      customerId: ownerA,
      vin: "1hd1kb4197y000002",
      make: "Harley-Davidson",
    });

    expect(created.kind).toBe("motorcycle");
    expect(created.plate).toBeNull();
    expect(created.vin).toBe("1HD1KB4197Y000002");
  });

  it("lists Vehicles in the Location, ordered by plate", async () => {
    const list = await listVehicles(scope(accountA, locationA), {});
    expect(list.map((v) => v.plate)).toEqual(["CA1234AB", null]);
    expect(list[0]?.customerName).toBe("Иван");
  });

  it("searches by plate, make, or owner name (case-insensitive)", async () => {
    const byPlate = await listVehicles(scope(accountA, locationA), { search: "ca1234" });
    expect(byPlate).toHaveLength(1);
    expect(byPlate[0]?.make).toBe("VW");

    const byOwner = await listVehicles(scope(accountA, locationA), { search: "иван" });
    expect(byOwner).toHaveLength(2);
  });

  it("filters the list to one owner's Vehicles", async () => {
    const list = await listVehicles(scope(accountA, locationA), { customerId: ownerA });
    expect(list).toHaveLength(2);
    expect(list.every((v) => v.customerId === ownerA)).toBe(true);
  });

  it("edits a Vehicle's details", async () => {
    const created = await createVehicle(scope(accountA, locationA), {
      kind: "car",
      customerId: ownerA,
      plate: "CB9999XX",
      model: "Astra",
    });
    const updated = await updateVehicle(scope(accountA, locationA), {
      id: created.id,
      kind: "car",
      customerId: ownerA,
      plate: "CB9999XX",
      make: "Opel",
      model: "Astra",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.make).toBe("Opel");
  });

  it("reassigns the owner (resale) without changing the Vehicle identity", async () => {
    const created = await createVehicle(scope(accountA, locationA), {
      kind: "car",
      customerId: ownerA,
      plate: "CT5555TT",
    });
    const reassigned = await updateVehicle(scope(accountA, locationA), {
      id: created.id,
      kind: "car",
      customerId: ownerA2,
      plate: "CT5555TT",
    });

    // Same Vehicle (its Service History key), new owner.
    expect(reassigned.id).toBe(created.id);
    expect(reassigned.plate).toBe("CT5555TT");
    expect(reassigned.customerId).toBe(ownerA2);
    expect(reassigned.customerName).toBe("Мария");
  });

  it("cannot attach a Vehicle to an owner from another Account", async () => {
    await expect(
      createVehicle(scope(accountA, locationA), {
        kind: "car",
        customerId: ownerB,
        plate: "CO0000OO",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot read, edit, or reassign a Vehicle across the tenant boundary", async () => {
    const mine = await createVehicle(scope(accountA, locationA), {
      kind: "car",
      customerId: ownerA,
      plate: "CX7777XC",
    });

    const intruder = scope(accountB, locationB);
    await expect(getVehicle(intruder, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateVehicle(intruder, { id: mine.id, kind: "car", customerId: ownerB, plate: "CX7777XC" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A forged scope — Account A's identity but Account B's locationId — is also rejected.
    const forged = scope(accountA, locationB);
    await expect(getVehicle(forged, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
