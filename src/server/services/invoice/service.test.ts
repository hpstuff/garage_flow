/**
 * Invoice service tests (GF-14).
 *
 * The snapshot shaping is the heart of ADR-0002/0009, so `buildInvoiceInput` is
 * unit-tested directly as a pure function: totals derived from the lines, the
 * seller/buyer identity snapshotted, positioned lines, a true zero-VAT (`vat:
 * null`) for a not-registered Location, and no Mechanic attribution. Validation
 * needs no DB (the schema is authoritative, ADR-0016). The integration test runs
 * against a real throwaway Postgres (ADR-0018) and proves the load-bearing rules:
 * gapless numbering per Location per series, the RO's `invoice_status` reference
 * flips, editing the RO afterward does not alter the issued Invoice, and the whole
 * thing is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { VatConfig } from "../../../lib/vat";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedLineItem, ScopedRepairOrder } from "../../db/scoped-db";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors";
import { createLineItem, deleteLineItem } from "../line-item/service";
import { createRepairOrder, getRepairOrder } from "../repair-order/service";
import { buildInvoiceInput, getInvoice, getInvoiceForRepairOrder, issueInvoice } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

/** A minimal Repair Order projection — only the fields the snapshot reads. */
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
    appointmentId: null,
    complaint: "Скърца при спиране",
    diagnosis: "Предни накладки на 2мм",
    stage: "ready",
    invoiceStatus: "not_invoiced",
    paymentStatus: "unpaid",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

