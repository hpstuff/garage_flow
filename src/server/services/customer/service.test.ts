/**
 * Customer service tests (GF-04, GF-21).
 *
 * Validation tests need no DB (the schema is authoritative, ADR-0016). The
 * integration tests run against a real throwaway Postgres (ADR-0018) and prove
 * the core-loop promises: a Customer can be created with no Vehicles, edited,
 * and listed within its Location — and is invisible across the tenant boundary.
 *
 * A dedicated block proves **Anonymization** (GF-21, ADR-0004): erasure strips the
 * PII into an anonymized state, unlinks the Vehicles, and — the load-bearing rule —
 * leaves issued Invoices standing, never cascade-deleting them with the Customer.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { scoped } from "../../db";
import { db } from "../../db/client";
import {
  ANONYMIZED_CUSTOMER_NAME,
  appointment,
  consent,
  customer,
  invoice,
  location,
  organization,
  repairOrder,
  vehicle,
} from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createAppointment, getAppointment } from "../appointment/service";
import { grantConsent } from "../consent/service";
import { listVehicles } from "../vehicle/service";
import {
  anonymizeCustomer,
  createCustomer,
  getCustomer,
  isAnonymized,
  listCustomers,
  updateCustomer,
} from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("customer service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a missing name (ADR-0016)", async () => {
    await expect(createCustomer(s, { kind: "person" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown kind", async () => {
    await expect(createCustomer(s, { kind: "robot", name: "X" })).rejects.toBeInstanceOf(
      ValidationError,
    );
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

describe("customer anonymization — validation + pure helper (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects anonymizing without a valid id (ADR-0016)", async () => {
    await expect(anonymizeCustomer(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(anonymizeCustomer(s, { id: randomUUID(), extra: true })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("isAnonymized reads the anonymized state off the timestamp (ADR-0004)", () => {
    const base = {
      id: "c",
      kind: "person" as const,
      name: "X",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(isAnonymized({ ...base, anonymizedAt: null })).toBe(false);
    expect(isAnonymized({ ...base, anonymizedAt: new Date() })).toBe(true);
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

describe.skipIf(!hasDb)("customer anonymization — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location and its Customers/Vehicles/orders.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts each with one Location", async () => {
    await db.insert(organization).values([
      { id: accountA, name: "Erasure A", createdAt: new Date() },
      { id: accountB, name: "Erasure B", createdAt: new Date() },
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

  it("strips the PII and stamps the anonymized state (ADR-0004)", async () => {
    const created = await createCustomer(scope(accountA, locationA), {
      kind: "organization",
      name: "Иван Петров",
      email: "ivan@example.bg",
      phone: "+359888111222",
      address: "ул. Витоша 1",
      taxId: "BG123456789",
      note: "VIP",
    });
    expect(isAnonymized(created)).toBe(false);

    const erased = await anonymizeCustomer(scope(accountA, locationA), { id: created.id });

    // Name is replaced (the column is NOT NULL), every other PII field is nulled.
    expect(erased.name).toBe(ANONYMIZED_CUSTOMER_NAME);
    expect(erased.email).toBeNull();
    expect(erased.phone).toBeNull();
    expect(erased.address).toBeNull();
    expect(erased.taxId).toBeNull();
    expect(erased.note).toBeNull();
    // The anonymized state is distinct from row deletion — the row survives, stamped.
    expect(erased.id).toBe(created.id);
    expect(erased.anonymizedAt).toBeInstanceOf(Date);
    expect(isAnonymized(erased)).toBe(true);

    // getCustomer still resolves the (now anonymized) row — it was not deleted.
    const reread = await getCustomer(scope(accountA, locationA), { id: created.id });
    expect(reread.name).toBe(ANONYMIZED_CUSTOMER_NAME);
    expect(isAnonymized(reread)).toBe(true);
  });

  it("unlinks the Customer's Vehicles, which survive as ownerless", async () => {
    const owner = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Мария Георгиева",
      phone: "+359888333444",
    });
    const carA = await scoped(scope(accountA, locationA)).createVehicle({
      kind: "car",
      customerId: owner.id,
      plate: "CA1111AA",
      vin: null,
      make: "Opel",
      model: "Astra",
      year: 2015,
      color: null,
      note: null,
    });
    const carB = await scoped(scope(accountA, locationA)).createVehicle({
      kind: "car",
      customerId: owner.id,
      plate: "CA2222BB",
      vin: null,
      make: "Ford",
      model: "Focus",
      year: 2018,
      color: null,
      note: null,
    });

    await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });

    // The owner link is cleared on every Vehicle — no back-reference to the person.
    const rows = await db
      .select({ id: vehicle.id, customerId: vehicle.customerId })
      .from(vehicle)
      .where(and(eq(vehicle.customerId, owner.id), eq(vehicle.locationId, locationA)));
    expect(rows).toHaveLength(0);

    const orphanA = await db
      .select({ customerId: vehicle.customerId })
      .from(vehicle)
      .where(eq(vehicle.id, carA.id));
    expect(orphanA[0]?.customerId).toBeNull();

    // The Vehicles still exist and list with the coalesced anonymized owner name.
    const listed = await listVehicles(scope(accountA, locationA), {});
    const shown = listed.filter((v) => v.id === carA.id || v.id === carB.id);
    expect(shown).toHaveLength(2);
    for (const v of shown) {
      expect(v.customerId).toBeNull();
      expect(v.customerName).toBe(ANONYMIZED_CUSTOMER_NAME);
    }
  });

  it("retains issued Invoices — no cascade path deletes them (ADR-0004)", async () => {
    const owner = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Петър Стоянов",
    });
    const car = await scoped(scope(accountA, locationA)).createVehicle({
      kind: "car",
      customerId: owner.id,
      plate: "CA3333CC",
      vin: null,
      make: "VW",
      model: "Golf",
      year: 2020,
      color: null,
      note: null,
    });
    const [ro] = await db
      .insert(repairOrder)
      .values({ accountId: accountA, locationId: locationA, vehicleId: car.id })
      .returning({ id: repairOrder.id });
    if (!ro) throw new Error("failed to seed repair order");
    const [inv] = await db
      .insert(invoice)
      .values({
        accountId: accountA,
        locationId: locationA,
        repairOrderId: ro.id,
        number: 1,
        vatMode: "registered",
        // The buyer name is snapshot at issue — the legally-required minimum (ADR-0002).
        customerName: "Петър Стоянов",
        vehiclePlate: "CA3333CC",
        net: 10000,
        vat: 2000,
        gross: 12000,
      })
      .returning({ id: invoice.id });
    if (!inv) throw new Error("failed to seed invoice");

    await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });

    // The Invoice survives, and its frozen buyer-name snapshot is untouched.
    const invRows = await db
      .select({ id: invoice.id, customerName: invoice.customerName })
      .from(invoice)
      .where(eq(invoice.id, inv.id));
    expect(invRows).toHaveLength(1);
    expect(invRows[0]?.customerName).toBe("Петър Стоянов");

    // The Repair Order and the (now ownerless) Vehicle also survive — nothing cascaded.
    const roRows = await db
      .select({ id: repairOrder.id })
      .from(repairOrder)
      .where(eq(repairOrder.id, ro.id));
    expect(roRows).toHaveLength(1);
    const carRows = await db
      .select({ id: vehicle.id, customerId: vehicle.customerId })
      .from(vehicle)
      .where(eq(vehicle.id, car.id));
    expect(carRows).toHaveLength(1);
    expect(carRows[0]?.customerId).toBeNull();
    // The Customer row itself survives, anonymized (never deleted).
    const custRows = await db
      .select({ id: customer.id, anonymizedAt: customer.anonymizedAt })
      .from(customer)
      .where(eq(customer.id, owner.id));
    expect(custRows).toHaveLength(1);
    expect(custRows[0]?.anonymizedAt).not.toBeNull();
  });

  it("is idempotent — a second erasure keeps the original instant", async () => {
    const owner = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Двойна анонимизация",
    });
    const first = await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });
    const second = await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });
    expect(second.anonymizedAt).toBeInstanceOf(Date);
    expect(second.anonymizedAt?.getTime()).toBe(first.anonymizedAt?.getTime());
  });

  it("unlinks the Customer's Appointments, which survive as unnamed slots (GF-19, GF-21 audit)", async () => {
    const owner = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Николай Тодоров",
    });
    const startsAt = new Date("2026-01-01T10:00:00.000Z");
    const endsAt = new Date("2026-01-01T10:30:00.000Z");
    const booked = await createAppointment(scope(accountA, locationA), {
      startsAt,
      endsAt,
      customerId: owner.id,
    });

    await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });

    const rows = await db
      .select({ customerId: appointment.customerId })
      .from(appointment)
      .where(eq(appointment.id, booked.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.customerId).toBeNull();

    // The agenda no longer resolves the anonymized placeholder for this slot — with
    // no linked Customer and no free-text `customerName`, it reads as unnamed.
    const reread = await getAppointment(scope(accountA, locationA), { id: booked.id });
    expect(reread.customerId).toBeNull();
    expect(reread.customerName).toBeNull();
  });

  it("strips the Consent note but keeps the Consent record (ADR-0004 addendum)", async () => {
    const owner = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Елена Христова",
      phone: "+359888555666",
    });
    const granted = await grantConsent(scope(accountA, locationA), {
      customerId: owner.id,
      purpose: "sms",
      note: "Устно съгласие по телефона с Елена Христова, +359888555666",
    });

    await anonymizeCustomer(scope(accountA, locationA), { id: owner.id });

    const rows = await db
      .select({ id: consent.id, note: consent.note, purpose: consent.purpose })
      .from(consent)
      .where(eq(consent.id, granted.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBeNull();
    // The compliance record itself — what was authorised, and that it was — survives.
    expect(rows[0]?.purpose).toBe("sms");
  });

  it("cannot anonymize a Customer from another Account's Location", async () => {
    const mine = await createCustomer(scope(accountA, locationA), {
      kind: "person",
      name: "Само за A",
    });
    const intruder = scope(accountB, locationB);
    await expect(anonymizeCustomer(intruder, { id: mine.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // The Customer is untouched — still live, PII intact.
    const reread = await getCustomer(scope(accountA, locationA), { id: mine.id });
    expect(reread.name).toBe("Само за A");
    expect(isAnonymized(reread)).toBe(false);
  });
});
