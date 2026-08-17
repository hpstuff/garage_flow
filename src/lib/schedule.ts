/**
 * Working calendar / availability (GF-20, ADR-0008). Transport-free types and constants.
 *
 * The schedule is stored as a JSON column on the `location` table; this module
 * keeps the shape transport-free so both the server (schema, services) and client
 * components can import it without pulling the database client into the browser bundle.
 */

/** ISO weekday number (1=Monday … 7=Sunday), matching `Date.prototype.getDay()`. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** ISO date string, e.g. `"2026-12-24"`. */
export type IsoDate = `${string}-${string}-${string}`;

/** A local-time range (`HH:mm`). Both fields are required on an open day. */
export interface TimeRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** One day of the weekly schedule, keyed by ISO weekday number. */
export type WeekdayConfig = TimeRange | null;

/** A date-specific override applied in priority over the weekly default. */
export interface DateException {
  /** The calendar date this exception applies to (`YYYY-MM-DD`). */
  date: IsoDate;
  /** When `true` the location is closed on this date — hours are ignored. */
  closed: boolean;
  /** Override hours for an open-day exception (ignored when `closed`). */
  hours?: TimeRange;
}

/** The top-level working calendar configuration value object. */
export interface ScheduleConfig {
  /** Weekly defaults keyed by ISO weekday number (1=Monday … 7=Sunday). `null` means closed that day. */
  weekly: Record<Weekday, WeekdayConfig>;
  /** Date-specific overrides applied in priority over the weekly default for that date. */
  exceptions: DateException[];
}

/** Default schedule: Mon-Fri 09:00-18:00, Sat-Sun closed. */
export const DEFAULT_SCHEDULE: ScheduleConfig = {
  weekly: {
    1: { start: "09:00", end: "18:00" },
    2: { start: "09:00", end: "18:00" },
    3: { start: "09:00", end: "18:00" },
    4: { start: "09:00", end: "18:00" },
    5: { start: "09:00", end: "18:00" },
    6: null,
    7: null,
  },
  exceptions: [],
};

/**
 * Given a `ScheduleConfig` and an ISO date string, returns the effective daily hours for that date.
 * Returns `null` when the date is closed (weekly default or exception).
 */
export function getDayHours(config: ScheduleConfig | null, isoDate: IsoDate): TimeRange | null {
  if (!config) return DEFAULT_SCHEDULE.weekly[1]; // fallback to first open day

  const weekday = isoToWeekday(isoDate);
  if (weekday === null) return DEFAULT_SCHEDULE.weekly[1];

  const exception = config.exceptions.find((e) => e.date === isoDate);
  if (exception?.closed) return null;
  if (exception?.hours) return exception.hours;

  return config.weekly[weekday] ?? null;
}

/** Parse an ISO date string to its ISO weekday number (1=Monday … 7=Sunday). */
function isoToWeekday(isoDate: IsoDate): Weekday | null {
  const parts = isoDate.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  // Convert from JS getDay() (0=Sunday) to ISO weekday (1=Monday … 7=Sunday)
  const jsDay = new Date(year, month - 1, day).getDay();
  return (jsDay === 0 ? 7 : jsDay) as Weekday;
}

/** Minutes since midnight for a local "HH:mm" time string. */
function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether an appointment slot falls within the location's configured hours for its date.
 * Returns `null` when allowed, or an error message string when blocked.
 */
export function validateAppointmentWithinSchedule(
  appointment: { startsAt: Date; endsAt: Date },
  scheduleConfig: ScheduleConfig | null,
): string | null {
  const dayHours = getDayHours(scheduleConfig, toDateParam(appointment.startsAt));
  if (!dayHours) return "The location is closed on this date.";

  const slotStartMinutes = appointment.startsAt.getHours() * 60 + appointment.startsAt.getMinutes();
  const slotEndMinutes = appointment.endsAt.getHours() * 60 + appointment.endsAt.getMinutes();

  const openMinutes = timeToMinutes(dayHours.start);
  const closeMinutes = timeToMinutes(dayHours.end);

  if (slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes) {
    return `The location is not open at this time. Open ${dayHours.start}–${dayHours.end}.`;
  }
  return null;
}

/** A Date rendered as a local `YYYY-MM-DD` day param — the inverse of {@link dayRange}. */
export function toDateParam(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
