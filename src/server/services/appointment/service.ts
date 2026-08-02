/**
 * Appointment service (GF-19, ADR-0007) — book slots and render a **basic
 * day/agenda view**, Location-scoped.
 *
 * ADR-0007 scopes v1 to exactly this: create an Appointment (time slot, optional
 * Mechanic and/or bay; walk-ins have none), list a day, and **warn on obvious
 * conflicts** — the full drag-and-drop calendar with double-booking *prevention*
 * is deferred. So nothing here blocks an overlap: {@link buildAgenda} *surfaces*
 * conflicts, and creating always succeeds.
 *
 * Follows the reference contract (ADR-0005/0015): `(scope, input) => Promise<
 * plainData>`, validates its input at the top (ADR-0016), works through ScopedDb
 * (ADR-0013), and throws typed domain errors. The load-bearing logic — the day
 * boundaries and the conflict detection — lives in pure, DB-free functions
 * ({@link dayRange}, {@link buildAgenda}) so it is unit-tested directly, exactly
 * like the Service History and Work Card projections.
 */

import { z } from "zod";
import { type Scope, scoped } from "../../db";
import type { AppointmentStatus } from "../../db/schema";
import type { ScopedAppointment } from "../../db/scoped-db";
import { ValidationError } from "../../domain/errors";
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  getAppointmentSchema,
  getDayAgendaSchema,
} from "./schema";

export type { AppointmentStatus } from "../../db/schema";
export type { ScopedAppointment } from "../../db/scoped-db";

/**
 * One row of the agenda: an Appointment plus the ids of the other slots it
 * **obviously** conflicts with (GF-19). Empty when the slot is clear — a cancelled
 * slot always is, and never appears in another's list.
 */
export interface AgendaEntry {
  appointment: ScopedAppointment;
  conflictsWith: string[];
}

/**
 * One day of the agenda (GF-19): the calendar `date` echoed back, the day's slots
 * as {@link AgendaEntry} rows ordered earliest-first, and `conflictCount` — how
 * many slots are involved in at least one conflict, so the view can headline
 * "N conflicts" without re-scanning.
 */
export interface DayAgenda {
  date: string;
  entries: AgendaEntry[];
  conflictCount: number;
}

/**
 * The `[from, to)` timestamp range for a calendar `date` (`YYYY-MM-DD`) — local
 * midnight to the next local midnight. Built from calendar parts (not `+24h`) so
 * it stays a true "one civil day" even across a daylight-saving change.
 */
export function dayRange(date: string): { from: Date; to: Date } {
  const parts = date.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const from = new Date(year, month - 1, day, 0, 0, 0, 0);
  const to = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from, to };
}

/** A Date rendered as a local `YYYY-MM-DD` day param — the inverse of {@link dayRange}. */
export function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The bare identity a bay is compared on — trimmed and case-folded ("Bay 1" == "bay 1"). */
function normalizeBay(bay: string | null): string | null {
  const trimmed = bay?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Two slots overlap when each starts before the other ends (half-open ranges). */
function overlaps(a: ScopedAppointment, b: ScopedAppointment): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

/**
 * Whether two slots contend for the **same resource** — the "obvious" in "obvious
 * conflicts" (ADR-0007). That is the same reserved Mechanic, or the same bay
 * (compared loosely). Slots that share neither can overlap freely: two cars can
 * sit in two different bays at the same time.
 */
function sharesResource(a: ScopedAppointment, b: ScopedAppointment): boolean {
  if (a.mechanicId && a.mechanicId === b.mechanicId) {
    return true;
  }
  const bayA = normalizeBay(a.bay);
  const bayB = normalizeBay(b.bay);
  return bayA !== null && bayA === bayB;
}

/**
 * Project a day's Appointments into an agenda with conflict flags (GF-19) — the
 * heart of the feature, kept pure and DB-free so "obvious conflict" is provable
 * without a database.
 *
 * Entries are sorted earliest-first here (not relying on the query order). Two
 * **scheduled** slots conflict when their times {@link overlaps overlap} *and*
 * they {@link sharesResource share a resource} (Mechanic or bay); the relation is
 * symmetric, so each names the other. Cancelled slots are inert — they neither
 * raise nor receive a conflict — but still appear on the agenda so the front desk
 * can see what was called off.
 */
export function buildAgenda(appointments: ScopedAppointment[], date: string): DayAgenda {
  const ordered = [...appointments].sort((a, b) => {
    const byStart = a.startsAt.getTime() - b.startsAt.getTime();
    if (byStart !== 0) return byStart;
    const byEnd = a.endsAt.getTime() - b.endsAt.getTime();
    if (byEnd !== 0) return byEnd;
    return a.id.localeCompare(b.id);
  });

  const conflicts = new Map<string, Set<string>>(ordered.map((a) => [a.id, new Set<string>()]));
  for (let i = 0; i < ordered.length; i += 1) {
    const a = ordered[i];
    if (!a || a.status !== "scheduled") continue;
    for (let j = i + 1; j < ordered.length; j += 1) {
      const b = ordered[j];
      if (!b || b.status !== "scheduled") continue;
      if (overlaps(a, b) && sharesResource(a, b)) {
        conflicts.get(a.id)?.add(b.id);
        conflicts.get(b.id)?.add(a.id);
      }
    }
  }

  const entries: AgendaEntry[] = ordered.map((appointment) => ({
    appointment,
    conflictsWith: [...(conflicts.get(appointment.id) ?? [])],
  }));
  const conflictCount = entries.filter((entry) => entry.conflictsWith.length > 0).length;

  return { date, entries, conflictCount };
}

/**
 * Book an Appointment in the current Location (GF-19). Validates the slot and its
 * optional links; ScopedDb enforces scope membership of each link and, per
 * ADR-0007, never blocks an overlap — the agenda surfaces conflicts instead.
 */
export async function createAppointment(scope: Scope, input: unknown): Promise<ScopedAppointment> {
  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid appointment", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).createAppointment(parsed.data);
}

/** A single Appointment by id, scoped (a 404 outside scope, never a cross-tenant read). */
export async function getAppointment(scope: Scope, input: unknown): Promise<ScopedAppointment> {
  const parsed = getAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid appointment id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).getAppointment(parsed.data.id);
}

/**
 * Render one day of the agenda (GF-19). Defaults to today when no `date` is given,
 * turns the calendar day into its `[from, to)` range ({@link dayRange}), lists the
 * scoped slots that start in it, and shapes them with {@link buildAgenda}. Reads
 * live every time — the agenda is a view over Appointments, nothing is duplicated.
 */
export async function getDayAgenda(scope: Scope, input: unknown): Promise<DayAgenda> {
  const parsed = getDayAgendaSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid agenda query", z.flattenError(parsed.error).fieldErrors);
  }

  const date = parsed.data.date ?? toDateParam(new Date());
  const appointments = await scoped(scope).listAppointments(dayRange(date));
  return buildAgenda(appointments, date);
}

/**
 * Cancel an Appointment (GF-19) — the slot's only status change (there is no hard
 * delete). Scoped, so a slot outside the caller's Location 404s. Idempotent.
 */
export async function cancelAppointment(scope: Scope, input: unknown): Promise<ScopedAppointment> {
  const parsed = cancelAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid appointment id", z.flattenError(parsed.error).fieldErrors);
  }

  return scoped(scope).cancelAppointment(parsed.data.id);
}

/** Re-exported so callers can label a status without reaching into the schema module. */
export const APPOINTMENT_STATUS_VALUES: readonly AppointmentStatus[] = ["scheduled", "cancelled"];
