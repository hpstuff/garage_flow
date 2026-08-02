"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/lib/action-result";
import { requireScope } from "@/app/lib/session";
import { type FieldErrors, isDomainError, ValidationError } from "@/server/domain/errors";
import {
  cancelAppointment,
  createAppointment,
  type DayAgenda,
  getAppointment,
  getDayAgenda,
  type ScopedAppointment,
} from "@/server/services/appointment/service";

/**
 * Appointment Server Actions (GF-19). Each follows the reference shape
 * (ADR-0005/0015): authenticate → derive scope → call ONE service → adapt the
 * result/errors. No business logic lives here — the day boundaries and the
 * conflict detection are the service's (ADR-0007).
 *
 * Mutations carry `fieldErrors` so the form can surface Zod messages inline; the
 * generic `error` code covers the rest (auth, not-found, foreign links).
 */

/** A mutation result: the saved Appointment, or an error code + optional field errors. */
export type AppointmentMutationResult =
  | { ok: true; data: ScopedAppointment }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function toMutationError(error: unknown): AppointmentMutationResult {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
  }
  if (isDomainError(error)) {
    return { ok: false, error: error.code };
  }
  throw error;
}

/** One day of the agenda (GF-19); `date` is `YYYY-MM-DD`, defaulting to today when omitted. */
export async function getDayAgendaAction(date?: string): Promise<ActionResult<DayAgenda>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getDayAgenda(scope, date ? { date } : {}) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function getAppointmentAction(id: string): Promise<ActionResult<ScopedAppointment>> {
  try {
    const scope = await requireScope();
    return { ok: true, data: await getAppointment(scope, { id }) };
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function createAppointmentAction(input: unknown): Promise<AppointmentMutationResult> {
  try {
    const scope = await requireScope();
    const data = await createAppointment(scope, input);
    revalidatePath("/appointments");
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}

export async function cancelAppointmentAction(id: string): Promise<AppointmentMutationResult> {
  try {
    const scope = await requireScope();
    const data = await cancelAppointment(scope, { id });
    revalidatePath("/appointments");
    return { ok: true, data };
  } catch (error) {
    return toMutationError(error);
  }
}
