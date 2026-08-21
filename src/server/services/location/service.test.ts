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
import { DEFAULT_WEEKLY_INPUT } from "../../../lib/schedule";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../domain/errors";
import {
  getScheduleConfig,
  getVatConfig,
  isKanbanEnabled,
  isScheduleEnabled,
  setKanbanEnabled,
  setScheduleConfig,
  setScheduleEnabled,
  setVatConfig,
  toVatConfig,
} from "./service";

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

describe("setScheduleConfig — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects an open day missing hours", async () => {
    await expect(
      setScheduleConfig(s, {
        enabled: true,
        weekly: { ...DEFAULT_WEEKLY_INPUT, mon: { open: true, start: null, end: null } },
        exceptions: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an open day whose end is not after its start", async () => {
    await expect(
      setScheduleConfig(s, {
        enabled: true,
        weekly: { ...DEFAULT_WEEKLY_INPUT, mon: { open: true, start: "18:00", end: "09:00" } },
        exceptions: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a closed exception that also carries hours", async () => {
    await expect(
      setScheduleConfig(s, {
        enabled: true,
        weekly: DEFAULT_WEEKLY_INPUT,
        exceptions: [{ date: "2026-12-25", closed: true, hours: { start: "09:00", end: "13:00" } }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing weekday", async () => {
    const { sun: _sun, ...incomplete } = DEFAULT_WEEKLY_INPUT;
    await expect(
      setScheduleConfig(s, { enabled: true, weekly: incomplete, exceptions: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing enabled flag", async () => {
    await expect(
      setScheduleConfig(s, { weekly: DEFAULT_WEEKLY_INPUT, exceptions: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("setScheduleEnabled — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a non-boolean enabled value", async () => {
    await expect(setScheduleEnabled(s, { enabled: "yes" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing enabled flag", async () => {
    await expect(setScheduleEnabled(s, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys", async () => {
    await expect(
      setScheduleEnabled(s, { enabled: true, weekly: DEFAULT_WEEKLY_INPUT }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("setKanbanEnabled — validation (no DB)", () => {
  const s = scope("acc", "loc");

  it("rejects a non-boolean enabled value", async () => {
    await expect(setKanbanEnabled(s, { enabled: "yes" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing enabled flag", async () => {
    await expect(setKanbanEnabled(s, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unexpected keys", async () => {
    await expect(setKanbanEnabled(s, { enabled: true, stages: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
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

  it("defaults a new Location to enabled, Mon-Fri 09:00-18:00, Sat-Sun closed (GF-20)", async () => {
    const config = await getScheduleConfig(scope(accountA, locationA));
    expect(config.enabled).toBe(true);
    expect(config.weekly[1]).toEqual({ start: "09:00", end: "18:00" });
    expect(config.weekly[6]).toBeNull();
    expect(config.weekly[7]).toBeNull();
    expect(config.exceptions).toEqual([]);
  });

  it("stores a custom weekly schedule and a date exception, and reads it back (GF-20)", async () => {
    const saved = await setScheduleConfig(scope(accountA, locationA), {
      enabled: true,
      weekly: {
        ...DEFAULT_WEEKLY_INPUT,
        sat: { open: true, start: "10:00", end: "14:00" },
      },
      exceptions: [{ date: "2026-12-25", closed: true, hours: null }],
    });
    expect(saved.weekly[6]).toEqual({ start: "10:00", end: "14:00" });
    expect(saved.exceptions).toEqual([{ date: "2026-12-25", closed: true }]);

    expect(await getScheduleConfig(scope(accountA, locationA))).toEqual(saved);
  });

  it("setScheduleEnabled toggles on/off without touching the stored hours (GF-20)", async () => {
    // A custom weekly schedule + exception was written above; toggling the flag
    // must leave both exactly as they were.
    const before = await getScheduleConfig(scope(accountA, locationA));

    const disabled = await setScheduleEnabled(scope(accountA, locationA), { enabled: false });
    expect(disabled).toBe(false);
    expect(await isScheduleEnabled(scope(accountA, locationA))).toBe(false);
    const afterDisable = await getScheduleConfig(scope(accountA, locationA));
    expect(afterDisable).toEqual({ ...before, enabled: false });

    const reenabled = await setScheduleEnabled(scope(accountA, locationA), { enabled: true });
    expect(reenabled).toBe(true);
    expect(await isScheduleEnabled(scope(accountA, locationA))).toBe(true);
    expect(await getScheduleConfig(scope(accountA, locationA))).toEqual(before);
  });

  it("cannot read or write another Account's Location schedule (GF-20)", async () => {
    const forged = scope(accountA, locationB);
    await expect(getScheduleConfig(forged)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setScheduleConfig(forged, { enabled: true, weekly: DEFAULT_WEEKLY_INPUT, exceptions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(setScheduleEnabled(forged, { enabled: false })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(isScheduleEnabled(forged)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("setKanbanEnabled toggles on/off (GF-22)", async () => {
    const disabled = await setKanbanEnabled(scope(accountA, locationA), { enabled: false });
    expect(disabled).toBe(false);
    expect(await isKanbanEnabled(scope(accountA, locationA))).toBe(false);

    const reenabled = await setKanbanEnabled(scope(accountA, locationA), { enabled: true });
    expect(reenabled).toBe(true);
    expect(await isKanbanEnabled(scope(accountA, locationA))).toBe(true);
  });

  it("cannot read or write another Account's Location Kanban flag (GF-22)", async () => {
    const forged = scope(accountA, locationB);
    await expect(setKanbanEnabled(forged, { enabled: false })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(isKanbanEnabled(forged)).rejects.toBeInstanceOf(NotFoundError);
  });
});
