/**
 * Credit Note service tests (GF-16).
 *
 * The snapshot shaping is the heart of ADR-0002, so `buildCreditNoteInput` is
 * unit-tested directly as a pure function: every amount and line is copied from the
 * credited Invoice (never recomputed), the Invoice's printed number is snapshotted,
 * the VAT snapshot passes through (a `vat: null` Invoice yields a `vat: null` credit
 * note), and the reason is carried. Validation needs no DB (the schema is
 * authoritative, ADR-0016). The integration test runs against a real throwaway
 * Postgres (ADR-0018) and proves the load-bearing rules: a Credit Note references and
 * mirrors the Invoice, gapless numbering per Location per series, one Credit Note per
 * Invoice, the original Invoice stays immutable after crediting, and the whole thing
 * is invisible across the tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customer, location, mechanic, organization, vehicle } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedInvoice } from "../../db/scoped-db";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors";
import { getInvoice, issueInvoice } from "../invoice/service";
import { createLineItem } from "../line-item/service";
import { createRepairOrder } from "../repair-order/service";
import {
  buildCreditNoteInput,
  getCreditNote,
  getCreditNoteForInvoice,
  issueCreditNote,
} from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

/** A minimal issued-Invoice projection — the fields the snapshot copies. A 144,00 лв invoice. */
function fakeInvoice(overrides: Partial<ScopedInvoice> = {}): ScopedInvoice {
  return {
    id: "inv-1",
    repairOrderId: "ro-1",
    series: "A",
    number: 7,
    issuedAt: new Date("2026-01-01T00:00:00Z"),
    vatMode: "registered",
    sellerVatNumber: "BG123456789",
    customerName: "Клиент",
    vehiclePlate: "CA1234AB",
    net: 12000,
    vat: 2400,
    gross: 14400,
    currency: "BGN",
    lines: [
      {
        id: "il-1",
        position: 1,
        type: "labor",
        description: "Смяна накладки",
        quantity: 1500,
        unitPrice: 4000,
        vatRate: 2000,
        amount: 6000,
        currency: "BGN",
      },
      {
        id: "il-2",
        position: 2,
        type: "part",
        description: "Накладки предни",
        quantity: 1000,
        unitPrice: 6000,
        vatRate: 2000,
        amount: 6000,
        currency: "BGN",
      },
    ],
    ...overrides,
  };
}

describe("buildCreditNoteInput — pure snapshot (ADR-0002)", () => {
  it("references the Invoice and copies its totals + identity verbatim", () => {
    const input = buildCreditNoteInput({
      invoice: fakeInvoice(),
      series: "A",
      reason: "Върнати накладки",
    });

    expect(input.invoiceId).toBe("inv-1");
    expect(input.repairOrderId).toBe("ro-1");
    expect(input.series).toBe("A");
    // The corrected Invoice's printed number is snapshotted for the "corrective to …" line.
    expect(input.invoiceSeries).toBe("A");
    expect(input.invoiceNumber).toBe(7);
    expect(input.vatMode).toBe("registered");
    expect(input.sellerVatNumber).toBe("BG123456789");
    expect(input.customerName).toBe("Клиент");
    expect(input.vehiclePlate).toBe("CA1234AB");
    expect(input.reason).toBe("Върнати накладки");
    // Amounts are copied from the Invoice, never recomputed.
    expect(input).toMatchObject({ net: 12000, vat: 2400, gross: 14400, currency: "BGN" });
  });

  it("copies each frozen Invoice line in order, keeping its position", () => {
    const input = buildCreditNoteInput({ invoice: fakeInvoice(), series: "A", reason: null });

    expect(input.lines).toEqual([
      {
        position: 1,
        type: "labor",
        description: "Смяна накладки",
        quantity: 1500,
        unitPrice: 4000,
        vatRate: 2000,
        amount: 6000,
        currency: "BGN",
      },
      {
        position: 2,
        type: "part",
        description: "Накладки предни",
        quantity: 1000,
        unitPrice: 6000,
        vatRate: 2000,
        amount: 6000,
        currency: "BGN",
      },
    ]);
  });

  it("passes a not-registered Invoice's null VAT straight through (ADR-0006)", () => {
    const input = buildCreditNoteInput({
      invoice: fakeInvoice({ vatMode: "not_registered", sellerVatNumber: null, vat: null }),
      series: "A",
      reason: null,
    });

    // A true zero-VAT correction — vat stays null, not a cosmetic 0, and no seller ДДС.
    expect(input.vat).toBeNull();
    expect(input.vatMode).toBe("not_registered");
    expect(input.sellerVatNumber).toBeNull();
  });
});

