/**
 * Location settings service tests (GF-12, ADR-0006).
 *
 * The pure mapping (`toVatConfig`) and the validation rules need no DB (the schema
 * is authoritative, ADR-0016). The integration tests run against a real throwaway
 * Postgres (ADR-0018) and prove the GF-12 promises: a Location's VAT config reads
 * back its stored mode/rate/number; switching to not-registered drops the VAT
 * number and yields a mode with no rate; and the config is invisible across the
 * tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { getVatConfig, setVatConfig, toVatConfig } from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

describe("toVatConfig (pure, no DB)", () => {
  it("keeps rate and VAT number when registered", () => {
    expect(toVatConfig({ mode: "registered", rate: 2000, vatNumber: "BG123456789" })).toEqual({
      mode: "registered",
      rate: 2000,
      vatNumber: "BG123456789",
    });
  });

  it("drops rate and number entirely when not registered — a true zero-VAT config", () => {
    // Even though the columns still hold a rate/number, the value object exposes
    // neither, so downstream code can never treat it as "0% VAT".
    expect(toVatConfig({ mode: "not_registered", rate: 2000, vatNumber: "BG1" })).toEqual({
      mode: "not_registered",
    });
  });
});

describe("setVatConfig — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a VAT rate above 100%", async () => {
    await expect(setVatConfig(s, { mode: "registered", rate: 120 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects a negative VAT rate", async () => {
    await expect(setVatConfig(s, { mode: "registered", rate: -1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an unknown mode", async () => {
    await expect(setVatConfig(s, { mode: "maybe" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys", async () => {
    await expect(
      setVatConfig(s, { mode: "registered", rate: 20, accountId: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("location settings service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, accountA));
    await db.delete(organization).where(eq(organization.id, accountB));
  });

  it("seeds two Accounts, each with a Location", async () => {
    await db.insert(organization).values([
      { id: accountA, name: "Account A", createdAt: new Date() },
      { id: accountB, name: "Account B", createdAt: new Date() },
    ]);
    const [locA] = await db
      .insert(location)
      .values({ accountId: accountA, name: "Location A" })
      .returning({ id: location.id });
    const [locB] = await db
      .insert(location)
      .values({ accountId: accountB, name: "Location B" })
      .returning({ id: location.id });
    if (!locA || !locB) throw new Error("failed to seed locations");
    locationA = locA.id;
    locationB = locB.id;
  });

  it("defaults a new Location to registered at the standard 20% rate", async () => {
    const config = await getVatConfig(scope(accountA, locationA));
    expect(config).toEqual({ mode: "registered", rate: 2000, vatNumber: null });
  });

  it("stores a registered config with a reduced rate and ДДС number", async () => {
    const saved = await setVatConfig(scope(accountA, locationA), {
      mode: "registered",
      rate: 9,
      vatNumber: "BG123456789",
    });
    expect(saved).toEqual({ mode: "registered", rate: 900, vatNumber: "BG123456789" });
    // Reads back the same.
    expect(await getVatConfig(scope(accountA, locationA))).toEqual(saved);
  });

  it("switching to not-registered drops the VAT number and exposes no rate", async () => {
    const saved = await setVatConfig(scope(accountA, locationA), {
      mode: "not_registered",
      // A stray rate/number is ignored: a not-registered Location carries no VAT.
      rate: 20,
      vatNumber: "BG999",
    });
    expect(saved).toEqual({ mode: "not_registered" });

    // The stored VAT number was cleared, not just hidden.
    const rows = await db
      .select({ vatNumber: location.vatNumber })
      .from(location)
      .where(eq(location.id, locationA));
    expect(rows[0]?.vatNumber).toBeNull();
  });

  it("cannot read or write another Account's Location VAT config", async () => {
    // A forged scope — Account A's identity but Account B's locationId — is rejected.
    const forged = scope(accountA, locationB);
    await expect(getVatConfig(forged)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setVatConfig(forged, { mode: "registered", rate: 20 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
