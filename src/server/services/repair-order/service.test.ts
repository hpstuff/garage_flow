/**
 * Repair Order service tests (GF-08).
 *
 * Validation tests need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the GF-08 promises: an order is opened against a Vehicle with Complaint and
 * Diagnosis as distinct fields (ADR-0009); the lead Mechanic is optional; the
 * `invoiceStatus`/`paymentStatus` references default and are never touched by the
 * create/edit path (ADR-0002); and an order is invisible across the tenant
 * boundary, as is any cross-tenant Vehicle or Mechanic it might be pointed at.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createRepairOrder, getRepairOrder, listRepairOrders, updateRepairOrder } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("repair order service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("requires a vehicle (ADR-0016)", async () => {
    await expect(createRepairOrder(s, { complaint: "no vehicle" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects a non-uuid vehicleId", async () => {
    await expect(createRepairOrder(s, { vehicleId: "nope" })).rejects.toMatchObject({
      fieldErrors: { vehicleId: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("rejects a non-uuid lead mechanicId", async () => {
    await expect(
      createRepairOrder(s, { vehicleId: randomUUID(), mechanicId: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys — invoice/payment status are not caller input (ADR-0002)", async () => {
    await expect(
      createRepairOrder(s, { vehicleId: randomUUID(), invoiceStatus: "invoiced" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an update without a valid id", async () => {
    await expect(
      updateRepairOrder(s, { id: "nope", vehicleId: randomUUID() }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("repair order service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";
  let vehicleA = "";
  let vehicleB = "";
  let mechanicA = "";
  let mechanicB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location and everything scoped under it.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, each with a Location, Customer, Vehicle and Mechanic", async () => {
    await db.insert(organization).values([
      { id: accountA, name: "Account A", createdAt: new Date() },
      { id: accountB, name: "Account B", createdAt: new Date() },
    ]);

    const seedTenant = async (accountId: string) => {
      const [loc] = await db
        .insert(location)
        .values({ accountId, name: "Location" })
        .returning({ id: location.id });
      if (!loc) throw new Error("failed to seed location");
      const [cust] = await db
        .insert(customer)
        .values({ accountId, locationId: loc.id, name: "Клиент" })
        .returning({ id: customer.id });
      if (!cust) throw new Error("failed to seed customer");
      const [veh] = await db
        .insert(vehicle)
        .values({ accountId, locationId: loc.id, customerId: cust.id, plate: "CA1234AB" })
        .returning({ id: vehicle.id });
      if (!veh) throw new Error("failed to seed vehicle");
      const [mech] = await db
        .insert(mechanic)
        .values({ accountId, locationId: loc.id, name: "Механик" })
        .returning({ id: mechanic.id });
      if (!mech) throw new Error("failed to seed mechanic");
      return { locationId: loc.id, vehicleId: veh.id, mechanicId: mech.id };
    };

    const a = await seedTenant(accountA);
    const b = await seedTenant(accountB);
    locationA = a.locationId;
    vehicleA = a.vehicleId;
    mechanicA = a.mechanicId;
    locationB = b.locationId;
    vehicleB = b.vehicleId;
    mechanicB = b.mechanicId;
  });

  it("opens a Repair Order against a Vehicle with distinct Complaint and Diagnosis (ADR-0009)", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), {
      vehicleId: vehicleA,
      complaint: "Скърца при спиране",
      diagnosis: "Предни накладки на 2мм",
    });

    expect(created.id).toBeTruthy();
    expect(created.vehicleId).toBe(vehicleA);
    expect(created.vehiclePlate).toBe("CA1234AB");
    expect(created.customerName).toBe("Клиент");
    expect(created.complaint).toBe("Скърца при спиране");
    expect(created.diagnosis).toBe("Предни накладки на 2мм");
  });

  it("opens with no lead Mechanic — the lead is optional (ADR-0009)", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleA });

    expect(created.mechanicId).toBeNull();
    expect(created.mechanicName).toBeNull();
    // Complaint/Diagnosis can be filled in later — an order opens the moment the car arrives.
    expect(created.complaint).toBeNull();
    expect(created.diagnosis).toBeNull();
  });

  it("defaults the invoice/payment references and never accepts them as input (ADR-0002)", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleA });

    expect(created.invoiceStatus).toBe("not_invoiced");
    expect(created.paymentStatus).toBe("unpaid");
  });

  it("assigns an optional lead Mechanic and resolves its name", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), {
      vehicleId: vehicleA,
      mechanicId: mechanicA,
    });

    expect(created.mechanicId).toBe(mechanicA);
    expect(created.mechanicName).toBe("Механик");
  });

  it("lists a Vehicle's Repair Orders newest first, and can filter by Vehicle", async () => {
    const all = await listRepairOrders(scope(accountA, locationA), {});
    expect(all.length).toBeGreaterThanOrEqual(4);

    const forVehicle = await listRepairOrders(scope(accountA, locationA), { vehicleId: vehicleA });
    expect(forVehicle.every((ro) => ro.vehicleId === vehicleA)).toBe(true);
    // Newest first.
    const times = forVehicle.map((ro) => ro.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("edits Complaint, Diagnosis and lead without touching the status references", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleA });
    const updated = await updateRepairOrder(scope(accountA, locationA), {
      id: created.id,
      vehicleId: vehicleA,
      mechanicId: mechanicA,
      complaint: "Не запалва",
      diagnosis: "Изтощен акумулатор",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.mechanicName).toBe("Механик");
    expect(updated.complaint).toBe("Не запалва");
    expect(updated.diagnosis).toBe("Изтощен акумулатор");
    // The reference-only fields are untouched by the edit path (ADR-0002).
    expect(updated.invoiceStatus).toBe("not_invoiced");
    expect(updated.paymentStatus).toBe("unpaid");
  });

  it("clearing the lead Mechanic sets it back to null", async () => {
    const created = await createRepairOrder(scope(accountA, locationA), {
      vehicleId: vehicleA,
      mechanicId: mechanicA,
    });
    const cleared = await updateRepairOrder(scope(accountA, locationA), {
      id: created.id,
      vehicleId: vehicleA,
      mechanicId: null,
    });
    expect(cleared.mechanicId).toBeNull();
    expect(cleared.mechanicName).toBeNull();
  });

  it("cannot open an order against a Vehicle in another Account's Location", async () => {
    await expect(
      createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleB }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot assign a lead Mechanic from another Account's Location", async () => {
    await expect(
      createRepairOrder(scope(accountA, locationA), {
        vehicleId: vehicleA,
        mechanicId: mechanicB,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot read or edit a Repair Order across the tenant boundary", async () => {
    const mine = await createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleA });

    const intruder = scope(accountB, locationB);
    await expect(getRepairOrder(intruder, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateRepairOrder(intruder, { id: mine.id, vehicleId: vehicleB }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A forged scope — Account A's identity but Account B's locationId — is also rejected.
    const forged = scope(accountA, locationB);
    await expect(getRepairOrder(forged, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);

    // Account B never sees Account A's orders in its own list.
    const theirs = await listRepairOrders(intruder, {});
    expect(theirs.every((ro) => ro.id !== mine.id)).toBe(true);
  });
});