describe("issue/get credit note — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("rejects issuing with a missing / non-uuid / unexpected invoiceId", async () => {
    await expect(issueCreditNote(s, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(issueCreditNote(s, { invoiceId: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      issueCreditNote(s, { invoiceId: randomUUID(), extra: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a reason over the length cap", async () => {
    await expect(
      issueCreditNote(s, { invoiceId: randomUUID(), reason: "х".repeat(501) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects reading with an invalid id", async () => {
    await expect(getCreditNote(s, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(getCreditNote(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(getCreditNoteForInvoice(s, { invoiceId: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("credit note service — integration (real Postgres, ADR-0018)", () => {
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

  /** Open an RO with a labor line (1.5h @ 40) and a part (1 @ 60), then invoice it → gross 14400. */
  const invoiceOrder = async (
    accountId: string,
    locationId: string,
    vehicleId: string,
    mechanicId: string | null,
  ) => {
    const s = scope(accountId, locationId);
    const order = await createRepairOrder(s, { vehicleId });
    await createLineItem(s, {
      repairOrderId: order.id,
      type: "part",
      description: "Накладки предни",
      quantity: 1,
      unitPrice: 60,
      vatRate: 20,
    });
    if (mechanicId) {
      await createLineItem(s, {
        repairOrderId: order.id,
        type: "labor",
        mechanicId,
        description: "Смяна накладки",
        quantity: 1.5,
        unitPrice: 40,
        vatRate: 20,
      });
    }
    return issueInvoice(s, { repairOrderId: order.id });
  };

  it("issues credit note #1 — references the Invoice and mirrors its frozen snapshot", async () => {
    const s = scope(accountA, locationA);
    const invoice = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);
    expect(invoice.gross).toBe(14400);

    const note = await issueCreditNote(s, { invoiceId: invoice.id, reason: "Върнати части" });

    expect(note.series).toBe("A");
    expect(note.number).toBe(1);
    // References and echoes the corrected Invoice.
    expect(note.invoiceId).toBe(invoice.id);
    expect(note.repairOrderId).toBe(invoice.repairOrderId);
    expect(note.invoiceSeries).toBe(invoice.series);
    expect(note.invoiceNumber).toBe(invoice.number);
    expect(note.reason).toBe("Върнати части");
    // Mirrors the Invoice's amounts and lines exactly.
    expect(note).toMatchObject({ net: 12000, vat: 2400, gross: 14400, currency: "BGN" });
    expect(note.customerName).toBe("Клиент");
    expect(note.vehiclePlate).toBe("CA1234AB");
    expect(note.lines.map((l) => l.position)).toEqual([1, 2]);
    expect(note.lines.map((l) => l.amount)).toEqual(invoice.lines.map((l) => l.amount));

    // Resolves back from the Invoice, and reads by its own id.
    const linked = await getCreditNoteForInvoice(s, { invoiceId: invoice.id });
    expect(linked?.id).toBe(note.id);
    const reread = await getCreditNote(s, { id: note.id });
    expect(reread.id).toBe(note.id);
  });

  it("numbers gaplessly per Location per series — the next credit note is #2", async () => {
    const s = scope(accountA, locationA);
    const invoice = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);

    const note = await issueCreditNote(s, { invoiceId: invoice.id });
    expect(note.series).toBe("A");
    expect(note.number).toBe(2);
    // An un-credited Invoice resolves to null before it is credited.
    const other = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);
    expect(await getCreditNoteForInvoice(s, { invoiceId: other.id })).toBeNull();
  });

  it("refuses to credit the same Invoice twice (MVP full correction, ADR-0002)", async () => {
    const s = scope(accountA, locationA);
    const invoice = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);
    await issueCreditNote(s, { invoiceId: invoice.id });
    await expect(issueCreditNote(s, { invoiceId: invoice.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("leaves the original Invoice immutable when it is credited (ADR-0002)", async () => {
    const s = scope(accountA, locationA);
    const invoice = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);

    await issueCreditNote(s, { invoiceId: invoice.id, reason: "Корекция" });

    const reread = await getInvoice(s, { id: invoice.id });
    expect(reread.net).toBe(invoice.net);
    expect(reread.vat).toBe(invoice.vat);
    expect(reread.gross).toBe(invoice.gross);
    expect(reread.number).toBe(invoice.number);
    expect(reread.lines.map((l) => l.amount)).toEqual(invoice.lines.map((l) => l.amount));
  });

  it("credits a true zero-VAT Invoice for a not-registered Location (ADR-0006)", async () => {
    const s = scope(accountB, locationB);
    // A Part line needs no Mechanic, so a not-registered Location can invoice freely.
    const invoice = await invoiceOrder(accountB, locationB, vehicleB, null);
    expect(invoice.vat).toBeNull();

    const note = await issueCreditNote(s, { invoiceId: invoice.id });
    expect(note.number).toBe(1); // gapless numbering is per Location — B starts at 1.
    expect(note.vat).toBeNull();
    expect(note.net).toBe(note.gross);
    expect(note.vatMode).toBe("not_registered");
    expect(note.sellerVatNumber).toBeNull();
  });

  it("never issues against, or reads, an Invoice/Credit Note across the tenant boundary", async () => {
    const invoice = await invoiceOrder(accountA, locationA, vehicleA, mechanicA);
    const note = await issueCreditNote(scope(accountA, locationA), { invoiceId: invoice.id });

    await expect(
      issueCreditNote(scope(accountB, locationB), { invoiceId: invoice.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getCreditNote(scope(accountB, locationB), { id: note.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await getCreditNoteForInvoice(scope(accountB, locationB), { invoiceId: invoice.id }),
    ).toBeNull();
  });
});
