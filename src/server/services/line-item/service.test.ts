/**
 * Line Item service tests (GF-09).
 *
 * The pure money math (`lineItemAmount`, `computeRepairOrderTotals`) and the
 * validation rules need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the GF-09 promises: Labor and Part lines add/edit/remove; a Labor line
 * attributes to a Mechanic with hours × rate → amount; a Part line carries
 * quantity × unit price; each line carries a VAT rate; the RO total derives from
 * the lines (not the RO's lead Mechanic); and lines are invisible across the
 * tenant boundary, as is any cross-tenant order or Mechanic they might point at.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, repairOrder, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import {
  computeRepairOrderTotals,
  createLineItem,
  deleteLineItem,
  lineItemAmount,
  listLineItems,
  type ScopedLineItem,
  updateLineItem,
} from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("line item money math (pure, no DB)", () => {
  it("derives the net amount as round(quantity × unitPrice / 1000)", () => {
    // 1.5h (1500) at 50.00/h (5000) → 75.00 (7500 minor units).
    expect(lineItemAmount(1500, 5000)).toBe(7500);
    // 4 parts (4000) at 12.50 (1250) → 50.00 (5000).
    expect(lineItemAmount(4000, 1250)).toBe(5000);
    // Rounds to the nearest minor unit: 0.333h (333) at 10.00/h (1000) → 3.33 (333).
    expect(lineItemAmount(333, 1000)).toBe(333);
  });

  it("totals net, per-line-rounded VAT and gross from the lines", () => {
    const items = [
      { amount: 7500, vatRate: 2000, currency: "BGN" }, // VAT 1500
      { amount: 5000, vatRate: 900, currency: "BGN" }, // VAT 450
      { amount: 3000, vatRate: 0, currency: "BGN" }, // VAT 0
    ] as ScopedLineItem[];

    const totals = computeRepairOrderTotals(items);
    expect(totals.net).toBe(15500);
    expect(totals.vat).toBe(1950);
    expect(totals.gross).toBe(17450);
    expect(totals.currency).toBe("BGN");
  });

  it("is all zero for an order with no lines", () => {
    expect(computeRepairOrderTotals([])).toEqual({
      net: 0,
      vat: 0,
      gross: 0,
      currency: "BGN",
    });
  });
});

describe("line item service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("requires a repair order, type and description (ADR-0016)", async () => {
    await expect(createLineItem(s, { type: "part" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-uuid repairOrderId", async () => {
    await expect(
      createLineItem(s, {
        repairOrderId: "nope",
        type: "part",
        description: "Накладки",
        quantity: 4,
        unitPrice: 12.5,
        vatRate: 20,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { repairOrderId: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("requires a Mechanic on a Labor line (ADR-0009)", async () => {
    await expect(
      createLineItem(s, {
        repairOrderId: randomUUID(),
        type: "labor",
        description: "Смяна на накладки",
        quantity: 1.5,
        unitPrice: 50,
        vatRate: 20,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { mechanicId: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("rejects a non-positive quantity", async () => {
    await expect(
      createLineItem(s, {
        repairOrderId: randomUUID(),
        type: "part",
        description: "Накладки",
        quantity: 0,
        unitPrice: 12.5,
        vatRate: 20,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a VAT rate above 100%", async () => {
    await expect(
      createLineItem(s, {
        repairOrderId: randomUUID(),
        type: "part",
        description: "Накладки",
        quantity: 1,
        unitPrice: 10,
        vatRate: 120,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys — amount/currency are never caller input", async () => {
    await expect(
      createLineItem(s, {
        repairOrderId: randomUUID(),
        type: "part",
        description: "Накладки",
        quantity: 1,
        unitPrice: 10,
        vatRate: 20,
        amount: 999,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an update without a valid id", async () => {
    await expect(
      updateLineItem(s, {
        id: "nope",
        repairOrderId: randomUUID(),
        type: "part",
        description: "Накладки",
        quantity: 1,
        unitPrice: 10,
        vatRate: 20,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("line item service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";
  let mechanicA = "";
  let mechanicB = "";
  let orderA = "";
  let orderB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location and everything scoped under it.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, each with a Location, Vehicle, Mechanic and Repair Order", async () => {
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
      const [order] = await db
        .insert(repairOrder)
        .values({ accountId, locationId: loc.id, vehicleId: veh.id })
        .returning({ id: repairOrder.id });
      if (!order) throw new Error("failed to seed repair order");
      return { locationId: loc.id, mechanicId: mech.id, orderId: order.id };
    };

    const a = await seedTenant(accountA);
    const b = await seedTenant(accountB);
    locationA = a.locationId;
    mechanicA = a.mechanicId;
    orderA = a.orderId;
    locationB = b.locationId;
    mechanicB = b.mechanicId;
    orderB = b.orderId;
  });

  it("adds a Labor line attributing to a Mechanic with hours × rate → amount (ADR-0009)", async () => {
    const created = await createLineItem(scope(accountA, locationA), {
      repairOrderId: orderA,
      type: "labor",
      mechanicId: mechanicA,
      description: "Смяна на накладки",
      quantity: 1.5,
      unitPrice: 50,
      vatRate: 20,
    });

    expect(created.type).toBe("labor");
    expect(created.mechanicId).toBe(mechanicA);
    expect(created.mechanicName).toBe("Механик");
    expect(created.quantity).toBe(1500); // thousandths
    expect(created.unitPrice).toBe(5000); // minor units
    expect(created.vatRate).toBe(2000); // basis points
    expect(created.amount).toBe(7500); // 1.5h × 50.00
    expect(created.currency).toBe("BGN");
  });

  it("adds a Part line with quantity × unit price and no Mechanic", async () => {
    const created = await createLineItem(scope(accountA, locationA), {
      repairOrderId: orderA,
      type: "part",
      // A stray mechanicId on a Part line is cleared, never stored.
      mechanicId: mechanicA,
      description: "Накладки предни",
      quantity: 4,
      unitPrice: 12.5,
      vatRate: 20,
    });

    expect(created.type).toBe("part");
    expect(created.mechanicId).toBeNull();
    expect(created.mechanicName).toBeNull();
    expect(created.amount).toBe(5000); // 4 × 12.50
  });

  it("lists a Repair Order's lines oldest first", async () => {
    const lines = await listLineItems(scope(accountA, locationA), { repairOrderId: orderA });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const times = lines.map((l) => l.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("derives the RO total from its lines, not the lead Mechanic", async () => {
    const lines = await listLineItems(scope(accountA, locationA), { repairOrderId: orderA });
    const totals = computeRepairOrderTotals(lines);
    const expectedNet = lines.reduce((sum, l) => sum + l.amount, 0);
    expect(totals.net).toBe(expectedNet);
    expect(totals.gross).toBe(totals.net + totals.vat);
  });

  it("edits a line's quantity and rate, recomputing the amount", async () => {
    const created = await createLineItem(scope(accountA, locationA), {
      repairOrderId: orderA,
      type: "labor",
      mechanicId: mechanicA,
      description: "Диагностика",
      quantity: 1,
      unitPrice: 40,
      vatRate: 20,
    });

    const updated = await updateLineItem(scope(accountA, locationA), {
      id: created.id,
      repairOrderId: orderA,
      type: "labor",
      mechanicId: mechanicA,
      description: "Диагностика",
      quantity: 2,
      unitPrice: 45,
      vatRate: 20,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.quantity).toBe(2000);
    expect(updated.unitPrice).toBe(4500);
    expect(updated.amount).toBe(9000); // 2h × 45.00
  });

  it("removes a line", async () => {
    const created = await createLineItem(scope(accountA, locationA), {
      repairOrderId: orderA,
      type: "part",
      description: "Маслен филтър",
      quantity: 1,
      unitPrice: 15,
      vatRate: 20,
    });

    const removed = await deleteLineItem(scope(accountA, locationA), { id: created.id });
    expect(removed.id).toBe(created.id);

    const remaining = await listLineItems(scope(accountA, locationA), { repairOrderId: orderA });
    expect(remaining.every((l) => l.id !== created.id)).toBe(true);
  });

  it("cannot add a line to an order in another Account's Location", async () => {
    await expect(
      createLineItem(scope(accountA, locationA), {
        repairOrderId: orderB,
        type: "part",
        description: "Накладки",
        quantity: 1,
        unitPrice: 10,
        vatRate: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot attribute a Labor line to a Mechanic from another Account's Location", async () => {
    await expect(
      createLineItem(scope(accountA, locationA), {
        repairOrderId: orderA,
        type: "labor",
        mechanicId: mechanicB,
        description: "Смяна на масло",
        quantity: 1,
        unitPrice: 30,
        vatRate: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot list, edit or remove a line across the tenant boundary", async () => {
    const mine = await createLineItem(scope(accountA, locationA), {
      repairOrderId: orderA,
      type: "part",
      description: "Ремъчна шайба",
      quantity: 1,
      unitPrice: 20,
      vatRate: 20,
    });

    const intruder = scope(accountB, locationB);

    // Account B never sees Account A's lines (scoped by the query, not the order id).
    const theirs = await listLineItems(intruder, { repairOrderId: orderA });
    expect(theirs.every((l) => l.id !== mine.id)).toBe(true);

    await expect(
      updateLineItem(intruder, {
        id: mine.id,
        repairOrderId: orderB,
        type: "part",
        description: "hijack",
        quantity: 1,
        unitPrice: 1,
        vatRate: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteLineItem(intruder, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);

    // A forged scope — Account A's identity but Account B's locationId — is also rejected.
    const forged = scope(accountA, locationB);
    await expect(deleteLineItem(forged, { id: mine.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
