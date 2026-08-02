/**
 * Payment service tests (GF-15).
 *
 * The status rule and the settlement summary are the heart of ADR-0002, so
 * `derivePaymentStatus` and `summarizePayments` are unit-tested directly as pure
 * functions: partial payments sum toward the total, an overpayment still reads as
 * paid, and a zero-gross Invoice with no Payment stays unpaid. Validation needs no
 * DB (the schema is authoritative, ADR-0016). The integration test runs against a
 * real throwaway Postgres (ADR-0018) and proves the load-bearing rules: several
 * Payments sum toward the Invoice total, the RO's `payment_status` reference tracks
 * that sum, Payments never mutate the frozen Invoice, and the whole thing is
 * invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedInvoice, ScopedPayment } from "../../db/scoped-db";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { getInvoice, issueInvoice } from "../invoice/service";
import { createLineItem } from "../line-item/service";
import { createRepairOrder, getRepairOrder } from "../repair-order/service";
import {
  derivePaymentStatus,
  getInvoicePayments,
  recordPayment,
  summarizePayments,
} from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

let paySeq = 0;
/** A Payment projection with the fields `summarizePayments` reads. */
function fakePayment(overrides: Partial<ScopedPayment> = {}): ScopedPayment {
  paySeq += 1;
  return {
    id: `pay-${paySeq}`,
    invoiceId: "inv-1",
    amount: 1000,
    method: "cash",
    note: null,
    currency: "BGN",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** The Invoice header fields the summary reads — a 144,00 лв invoice. */
const invoiceHeader: Pick<ScopedInvoice, "id" | "repairOrderId" | "gross" | "currency"> = {
  id: "inv-1",
  repairOrderId: "ro-1",
  gross: 14400,
  currency: "BGN",
};

describe("derivePaymentStatus — pure rule (ADR-0002)", () => {
  it("is unpaid when nothing has been paid", () => {
    expect(derivePaymentStatus(0, 14400)).toBe("unpaid");
  });

  it("is partially_paid when some — but not all — of the gross is covered", () => {
    expect(derivePaymentStatus(5000, 14400)).toBe("partially_paid");
    expect(derivePaymentStatus(14399, 14400)).toBe("partially_paid");
  });

  it("is paid once the gross is exactly met", () => {
    expect(derivePaymentStatus(14400, 14400)).toBe("paid");
  });

  it("is paid — never over — when the Invoice is overpaid", () => {
    expect(derivePaymentStatus(20000, 14400)).toBe("paid");
  });

  it("keeps a zero-gross Invoice with no Payment unpaid, not paid", () => {
    // The `<= 0` guard wins first, so nothing-paid reads as the opening state.
    expect(derivePaymentStatus(0, 0)).toBe("unpaid");
  });
});

describe("summarizePayments — pure settlement (ADR-0002)", () => {
  it("reports the opening state when there are no Payments", () => {
    const summary = summarizePayments(invoiceHeader, []);
    expect(summary).toMatchObject({
      invoiceId: "inv-1",
      repairOrderId: "ro-1",
      gross: 14400,
      currency: "BGN",
      totalPaid: 0,
      balance: 14400,
      status: "unpaid",
    });
  });

  it("sums partial Payments toward the total and reports the running balance", () => {
    const summary = summarizePayments(invoiceHeader, [
      fakePayment({ amount: 4000 }),
      fakePayment({ amount: 6000 }),
    ]);
    expect(summary.totalPaid).toBe(10000);
    expect(summary.balance).toBe(4400);
    expect(summary.status).toBe("partially_paid");
  });

  it("is fully settled once the Payments meet the gross", () => {
    const summary = summarizePayments(invoiceHeader, [
      fakePayment({ amount: 10000 }),
      fakePayment({ amount: 4400 }),
    ]);
    expect(summary.totalPaid).toBe(14400);
    expect(summary.balance).toBe(0);
    expect(summary.status).toBe("paid");
  });

  it("floors the balance at zero on an overpayment", () => {
    const summary = summarizePayments(invoiceHeader, [fakePayment({ amount: 20000 })]);
    expect(summary.balance).toBe(0);
    expect(summary.status).toBe("paid");
  });
});

describe("record/get payments — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("rejects recording with a missing / non-uuid / unexpected invoiceId", async () => {
    await expect(recordPayment(s, { amount: 10 })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordPayment(s, { invoiceId: "nope", amount: 10 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      recordPayment(s, { invoiceId: randomUUID(), amount: 10, extra: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-positive amount and an unknown method", async () => {
    await expect(recordPayment(s, { invoiceId: randomUUID(), amount: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(recordPayment(s, { invoiceId: randomUUID(), amount: -5 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      recordPayment(s, { invoiceId: randomUUID(), amount: 10, method: "wire" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects reading with an invalid invoiceId", async () => {
    await expect(getInvoicePayments(s, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(getInvoicePayments(s, { invoiceId: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("payment service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let vehicleA = "";
  let mechanicA = "";
  let locationB = "";

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, each with a registered Location", async () => {
    await db.insert(organization).values([
      { id: accountA, name: "Account A", createdAt: new Date() },
      { id: accountB, name: "Account B", createdAt: new Date() },
    ]);

    const seedTenant = async (accountId: string) => {
      const [loc] = await db
        .insert(location)
        .values({ accountId, name: "Location", vatMode: "registered", vatRate: 2000 })
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

    const a = await seedTenant(accountA);
    const b = await seedTenant(accountB);
    locationA = a.locationId;
    vehicleA = a.vehicleId;
    mechanicA = a.mechanicId;
    locationB = b.locationId;
  });

  /** Open an RO with a labor line (1.5h @ 40) and a part (1 @ 60), then invoice it → gross 14400. */
  const invoiceOrder = async (accountId: string, locationId: string) => {
    const s = scope(accountId, locationId);
    const order = await createRepairOrder(s, { vehicleId: vehicleA });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "part",
      description: "Накладки предни",
      quantity: 1,
      unitPrice: 60,
      vatRate: 20,
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
    const invoice = await issueInvoice(s, { repairOrderId: order.id });
    return { orderId: order.id, invoice };
  };

  it("records several partial Payments that sum toward the total, tracking RO status", async () => {
    const s = scope(accountA, locationA);
    const { orderId, invoice } = await invoiceOrder(accountA, locationA);
    expect(invoice.gross).toBe(14400);

    // First partial: 100,00 лв of 144,00.
    const afterFirst = await recordPayment(s, {
      invoiceId: invoice.id,
      amount: 100,
      method: "cash",
    });
    expect(afterFirst.totalPaid).toBe(10000);
    expect(afterFirst.balance).toBe(4400);
    expect(afterFirst.status).toBe("partially_paid");
    expect((await getRepairOrder(s, { id: orderId })).paymentStatus).toBe("partially_paid");

    // Second partial settles the rest: 44,00 лв.
    const afterSecond = await recordPayment(s, {
      invoiceId: invoice.id,
      amount: 44,
      method: "card",
    });
    expect(afterSecond.totalPaid).toBe(14400);
    expect(afterSecond.balance).toBe(0);
    expect(afterSecond.status).toBe("paid");
    expect(afterSecond.payments).toHaveLength(2);
    expect((await getRepairOrder(s, { id: orderId })).paymentStatus).toBe("paid");
  });

  it("caps an overpaid Invoice at paid with a zero balance", async () => {
    const s = scope(accountA, locationA);
    const { orderId, invoice } = await invoiceOrder(accountA, locationA);

    const summary = await recordPayment(s, { invoiceId: invoice.id, amount: 200 });
    expect(summary.totalPaid).toBe(20000);
    expect(summary.balance).toBe(0);
    expect(summary.status).toBe("paid");
    expect((await getRepairOrder(s, { id: orderId })).paymentStatus).toBe("paid");
  });

  it("never mutates the frozen Invoice when a Payment is recorded (ADR-0002)", async () => {
    const s = scope(accountA, locationA);
    const { invoice } = await invoiceOrder(accountA, locationA);

    await recordPayment(s, { invoiceId: invoice.id, amount: 50 });

    const reread = await getInvoice(s, { id: invoice.id });
    expect(reread.net).toBe(invoice.net);
    expect(reread.vat).toBe(invoice.vat);
    expect(reread.gross).toBe(invoice.gross);
    expect(reread.lines.map((l) => l.amount)).toEqual(invoice.lines.map((l) => l.amount));
  });

  it("copies the Invoice currency onto each Payment and lists them in order", async () => {
    const s = scope(accountA, locationA);
    const { invoice } = await invoiceOrder(accountA, locationA);

    await recordPayment(s, {
      invoiceId: invoice.id,
      amount: 20,
      method: "bank_transfer",
      note: "нареждане",
    });
    const summary = await getInvoicePayments(s, { invoiceId: invoice.id });

    expect(summary.payments).toHaveLength(1);
    expect(summary.payments[0]).toMatchObject({
      amount: 2000,
      method: "bank_transfer",
      note: "нареждане",
      currency: "BGN",
    });
  });

  it("never records against, or reads, an Invoice across the tenant boundary", async () => {
    const { invoice } = await invoiceOrder(accountA, locationA);

    await expect(
      recordPayment(scope(accountB, locationB), { invoiceId: invoice.id, amount: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getInvoicePayments(scope(accountB, locationB), { invoiceId: invoice.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
