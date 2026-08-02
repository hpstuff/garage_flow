/**
 * Work Card service tests (GF-13).
 *
 * The projection is the heart of ADR-0009, so it is unit-tested directly as a
 * pure function: labor is grouped by Mechanic with summed hours, parts are listed,
 * and — the load-bearing rule — nothing from the Invoice's frozen legal subset
 * (prices, VAT, totals, invoice number, statuses) ever appears on the card.
 * Validation needs no DB (the schema is authoritative, ADR-0016). The integration
 * test runs against a real throwaway Postgres (ADR-0018) and proves the card is
 * rendered live from the current RO and is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedLineItem, ScopedRepairOrder } from "../../db/scoped-db";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createLineItem } from "../line-item/service";
import { createRepairOrder } from "../repair-order/service";
import { getWorkCard, projectWorkCard } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

/** A minimal Repair Order projection for the pure tests — only the fields the card reads. */
function fakeOrder(overrides: Partial<ScopedRepairOrder> = {}): ScopedRepairOrder {
  return {
    id: "ro-1",
    vehicleId: "veh-1",
    vehiclePlate: "CA1234AB",
    vehicleVin: null,
    vehicleMake: "VW",
    vehicleModel: "Golf",
    customerName: "Клиент",
    mechanicId: null,
    mechanicName: null,
    complaint: "Скърца при спиране",
    diagnosis: "Предни накладки на 2мм",
    stage: "repairing",
    invoiceStatus: "not_invoiced",
    paymentStatus: "unpaid",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

let lineSeq = 0;
/** A Line Item projection for the pure tests, with sane money defaults the card must ignore. */
function fakeLine(overrides: Partial<ScopedLineItem> = {}): ScopedLineItem {
  lineSeq += 1;
  return {
    id: `li-${lineSeq}`,
    repairOrderId: "ro-1",
    type: "labor",
    mechanicId: null,
    mechanicName: null,
    description: "Труд",
    quantity: 1000,
    unitPrice: 5000,
    vatRate: 2000,
    amount: 5000,
    currency: "BGN",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("projectWorkCard — pure projection (ADR-0009)", () => {
  it("carries the narrative and Vehicle/owner identity from the RO", () => {
    const card = projectWorkCard(fakeOrder(), []);

    expect(card.repairOrderId).toBe("ro-1");
    expect(card.vehiclePlate).toBe("CA1234AB");
    expect(card.customerName).toBe("Клиент");
    expect(card.complaint).toBe("Скърца при спиране");
    expect(card.diagnosis).toBe("Предни накладки на 2мм");
    expect(card.stage).toBe("repairing");
  });

  it("groups Labor by Mechanic and sums each one's hours (by whom, for how long)", () => {
    const card = projectWorkCard(fakeOrder(), [
      fakeLine({
        mechanicId: "m1",
        mechanicName: "Иван",
        description: "Смяна накладки",
        quantity: 1500,
      }),
      fakeLine({
        mechanicId: "m2",
        mechanicName: "Петър",
        description: "Обезвъздушаване",
        quantity: 500,
      }),
      fakeLine({
        mechanicId: "m1",
        mechanicName: "Иван",
        description: "Смяна дискове",
        quantity: 2000,
      }),
    ]);

    expect(card.laborByMechanic).toHaveLength(2);
    // First-appearance order: Иван, then Петър.
    const [ivan, petar] = card.laborByMechanic;
    expect(ivan.mechanicName).toBe("Иван");
    expect(ivan.entries.map((e) => e.description)).toEqual(["Смяна накладки", "Смяна дискове"]);
    expect(ivan.totalHours).toBe(3500);
    expect(petar.mechanicName).toBe("Петър");
    expect(petar.totalHours).toBe(500);
  });

  it("collects Labor with a cleared Mechanic under a single null group", () => {
    const card = projectWorkCard(fakeOrder(), [
      fakeLine({ mechanicId: null, mechanicName: null, quantity: 1000 }),
      fakeLine({ mechanicId: null, mechanicName: null, quantity: 250 }),
    ]);

    expect(card.laborByMechanic).toHaveLength(1);
    expect(card.laborByMechanic[0].mechanicId).toBeNull();
    expect(card.laborByMechanic[0].totalHours).toBe(1250);
  });

  it("lists Parts (which part, how many) separately from Labor", () => {
    const card = projectWorkCard(fakeOrder(), [
      fakeLine({ type: "labor", mechanicId: "m1", mechanicName: "Иван" }),
      fakeLine({
        type: "part",
        mechanicId: null,
        mechanicName: null,
        description: "Накладки предни",
        quantity: 2000,
      }),
    ]);

    expect(card.laborByMechanic).toHaveLength(1);
    expect(card.parts).toHaveLength(1);
    expect(card.parts[0].description).toBe("Накладки предни");
    expect(card.parts[0].quantity).toBe(2000);
  });

  it("does NOT carry the Invoice's frozen legal subset — no money, no VAT, no statuses", () => {
    const card = projectWorkCard(fakeOrder(), [fakeLine({ type: "part", description: "Части" })]);

    // The projection type has no such fields; assert nothing money/legal leaked in.
    const flat = JSON.stringify(card);
    expect(flat).not.toContain("unitPrice");
    expect(flat).not.toContain("vatRate");
    expect(flat).not.toContain("amount");
    expect(flat).not.toContain("invoiceStatus");
    expect(flat).not.toContain("paymentStatus");
    expect(card).not.toHaveProperty("totals");
  });

  it("renders an empty photos section until GF-11 lands the photo model", () => {
    expect(projectWorkCard(fakeOrder(), []).photos).toEqual([]);
  });
});

describe("getWorkCard — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("rejects a missing id", async () => {
    await expect(getWorkCard(s, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-uuid id", async () => {
    await expect(getWorkCard(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys", async () => {
    await expect(getWorkCard(s, { id: randomUUID(), extra: 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("work card service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let vehicleA = "";
  let mechanicA = "";
  let mechanicA2 = "";
  let locationB = "";

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, each with a Location, Customer, Vehicle and Mechanics", async () => {
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
        .values({ accountId, locationId: loc.id, name: "Иван" })
        .returning({ id: mechanic.id });
      if (!mech) throw new Error("failed to seed mechanic");
      const [mech2] = await db
        .insert(mechanic)
        .values({ accountId, locationId: loc.id, name: "Петър" })
        .returning({ id: mechanic.id });
      if (!mech2) throw new Error("failed to seed mechanic");
      return { locationId: loc.id, vehicleId: veh.id, mechanicId: mech.id, mechanicId2: mech2.id };
    };

    const a = await seedTenant(accountA);
    const b = await seedTenant(accountB);
    locationA = a.locationId;
    vehicleA = a.vehicleId;
    mechanicA = a.mechanicId;
    mechanicA2 = a.mechanicId2;
    locationB = b.locationId;
  });

  it("renders the card live from the current RO — narrative, labor-by-mechanic, parts", async () => {
    const s = scope(accountA, locationA);
    const order = await createRepairOrder(s, {
      vehicleId: vehicleA,
      complaint: "Скърца при спиране",
      diagnosis: "Предни накладки на 2мм",
    });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "labor",
      mechanicId: mechanicA,
      description: "Смяна накладки",
      quantity: 1.5,
      unitPrice: 40,
      vatRate: 20,
    });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "labor",
      mechanicId: mechanicA2,
      description: "Обезвъздушаване",
      quantity: 0.5,
      unitPrice: 40,
      vatRate: 20,
    });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "part",
      description: "Накладки предни",
      quantity: 1,
      unitPrice: 60,
      vatRate: 20,
    });

    const card = await getWorkCard(s, { id: order.id });

    expect(card.complaint).toBe("Скърца при спиране");
    expect(card.diagnosis).toBe("Предни накладки на 2мм");
    expect(card.vehiclePlate).toBe("CA1234AB");
    expect(card.laborByMechanic.map((g) => g.mechanicName)).toEqual(["Иван", "Петър"]);
    expect(card.laborByMechanic[0].totalHours).toBe(1500);
    expect(card.parts).toHaveLength(1);
    expect(card.parts[0].description).toBe("Накладки предни");
    expect(card.photos).toEqual([]);
  });

  it("404s for a Repair Order outside the caller's scope — never a cross-tenant read", async () => {
    const order = await createRepairOrder(scope(accountA, locationA), { vehicleId: vehicleA });
    await expect(getWorkCard(scope(accountB, locationB), { id: order.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
