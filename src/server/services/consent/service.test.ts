/**
 * Consent service tests (GF-20, ADR-0004).
 *
 * Validation and the pure `activePurposes`/`isActive` projection need no DB (the
 * schema and the projection are authoritative, ADR-0016). The integration tests
 * run against a real throwaway Postgres (ADR-0018) and prove the ADR-0004
 * promises: a Consent is purpose-scoped, timestamped and revocable; a Customer
 * holds *many* (never a single flag); revocation is a timestamp, not a delete; and
 * — the load-bearing rule — servicing does **not** depend on Consent.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createCustomer } from "../customer/service";
import { createRepairOrder } from "../repair-order/service";
import { createVehicle } from "../vehicle/service";
import type { ScopedConsent } from "./service";
import { activePurposes, grantConsent, isActive, listConsents, revokeConsent } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

/** A minimal ScopedConsent for the pure-projection tests — no DB involved. */
function fakeConsent(overrides: Partial<ScopedConsent> = {}): ScopedConsent {
  const now = new Date("2026-08-02T09:00:00");
  return {
    id: randomUUID(),
    customerId: "cust-1",
    purpose: "sms",
    grantedAt: now,
    revokedAt: null,
    note: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("consent service — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a grant without a valid customer id (ADR-0016)", async () => {
    await expect(grantConsent(s, { customerId: "nope", purpose: "sms" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an unknown purpose — there is no consent to be serviced/invoiced", async () => {
    await expect(
      grantConsent(s, { customerId: randomUUID(), purpose: "servicing" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(
      grantConsent(s, { customerId: randomUUID(), purpose: "sms", granted: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a revoke without a valid id", async () => {
    await expect(revokeConsent(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a list without a valid customer id", async () => {
    await expect(listConsents(s, { customerId: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("activePurposes / isActive — pure projection (GF-20, ADR-0004)", () => {
  it("counts an un-revoked Consent as active, a revoked one as not", () => {
    expect(isActive(fakeConsent({ revokedAt: null }))).toBe(true);
    expect(isActive(fakeConsent({ revokedAt: new Date("2026-08-02T10:00:00") }))).toBe(false);
  });

  it("keeps only purposes with a standing record, in CONSENT_PURPOSES order", () => {
    const consents = [fakeConsent({ purpose: "marketing" }), fakeConsent({ purpose: "sms" })];
    // Declared order is sms, viber, marketing — so the result is deterministic.
    expect(activePurposes(consents)).toEqual(["sms", "marketing"]);
  });

  it("drops a purpose once its only record is revoked (granted-then-revoked is absent)", () => {
    const consents = [
      fakeConsent({ purpose: "viber", revokedAt: new Date("2026-08-02T10:00:00") }),
    ];
    expect(activePurposes(consents)).toEqual([]);
  });

  it("keeps a purpose that has any standing record, even beside a revoked one (re-grant)", () => {
    const consents = [
      fakeConsent({ purpose: "sms", revokedAt: new Date("2026-08-02T10:00:00") }),
      fakeConsent({ purpose: "sms", revokedAt: null }),
    ];
    expect(activePurposes(consents)).toEqual(["sms"]);
  });

  it("returns nothing for a Customer with no Consents — not a default-on flag", () => {
    expect(activePurposes([])).toEqual([]);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("consent service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
    // Cascades delete each Account's Location, its Customers, and their Consents.
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, a Location each", async () => {
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

  it("grants a purpose-scoped, timestamped, un-revoked Consent", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Мария" });

    const granted = await grantConsent(s, {
      customerId: cust.id,
      purpose: "sms",
      note: "подписан формуляр",
    });

    expect(granted.id).toBeTruthy();
    expect(granted.purpose).toBe("sms");
    expect(granted.customerId).toBe(cust.id);
    expect(granted.grantedAt).toBeInstanceOf(Date);
    expect(granted.revokedAt).toBeNull();
    expect(granted.note).toBe("подписан формуляр");
  });

  it("lets one Customer hold many Consents — one per purpose, never a single flag", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Иван" });

    await grantConsent(s, { customerId: cust.id, purpose: "sms" });
    await grantConsent(s, { customerId: cust.id, purpose: "viber" });
    await grantConsent(s, { customerId: cust.id, purpose: "marketing" });

    const consents = await listConsents(s, { customerId: cust.id });
    expect(consents).toHaveLength(3);
    expect(activePurposes(consents)).toEqual(["sms", "viber", "marketing"]);
  });

  it("is idempotent per active purpose — a second grant returns the same record", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Петя" });

    const first = await grantConsent(s, { customerId: cust.id, purpose: "sms" });
    const second = await grantConsent(s, { customerId: cust.id, purpose: "sms" });

    expect(second.id).toBe(first.id);
    const consents = await listConsents(s, { customerId: cust.id });
    expect(consents).toHaveLength(1);
  });

  it("revokes by stamping revokedAt (a timestamp, not a delete) and is idempotent", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Георги" });
    const granted = await grantConsent(s, { customerId: cust.id, purpose: "marketing" });

    const revoked = await revokeConsent(s, { id: granted.id });
    expect(revoked.id).toBe(granted.id);
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    // Idempotent: revoking again keeps the original withdrawal instant.
    const again = await revokeConsent(s, { id: granted.id });
    expect(again.revokedAt?.getTime()).toBe(revoked.revokedAt?.getTime());

    // The record survives (history is retained) and the purpose is no longer active.
    const consents = await listConsents(s, { customerId: cust.id });
    expect(consents).toHaveLength(1);
    expect(activePurposes(consents)).toEqual([]);
  });

  it("re-granting after revocation makes a NEW record, preserving the decision history", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Стефка" });

    const first = await grantConsent(s, { customerId: cust.id, purpose: "sms" });
    await revokeConsent(s, { id: first.id });
    const second = await grantConsent(s, { customerId: cust.id, purpose: "sms" });

    expect(second.id).not.toBe(first.id);
    expect(second.revokedAt).toBeNull();

    const consents = await listConsents(s, { customerId: cust.id });
    expect(consents).toHaveLength(2); // the revoked one + the fresh grant
    expect(activePurposes(consents)).toEqual(["sms"]); // active again
  });

  it("does NOT gate servicing on Consent — a Repair Order opens with none/revoked (ADR-0004)", async () => {
    const s = scope(accountA, locationA);
    const cust = await createCustomer(s, { kind: "person", name: "Николай" });
    const veh = await createVehicle(s, { kind: "car", customerId: cust.id, plate: "CA9999XX" });

    // Revoke the only optional consent — servicing must be unaffected.
    const granted = await grantConsent(s, { customerId: cust.id, purpose: "sms" });
    await revokeConsent(s, { id: granted.id });

    const order = await createRepairOrder(s, { vehicleId: veh.id });
    expect(order.id).toBeTruthy();
    // Servicing rests on contract/legal obligation, so a revoked Consent never blocks it.
    expect(activePurposes(await listConsents(s, { customerId: cust.id }))).toEqual([]);
  });

  it("cannot list, grant, or revoke across the tenant boundary", async () => {
    const owner = scope(accountA, locationA);
    const intruder = scope(accountB, locationB);
    const cust = await createCustomer(owner, { kind: "person", name: "Собственик" });
    const granted = await grantConsent(owner, { customerId: cust.id, purpose: "sms" });

    // Account B cannot see Account A's Customer's Consents…
    await expect(listConsents(intruder, { customerId: cust.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // …nor attach a Consent to it…
    await expect(
      grantConsent(intruder, { customerId: cust.id, purpose: "viber" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // …nor revoke one of its Consents.
    await expect(revokeConsent(intruder, { id: granted.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
