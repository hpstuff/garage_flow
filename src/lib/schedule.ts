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

/** Local-time range (`HH:mm`). Both fields are required on an open day. */
export interface TimeRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** Day keys as stored input to the form and service layer (`mon`…`sun`). */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** One day of the weekly schedule, keyed by ISO weekday number. */
export type WeekdayConfig = TimeRange | null;

/**
 * One weekday's row in the settings form (GF-20): the open/closed flag plus the
 * `HH:mm` hour strings — the flat, form-editable projection of {@link Weekday}.
 * `start`/`end` are `null` on a closed day.
 */
export interface ScheduleDayInput {
  /** Whether the location works on this day. */
  open: boolean;
  start: string | null;
  end: string | null;
}

/** Weekly input keyed by day name (`mon`…`sun`) — the form/service view of {@link ScheduleConfig.weekly}. */
export type WeeklyInput = Record<(typeof DAYS)[number], ScheduleDayInput>;

/** A date-specific override, in the flat (form-editable) shape of {@link DateException}. */
export interface ExceptionInput {
  /** The calendar date this exception applies to (`YYYY-MM-DD`). */
  date: string;
  /** When `true` the location is closed on this date — hours are ignored. */
  closed: boolean;
  /** Override hours for an open-day exception (ignored when `closed`). */
  hours: TimeRange | null;
}

/**
 * The full schedule config in flat input shape — what the settings form builds and
 * what {@link setScheduleConfigSchema} accepts. Distinct from {@link ScheduleConfig},
 * which is the persisted form: the weekly map is keyed by day names and hours are
 * optional rather than `null`.
 */
export interface ScheduleConfigInput {
  /** Whether schedule enforcement applies at all (GF-20). `false` means no restriction, ever. */
  enabled: boolean;
  weekly: WeeklyInput;
  exceptions: ExceptionInput[];
}

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
  /**
   * Whether schedule enforcement applies at all (GF-20). Some garages don't
   * want business-hours restrictions; when `false`, {@link validateAppointmentWithinSchedule}
   * allows any time regardless of `weekly`/`exceptions`.
   */
  enabled: boolean;
  /** Weekly defaults keyed by ISO weekday number (1=Monday … 7=Sunday). `null` means closed that day. */
  weekly: Record<Weekday, WeekdayConfig>;
  /** Date-specific overrides applied in priority over the weekly default for that date. */
  exceptions: DateException[];
}

/** Default schedule: enabled, Mon-Fri 09:00-18:00, Sat-Sun closed. */
export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: true,
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
  // A Location that has turned enforcement off entirely (GF-20) has no restricted hours.
  if (scheduleConfig && !scheduleConfig.enabled) return null;

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

/**
 * The default schedule as a flat {@link WeeklyInput} (GF-20) — the form's initial state,
 * mirroring {@link DEFAULT_SCHEDULE} (Mon–Fri 09:00–18:00, Sat–Sun closed).
 */
export const DEFAULT_WEEKLY_INPUT: WeeklyInput = {
  mon: { open: true, start: "09:00", end: "18:00" },
  tue: { open: true, start: "09:00", end: "18:00" },
  wed: { open: true, start: "09:00", end: "18:00" },
  thu: { open: true, start: "09:00", end: "18:00" },
  fri: { open: true, start: "09:00", end: "18:00" },
  sat: { open: false, start: null, end: null },
  sun: { open: false, start: null, end: null },
};

/** Build a {@link ScheduleConfig} from a validated {@link ScheduleConfigInput} (GF-20). */
export function configFromInput(input: ScheduleConfigInput): ScheduleConfig {
  const weekly = {} as ScheduleConfig["weekly"];
  for (const [index, dayKey] of DAYS.entries()) {
    const day = input.weekly[dayKey];
    weekly[(index + 1) as Weekday] =
      day.open && day.start !== null && day.end !== null
        ? { start: day.start, end: day.end }
        : null;
  }
  const exceptions: DateException[] = input.exceptions.map((e) =>
    e.closed
      ? { date: e.date as IsoDate, closed: true }
      : { date: e.date as IsoDate, closed: false, hours: e.hours ?? undefined },
  );
  return { enabled: input.enabled, weekly, exceptions };
}

/**
 * Parse the stored `working_schedule` JSON into the full {@link ScheduleConfig} (GF-20).
 * Accepts both the persisted ISO-weekday-numbered form (`"1"`–`"7"`) and the legacy
 * `mon..sun` keyed form; every day gets an explicit value. Unknown day keys and
 * partially written rows fall back to the {@link DEFAULT_SCHEDULE} for that day, so
 * a malformed stored row never crashes consumers. `enabled` doesn't live in the JSON
 * itself (it's the Location's own `schedule_enabled` column), so it's passed in.
 */
export function parseStoredConfig(stored: unknown, enabled: boolean): ScheduleConfig {
  const defaults = configFromInput({
    enabled,
    weekly: DEFAULT_WEEKLY_INPUT,
    exceptions: [],
  });
  const weekly = { ...defaults.weekly };

  const source: Record<string, unknown> =
    stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};

  if (source.weekly !== null && typeof source.weekly === "object") {
    for (const [key, rawRange] of Object.entries(
      source.weekly as Record<string, TimeRange | null>,
    )) {
      const isoWeekday = /^[1-7]$/.test(key) ? (Number(key) as Weekday) : isoWeekdayFromDayKey(key);
      if (isoWeekday === null) continue;
      weekly[isoWeekday] = rawRange === null ? null : { start: rawRange.start, end: rawRange.end };
    }
  }

  const rawExceptions = Array.isArray(source.exceptions) ? source.exceptions : [];
  // Entries are validated by the service on write; drop malformed rows rather than
  // failing the whole read.
  const exceptions: DateException[] = rawExceptions
    .filter(
      (e): e is { date: string; closed: boolean; hours?: TimeRange } =>
        e !== null &&
        typeof e === "object" &&
        typeof (e as { date?: unknown }).date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test((e as { date: string }).date) &&
        typeof (e as { closed?: unknown }).closed === "boolean",
    )
    .map((e) =>
      e.closed
        ? { date: e.date as IsoDate, closed: true }
        : { date: e.date as IsoDate, closed: false, hours: e.hours },
    );

  return { enabled, weekly, exceptions };
}

/** `"mon"` → ISO weekday number (1 = Monday … 7 = Sunday); `null` for unknown keys. */
function isoWeekdayFromDayKey(key: string): Weekday | null {
  const index = DAYS.indexOf(key as (typeof DAYS)[number]);
  return index === -1 ? null : ((index + 1) as Weekday);
}