let lineSeq = 0;
/** A Line Item projection with a Mechanic attribution the Invoice must NOT snapshot. */
function fakeLine(overrides: Partial<ScopedLineItem> = {}): ScopedLineItem {
  lineSeq += 1;
  return {
    id: `li-${lineSeq}`,
    repairOrderId: "ro-1",
    type: "labor",
    mechanicId: "mech-1",
    mechanicName: "Иван",
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

const REGISTERED: VatConfig = { mode: "registered", rate: 2000, vatNumber: "BG123456789" };
const NOT_REGISTERED: VatConfig = { mode: "not_registered" };

describe("buildInvoiceInput — pure snapshot (ADR-0002/0009)", () => {
  it("derives the totals from the lines and snapshots seller + buyer identity", () => {
    const input = buildInvoiceInput({
      order: fakeOrder(),
      lines: [
        fakeLine({ description: "Смяна накладки", amount: 6000, vatRate: 2000 }),
        fakeLine({ type: "part", mechanicId: null, description: "Накладки", amount: 6000 }),
      ],
      vatConfig: REGISTERED,
      series: "A",
    });

    expect(input.repairOrderId).toBe("ro-1");
    expect(input.series).toBe("A");
    expect(input.vatMode).toBe("registered");
    expect(input.sellerVatNumber).toBe("BG123456789");
    expect(input.customerName).toBe("Клиент");
    expect(input.vehiclePlate).toBe("CA1234AB");
    // net 12000; VAT rounded per line (20% of 6000 = 1200 each) → 2400; gross 14400.
    expect(input).toMatchObject({ net: 12000, vat: 2400, gross: 14400, currency: "BGN" });
  });

  it("copies each line in order with a 1-based position — and no Mechanic attribution", () => {
    const input = buildInvoiceInput({
      order: fakeOrder(),
      lines: [
        fakeLine({ description: "Труд", amount: 5000 }),
        fakeLine({ type: "part", mechanicId: null, description: "Част", amount: 6000 }),
      ],
      vatConfig: REGISTERED,
      series: "A",
    });

    expect(input.lines).toEqual([
      {
        position: 1,
        type: "labor",
        description: "Труд",
        quantity: 1000,
        unitPrice: 5000,
        vatRate: 2000,
        amount: 5000,
        currency: "BGN",
      },
      {
        position: 2,
        type: "part",
        description: "Част",
        quantity: 1000,
        unitPrice: 5000,
        vatRate: 2000,
        amount: 6000,
        currency: "BGN",
      },
    ]);
    // The Invoice is the financial subset (ADR-0009): no Mechanic leaks onto a line.
    expect(JSON.stringify(input.lines)).not.toContain("mechanic");
  });

  it("issues a true zero-VAT invoice for a not-registered Location (ADR-0006)", () => {
    const input = buildInvoiceInput({
      order: fakeOrder(),
      lines: [fakeLine({ amount: 6000, vatRate: 2000 })],
      vatConfig: NOT_REGISTERED,
      series: "A",
    });

    // vat is null (not a cosmetic 0), gross equals net, and there is no seller ДДС number.
    expect(input.vat).toBeNull();
    expect(input.net).toBe(6000);
    expect(input.gross).toBe(6000);
    expect(input.vatMode).toBe("not_registered");
    expect(input.sellerVatNumber).toBeNull();
  });
});

describe("issue/get invoice — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("rejects issuing with a missing / non-uuid / unexpected repairOrderId", async () => {
    await expect(issueInvoice(s, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(issueInvoice(s, { repairOrderId: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(issueInvoice(s, { repairOrderId: randomUUID(), extra: 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects reading with an invalid id", async () => {
    await expect(getInvoice(s, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(getInvoice(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(getInvoiceForRepairOrder(s, { repairOrderId: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("invoice service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  // Account A: a VAT-registered Location. Account B: a not-registered one.
  let locationA = "";
  let vehicleA = "";
  let mechanicA = "";
  let locationB = "";
  let vehicleB = "";

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts — a registered and a not-registered Location", async () => {
    await db.insert(organization).values([
      { id: accountA, name: "Account A", createdAt: new Date() },
      { id: accountB, name: "Account B", createdAt: new Date() },
    ]);

    const seedTenant = async (accountId: string, vatMode: "registered" | "not_registered") => {
      const [loc] = await db
        .insert(location)
        .values({
          accountId,
          name: "Location",
          vatMode,
          vatRate: 2000,
          vatNumber: vatMode === "registered" ? "BG123456789" : null,
        })
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
      return { locationId: loc.id, vehicleId: veh.id, mechanicId: mech.id };
    };

    const a = await seedTenant(accountA, "registered");
    const b = await seedTenant(accountB, "not_registered");
    locationA = a.locationId;
    vehicleA = a.vehicleId;
    mechanicA = a.mechanicId;
    locationB = b.locationId;
    vehicleB = b.vehicleId;
  });

  /** Open an RO with a labor line (1.5h @ 40, 20% VAT) and a part (1 @ 60, 20% VAT). */
  const seedInvoiceableOrder = async (
    accountId: string,
    locationId: string,
    vehicleId: string,
    mechanicId: string,
  ) => {
    const s = scope(accountId, locationId);
    const order = await createRepairOrder(s, { vehicleId, complaint: "Спирачки" });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "labor",
      mechanicId,
      description: "Смяна накладки",
      quantity: 1.5,
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
    return order.id;
  };

  it("issues invoice #1 — frozen totals + lines, and flips the RO invoice_status", async () => {
    const s = scope(accountA, locationA);
    const orderId = await seedInvoiceableOrder(accountA, locationA, vehicleA, mechanicA);

    const invoice = await issueInvoice(s, { repairOrderId: orderId });

    // labor 1.5h @ 40 → 6000; part 1 @ 60 → 6000; net 12000; VAT 2400; gross 14400.
    expect(invoice.series).toBe("A");
    expect(invoice.number).toBe(1);
    expect(invoice).toMatchObject({ net: 12000, vat: 2400, gross: 14400, currency: "BGN" });
    expect(invoice.vatMode).toBe("registered");
    expect(invoice.sellerVatNumber).toBe("BG123456789");
    expect(invoice.customerName).toBe("Клиент");
    expect(invoice.vehiclePlate).toBe("CA1234AB");
    expect(invoice.lines.map((l) => l.position)).toEqual([1, 2]);
    expect(invoice.lines.map((l) => l.amount)).toEqual([6000, 6000]);

    // The RO's invoice_status reference is now `invoiced` (ADR-0002) …
    const order = await getRepairOrder(s, { id: orderId });
    expect(order.invoiceStatus).toBe("invoiced");
    // … and it resolves to the issued Invoice.
    const linked = await getInvoiceForRepairOrder(s, { repairOrderId: orderId });
    expect(linked?.id).toBe(invoice.id);
  });

  it("numbers gaplessly per Location per series — the next issue is #2", async () => {
    const s = scope(accountA, locationA);
    const orderId = await seedInvoiceableOrder(accountA, locationA, vehicleA, mechanicA);

    const invoice = await issueInvoice(s, { repairOrderId: orderId });
    expect(invoice.series).toBe("A");
    expect(invoice.number).toBe(2);
  });

  it("does NOT alter an issued Invoice when the source Repair Order is edited afterward", async () => {
    const s = scope(accountA, locationA);
    const orderId = await seedInvoiceableOrder(accountA, locationA, vehicleA, mechanicA);
    const issued = await issueInvoice(s, { repairOrderId: orderId });

    // Edit the RO's lines after issue: add one, remove one.
    const added = await createLineItem(s, {
      repairOrderId: orderId,
      type: "part",
      description: "Спирачна течност",
      quantity: 1,
      unitPrice: 20,
      vatRate: 20,
    });
    await deleteLineItem(s, { id: added.id });

    const reread = await getInvoice(s, { id: issued.id });
    expect(reread.net).toBe(issued.net);
    expect(reread.gross).toBe(issued.gross);
    expect(reread.lines).toHaveLength(2);
    expect(reread.lines.map((l) => l.amount)).toEqual([6000, 6000]);
  });

  it("refuses to issue twice for the same Repair Order (immutable, ADR-0002)", async () => {
    const s = scope(accountA, locationA);
    const orderId = await seedInvoiceableOrder(accountA, locationA, vehicleA, mechanicA);
    await issueInvoice(s, { repairOrderId: orderId });
    await expect(issueInvoice(s, { repairOrderId: orderId })).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to issue an invoice for a Repair Order with no line items", async () => {
    const s = scope(accountA, locationA);
    const order = await createRepairOrder(s, { vehicleId: vehicleA });
    await expect(issueInvoice(s, { repairOrderId: order.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("issues a true zero-VAT invoice for a not-registered Location (ADR-0006)", async () => {
    const s = scope(accountB, locationB);
    // A Part line needs no Mechanic, so a not-registered Location can issue freely.
    const order = await createRepairOrder(s, { vehicleId: vehicleB });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "part",
      description: "Накладки",
      quantity: 1,
      unitPrice: 60,
      vatRate: 20,
    });

    const invoice = await issueInvoice(s, { repairOrderId: order.id });
    expect(invoice.number).toBe(1); // gapless numbering is per Location — B starts at 1.
    expect(invoice.vat).toBeNull();
    expect(invoice.net).toBe(invoice.gross);
    expect(invoice.vatMode).toBe("not_registered");
    expect(invoice.sellerVatNumber).toBeNull();
  });

  it("never issues or reads across the tenant boundary", async () => {
    const orderId = await seedInvoiceableOrder(accountA, locationA, vehicleA, mechanicA);
    const invoice = await issueInvoice(scope(accountA, locationA), { repairOrderId: orderId });

    // Account B cannot issue against, or read, Account A's order/invoice.
    await expect(
      issueInvoice(scope(accountB, locationB), { repairOrderId: orderId }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(getInvoice(scope(accountB, locationB), { id: invoice.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(
      await getInvoiceForRepairOrder(scope(accountB, locationB), { repairOrderId: orderId }),
    ).toBeNull();
  });
});
