import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, organization, repairOrder, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { ValidationError } from "../../domain/errors";
import { anonymizeCustomer } from "../customer/service";
import { getDashboard } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("getDashboard — validation (no DB)", () => {
  it("rejects unexpected input with a ValidationError (ADR-0016)", async () => {
    const scope = scopeFromSession({ accountId: "x", locationId: "y", role: "owner" });
    // Strict schema: unknown keys are rejected before any DB access.
    await expect(getDashboard(scope, { unexpected: true })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.skipIf(!hasDb)("getDashboard — integration (real Postgres, ADR-0018)", () => {
  const accountId = `acc_${randomUUID()}`;

  afterAll(async () => {
    // Cascades to the Location.
    await db.delete(organization).where(eq(organization.id, accountId));
  });

  it("returns the scoped Location and an empty metric snapshot", async () => {
    await db.insert(organization).values({
      id: accountId,
      name: "Test Account",
      createdAt: new Date(),
    });
    const [loc] = await db
      .insert(location)
      .values({ accountId, name: "Главен сервиз" })
      .returning({ id: location.id });

    if (!loc) throw new Error("failed to seed location");

    const scope = scopeFromSession({ accountId, locationId: loc.id, role: "owner" });
    const data = await getDashboard(scope, {});

    expect(data.location).toEqual({ id: loc.id, name: "Главен сервиз" });
    expect(data.metrics).toEqual({ activeRepairOrders: 0, customers: 0, vehicles: 0 });
  });

  it("counts real data and excludes an anonymized Customer from the customers metric", async () => {
    const [loc] = await db
      .insert(location)
      .values({ accountId, name: "Втори сервиз" })
      .returning({ id: location.id });
    if (!loc) throw new Error("failed to seed location");

    const [liveCustomer] = await db
      .insert(customer)
      .values({ accountId, locationId: loc.id, name: "Жив клиент" })
      .returning({ id: customer.id });
    const [erasedCustomer] = await db
      .insert(customer)
      .values({ accountId, locationId: loc.id, name: "Изтрит клиент" })
      .returning({ id: customer.id });
    if (!liveCustomer || !erasedCustomer) throw new Error("failed to seed customers");

    const scope = scopeFromSession({ accountId, locationId: loc.id, role: "owner" });
    await anonymizeCustomer(scope, { id: erasedCustomer.id });

    const [vehicleA] = await db
      .insert(vehicle)
      .values({ accountId, locationId: loc.id, customerId: liveCustomer.id, plate: "CA0001AB" })
      .returning({ id: vehicle.id });
    const [vehicleB] = await db
      .insert(vehicle)
      .values({ accountId, locationId: loc.id, customerId: liveCustomer.id, plate: "CA0002AB" })
      .returning({ id: vehicle.id });
    if (!vehicleA || !vehicleB) throw new Error("failed to seed vehicles");

    // One order still in progress, one already delivered (terminal, GF-10).
    await db.insert(repairOrder).values([
      { accountId, locationId: loc.id, vehicleId: vehicleA.id, stage: "repairing" },
      { accountId, locationId: loc.id, vehicleId: vehicleB.id, stage: "delivered" },
    ]);

    const data = await getDashboard(scope, {});

    expect(data.metrics).toEqual({ activeRepairOrders: 1, customers: 1, vehicles: 2 });
    expect(data.ordersByStage).toContainEqual({ stage: "repairing", count: 1 });
    expect(data.ordersByStage).toContainEqual({ stage: "delivered", count: 1 });
  });
});
