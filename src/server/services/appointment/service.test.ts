/**
 * Appointment service tests (GF-19, ADR-0007).
 *
 * The conflict detection is the heart of the feature, so it is unit-tested
 * directly as a pure function ({@link buildAgenda}): the day is ordered
 * earliest-first regardless of input order; two **scheduled** slots conflict only
 * when their times overlap AND they share a resource (Mechanic or bay); adjacent
 * slots do not overlap; and cancelled slots are inert. {@link dayRange} is checked
 * as a pure day-boundary helper. Validation needs no DB (the schema is
 * authoritative, ADR-0016). The integration tests run against a real throwaway
 * Postgres (ADR-0018) and prove the acceptance criteria: a slot can be booked with
 * no Mechanic/bay (a walk-in); a day lists only that day's slots; a Repair Order
 * can be opened linked to an Appointment; and everything is invisible across the
 * tenant boundary.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import type { ScopedAppointment } from "../../db/scoped-db";
import { NotFoundError, ValidationError } from "../../domain/errors";
import { createCustomer } from "../customer/service";
import { createMechanic } from "../mechanic/service";
import { createRepairOrder, getRepairOrder } from "../repair-order/service";
import { createVehicle } from "../vehicle/service";
import {
  buildAgenda,
  cancelAppointment,
  createAppointment,
  dayRange,
  getDayAgenda,
} from "./service";

const scope = (accountId: string, locationId: string) =>
  scopeFromSession({ accountId, locationId, role: "owner" });

let apptSeq = 0;
/** An Appointment projection for the pure tests — only the fields the agenda reads. */
function fakeAppointment(overrides: Partial<ScopedAppointment> = {}): ScopedAppointment {
  apptSeq += 1;
  return {
    id: `appt-${apptSeq}`,
    customerId: null,
    vehicleId: null,
    vehiclePlate: null,
    vehicleVin: null,
    mechanicId: null,
    mechanicName: null,
    bay: null,
    customerName: null,
    startsAt: new Date("2026-08-02T09:00:00"),
    endsAt: new Date("2026-08-02T10:00:00"),
    status: "scheduled",
    note: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildAgenda — pure conflict projection (GF-19)", () => {
  it("orders the day earliest-first regardless of input order", () => {
    const nine = fakeAppointment({ id: "a-9", startsAt: new Date("2026-08-02T09:00:00") });
    const eight = fakeAppointment({ id: "a-8", startsAt: new Date("2026-08-02T08:00:00") });
    const ten = fakeAppointment({ id: "a-10", startsAt: new Date("2026-08-02T10:00:00") });

    const agenda = buildAgenda([nine, ten, eight], "2026-08-02");

    expect(agenda.entries.map((e) => e.appointment.id)).toEqual(["a-8", "a-9", "a-10"]);
    expect(agenda.date).toBe("2026-08-02");
  });

  it("flags two overlapping slots that share a Mechanic — mutually (ADR-0007)", () => {
    const a = fakeAppointment({
      id: "a",
      mechanicId: "mech-1",
      startsAt: new Date("2026-08-02T09:00:00"),
      endsAt: new Date("2026-08-02T10:00:00"),
    });
    const b = fakeAppointment({
      id: "b",
      mechanicId: "mech-1",
      startsAt: new Date("2026-08-02T09:30:00"),
      endsAt: new Date("2026-08-02T10:30:00"),
    });

    const agenda = buildAgenda([a, b], "2026-08-02");

    expect(byId(agenda, "a").conflictsWith).toEqual(["b"]);
    expect(byId(agenda, "b").conflictsWith).toEqual(["a"]);
    expect(agenda.conflictCount).toBe(2);
  });

  it("flags overlapping slots that share a bay, matched loosely", () => {
    const a = fakeAppointment({ id: "a", bay: "Канал 1" });
    const b = fakeAppointment({ id: "b", bay: " канал 1 " });

    const agenda = buildAgenda([a, b], "2026-08-02");

    expect(byId(agenda, "a").conflictsWith).toEqual(["b"]);
    expect(byId(agenda, "b").conflictsWith).toEqual(["a"]);
  });

  it("does NOT flag overlapping slots that share no resource — different bays/mechanics", () => {
    const a = fakeAppointment({ id: "a", mechanicId: "mech-1", bay: "Канал 1" });
    const b = fakeAppointment({ id: "b", mechanicId: "mech-2", bay: "Канал 2" });

    const agenda = buildAgenda([a, b], "2026-08-02");

    expect(byId(agenda, "a").conflictsWith).toEqual([]);
    expect(byId(agenda, "b").conflictsWith).toEqual([]);
    expect(agenda.conflictCount).toBe(0);
  });

  it("does NOT flag adjacent slots — end-exclusive, so touching ranges do not overlap", () => {
    const a = fakeAppointment({
      id: "a",
      mechanicId: "mech-1",
      startsAt: new Date("2026-08-02T09:00:00"),
      endsAt: new Date("2026-08-02T10:00:00"),
    });
    const b = fakeAppointment({
      id: "b",
      mechanicId: "mech-1",
      startsAt: new Date("2026-08-02T10:00:00"),
      endsAt: new Date("2026-08-02T11:00:00"),
    });

    const agenda = buildAgenda([a, b], "2026-08-02");

    expect(byId(agenda, "a").conflictsWith).toEqual([]);
    expect(byId(agenda, "b").conflictsWith).toEqual([]);
  });

  it("treats a cancelled slot as inert — it neither raises nor receives a conflict", () => {
    const live = fakeAppointment({ id: "live", mechanicId: "mech-1" });
    const cancelled = fakeAppointment({
      id: "cancelled",
      mechanicId: "mech-1",
      status: "cancelled",
    });

    const agenda = buildAgenda([live, cancelled], "2026-08-02");

    // Both still show on the agenda…
    expect(agenda.entries.map((e) => e.appointment.id).sort()).toEqual(["cancelled", "live"]);
    // …but the overlap with a cancelled slot is not a conflict.
    expect(byId(agenda, "live").conflictsWith).toEqual([]);
    expect(byId(agenda, "cancelled").conflictsWith).toEqual([]);
    expect(agenda.conflictCount).toBe(0);
  });

  it("names every conflicting peer when one Mechanic is triple-booked", () => {
    const a = fakeAppointment({
      id: "a",
      mechanicId: "m",
      endsAt: new Date("2026-08-02T12:00:00"),
    });
    const b = fakeAppointment({
      id: "b",
      mechanicId: "m",
      startsAt: new Date("2026-08-02T09:30:00"),
      endsAt: new Date("2026-08-02T12:00:00"),
    });
    const c = fakeAppointment({
      id: "c",
      mechanicId: "m",
      startsAt: new Date("2026-08-02T10:00:00"),
      endsAt: new Date("2026-08-02T12:00:00"),
    });

    const agenda = buildAgenda([a, b, c], "2026-08-02");

    expect(byId(agenda, "a").conflictsWith.sort()).toEqual(["b", "c"]);
    expect(byId(agenda, "b").conflictsWith.sort()).toEqual(["a", "c"]);
    expect(byId(agenda, "c").conflictsWith.sort()).toEqual(["a", "b"]);
    expect(agenda.conflictCount).toBe(3);
  });
});

