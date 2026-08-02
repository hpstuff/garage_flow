/**
 * Service History service tests (GF-18).
 *
 * The projection is the heart of the feature, so it is unit-tested directly as a
 * pure function: the timeline is ordered newest-first regardless of input order,
 * it is keyed by the Vehicle (its current owner), and each entry references its
 * Repair Order without carrying any money. Validation needs no DB (the schema is
 * authoritative, ADR-0016). The integration test runs against a real throwaway
 * Postgres (ADR-0018) and proves the three acceptance criteria: every RO ever
 * performed on the Vehicle appears newest-first; the history follows the Vehicle
 * across a resale (owner change); and it is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedRepairOrder, ScopedVehicle } from "../../db/scoped-db";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createCustomer } from "../customer/service";
import { createRepairOrder } from "../repair-order/service";
import { createVehicle, updateVehicle } from "../vehicle/service";
import { getServiceHistory, projectServiceHistory } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

/** A minimal Vehicle projection for the pure tests — only the fields the header reads. */
function fakeVehicle(overrides: Partial<ScopedVehicle> = {}): ScopedVehicle {
  return {
    id: "veh-1",
    customerId: "cust-1",
    customerName: "Мария",
    kind: "car",
    plate: "CA1234AB",
    vin: "WVWZZZ1JZ3W000001",
    make: "VW",
    model: "Golf",
    year: 2018,
    color: null,
    note: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

let orderSeq = 0;
/** A Repair Order projection for the pure tests, with money defaults the timeline must ignore. */
function fakeOrder(overrides: Partial<ScopedRepairOrder> = {}): ScopedRepairOrder {
  orderSeq += 1;
  return {
    id: `ro-${orderSeq}`,
    vehicleId: "veh-1",
    vehiclePlate: "CA1234AB",
    vehicleVin: null,
    vehicleMake: "VW",
    vehicleModel: "Golf",
    customerName: "Мария",
    mechanicId: null,
    mechanicName: null,
    appointmentId: null,
    complaint: "Скърца при спиране",
    diagnosis: null,
    stage: "repairing",
    invoiceStatus: "not_invoiced",
    paymentStatus: "unpaid",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("projectServiceHistory — pure projection (GF-18)", () => {
  it("carries the Vehicle identity that keys the history, and its current owner", () => {
    const history = projectServiceHistory(fakeVehicle(), []);

    expect(history.vehicleId).toBe("veh-1");
    expect(history.vehiclePlate).toBe("CA1234AB");
    expect(history.vehicleVin).toBe("WVWZZZ1JZ3W000001");
    expect(history.vehicleKind).toBe("car");
    expect(history.customerName).toBe("Мария");
    expect(history.entries).toEqual([]);
  });

  it("orders entries newest-first regardless of the input order", () => {
    const jan = fakeOrder({ id: "ro-jan", createdAt: new Date("2026-01-10T00:00:00Z") });
    const mar = fakeOrder({ id: "ro-mar", createdAt: new Date("2026-03-10T00:00:00Z") });
    const feb = fakeOrder({ id: "ro-feb", createdAt: new Date("2026-02-10T00:00:00Z") });

    // Deliberately unsorted input — the projection must not rely on the query order.
    const history = projectServiceHistory(fakeVehicle(), [jan, mar, feb]);

    expect(history.entries.map((e) => e.repairOrderId)).toEqual(["ro-mar", "ro-feb", "ro-jan"]);
  });

  it("summarises each visit and references its Repair Order — no money on the timeline", () => {
    const history = projectServiceHistory(fakeVehicle(), [
      fakeOrder({
        id: "ro-x",
        stage: "ready",
        complaint: "Смяна масло",
        mechanicName: "Иван",
        invoiceStatus: "invoiced",
        paymentStatus: "paid",
      }),
    ]);

    expect(history.entries[0]).toMatchObject({
      repairOrderId: "ro-x",
      stage: "ready",
      complaint: "Смяна масло",
      mechanicName: "Иван",
      invoiceStatus: "invoiced",
      paymentStatus: "paid",
    });

    const flat = JSON.stringify(history);
    expect(flat).not.toContain("unitPrice");
    expect(flat).not.toContain("amount");
    expect(flat).not.toContain("vatRate");
  });
});

describe("getServiceHistory — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("rejects a missing vehicle id", async () => {
    await expect(getServiceHistory(s, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-uuid vehicle id", async () => {
    await expect(getServiceHistory(s, { vehicleId: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(
      getServiceHistory(s, { vehicleId: randomUUID(), extra: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("service history service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";
  let ownerA = "";
  let ownerA2 = "";
  let ownerB = "";

  afterAll(async () => {
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

  it("follows the Vehicle across a resale — every RO ever performed, newest first", async () => {
    const s = scope(accountA, locationA);
    const veh = await createVehicle(s, { kind: "car", customerId: ownerA, plate: "CA1234AB" });

    // First visit under the original owner (Иван).
    const first = await createRepairOrder(s, { vehicleId: veh.id, complaint: "Смяна накладки" });

    // The car is sold: reassign the current owner to Мария (GF-05). Same Vehicle.
    await updateVehicle(s, { id: veh.id, kind: "car", customerId: ownerA2, plate: "CA1234AB" });

    // Second visit under the new owner.
    const second = await createRepairOrder(s, { vehicleId: veh.id, complaint: "Смяна масло" });

    const history = await getServiceHistory(s, { vehicleId: veh.id });

    // Keyed by the Vehicle, so BOTH visits appear — newest first — spanning owners.
    expect(history.entries.map((e) => e.repairOrderId)).toEqual([second.id, first.id]);
    expect(history.entries.map((e) => e.complaint)).toEqual(["Смяна масло", "Смяна накладки"]);
    // The header shows the Vehicle's current owner after the resale.
    expect(history.customerName).toBe("Мария");
    expect(history.vehiclePlate).toBe("CA1234AB");
  });

  it("is empty for a Vehicle with no Repair Orders yet", async () => {
    const s = scope(accountA, locationA);
    const veh = await createVehicle(s, { kind: "car", customerId: ownerA, plate: "CB0000BC" });
    const history = await getServiceHistory(s, { vehicleId: veh.id });
    expect(history.entries).toEqual([]);
    expect(history.vehiclePlate).toBe("CB0000BC");
  });

  it("404s for a Vehicle outside the caller's scope — never a cross-tenant read", async () => {
    const mine = await createVehicle(scope(accountA, locationA), {
      kind: "car",
      customerId: ownerA,
      plate: "CX7777XC",
    });
    await expect(
      getServiceHistory(scope(accountB, locationB), { vehicleId: mine.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A foreign Vehicle is likewise invisible from Account A.
    const theirs = await createVehicle(scope(accountB, locationB), {
      kind: "car",
      customerId: ownerB,
      plate: "CO0000OO",
    });
    await expect(
      getServiceHistory(scope(accountA, locationA), { vehicleId: theirs.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