describe("dayRange — pure day boundary (GF-19)", () => {
  it("spans local midnight to the next local midnight", () => {
    const { from, to } = dayRange("2026-08-02");
    expect(from).toEqual(new Date(2026, 7, 2, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 7, 3, 0, 0, 0, 0));
  });

  it("rolls over month and year ends", () => {
    expect(dayRange("2026-12-31").to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });
});

describe("appointment service — validation (no DB, ADR-0016)", () => {
  const s = scope("acc", "loc");

  it("requires a start and end", async () => {
    await expect(createAppointment(s, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an end that is not after the start", async () => {
    await expect(
      createAppointment(s, {
        startsAt: "2026-08-02T10:00",
        endsAt: "2026-08-02T09:00",
      }),
    ).rejects.toMatchObject({
      fieldErrors: { endsAt: expect.arrayContaining([expect.any(String)]) },
    });
  });

  it("rejects unexpected keys (strict schema)", async () => {
    await expect(
      createAppointment(s, { startsAt: "2026-08-02T09:00", endsAt: "2026-08-02T10:00", x: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a badly-formed agenda date", async () => {
    await expect(getDayAgenda(s, { date: "02-08-2026" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a cancel without a valid id", async () => {
    await expect(cancelAppointment(s, { id: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("appointment service — integration (real Postgres, ADR-0018)", () => {
  const accountA = `acc_${randomUUID()}`;
  const accountB = `acc_${randomUUID()}`;
  let locationA = "";
  let locationB = "";

  afterAll(async () => {
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

  it("books a walk-in slot with no Mechanic, bay, Customer or Vehicle (CONTEXT.md)", async () => {
    const created = await createAppointment(scope(accountA, locationA), {
      startsAt: "2026-08-02T09:00",
      endsAt: "2026-08-02T10:00",
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("scheduled");
    expect(created.mechanicId).toBeNull();
    expect(created.bay).toBeNull();
    expect(created.customerId).toBeNull();
    expect(created.vehicleId).toBeNull();
  });

  it("shows the free-text booking name when no Customer is linked", async () => {
    const created = await createAppointment(scope(accountA, locationA), {
      startsAt: "2026-08-02T11:00",
      endsAt: "2026-08-02T11:30",
      customerName: "Обаждане — Иван",
      bay: "Канал 1",
    });
    expect(created.customerName).toBe("Обаждане — Иван");
    expect(created.bay).toBe("Канал 1");
  });

  it("lists only the queried day's slots and flags a real double-booking", async () => {
    const s = scope(accountA, locationA);
    const mech = await createMechanic(s, { name: "Иван" });

    // Two overlapping slots for the same Mechanic on 2026-08-10 → a conflict.
    await createAppointment(s, {
      startsAt: "2026-08-10T09:00",
      endsAt: "2026-08-10T10:00",
      mechanicId: mech.id,
    });
    await createAppointment(s, {
      startsAt: "2026-08-10T09:30",
      endsAt: "2026-08-10T10:30",
      mechanicId: mech.id,
    });
    // A slot the next day must not appear in the 2026-08-10 agenda.
    await createAppointment(s, { startsAt: "2026-08-11T09:00", endsAt: "2026-08-11T10:00" });

    const agenda = await getDayAgenda(s, { date: "2026-08-10" });
    expect(agenda.entries).toHaveLength(2);
    expect(agenda.conflictCount).toBe(2);
    expect(agenda.entries.every((e) => e.conflictsWith.length === 1)).toBe(true);
  });

  it("opens a Repair Order linked to an Appointment, and cancels a slot", async () => {
    const s = scope(accountA, locationA);
    const owner = await createCustomer(s, { kind: "person", name: "Мария" });
    const veh = await createVehicle(s, { kind: "car", customerId: owner.id, plate: "CA1234AB" });
    const appt = await createAppointment(s, {
      startsAt: "2026-08-12T09:00",
      endsAt: "2026-08-12T10:00",
      vehicleId: veh.id,
    });

    // The car arrives → open the order linked to the booking (GF-19).
    const order = await createRepairOrder(s, { vehicleId: veh.id, appointmentId: appt.id });
    expect(order.appointmentId).toBe(appt.id);
    // The link survives a re-read (it is a real column, not a create-time artefact).
    const reloaded = await getRepairOrder(s, { id: order.id });
    expect(reloaded.appointmentId).toBe(appt.id);

    const cancelled = await cancelAppointment(s, { id: appt.id });
    expect(cancelled.status).toBe("cancelled");
  });

  it("cannot read, cancel, or link across the tenant boundary", async () => {
    const mine = await createAppointment(scope(accountA, locationA), {
      startsAt: "2026-08-13T09:00",
      endsAt: "2026-08-13T10:00",
    });

    const intruder = scope(accountB, locationB);
    await expect(cancelAppointment(intruder, { id: mine.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // Account B never sees Account A's slots in its own agenda.
    const theirs = await getDayAgenda(intruder, { date: "2026-08-13" });
    expect(theirs.entries).toHaveLength(0);

    // A Repair Order in Account B cannot link to Account A's Appointment.
    const ownerB = await createCustomer(intruder, { kind: "person", name: "Петър" });
    const vehB = await createVehicle(intruder, {
      kind: "car",
      customerId: ownerB.id,
      plate: "CO0000OO",
    });
    await expect(
      createRepairOrder(intruder, { vehicleId: vehB.id, appointmentId: mine.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/** Pull one agenda entry by Appointment id — the tests assert on its conflict set. */
function byId(
  agenda: { entries: { appointment: ScopedAppointment; conflictsWith: string[] }[] },
  id: string,
) {
  const entry = agenda.entries.find((e) => e.appointment.id === id);
  if (!entry) throw new Error(`no agenda entry for ${id}`);
  return entry;
}
