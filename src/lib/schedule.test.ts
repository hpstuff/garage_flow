import { describe, expect, it } from "vitest";
import {
  configFromInput,
  DEFAULT_WEEKLY_INPUT,
  getDayHours,
  parseStoredConfig,
  validateAppointmentWithinSchedule,
} from "./schedule";

describe("configFromInput (GF-20)", () => {
  it("maps the flat mon..sun form to the ISO-weekday-keyed ScheduleConfig", () => {
    const config = configFromInput({ weekly: DEFAULT_WEEKLY_INPUT, exceptions: [] });
    expect(config.weekly[1]).toEqual({ start: "09:00", end: "18:00" }); // Monday
    expect(config.weekly[5]).toEqual({ start: "09:00", end: "18:00" }); // Friday
    expect(config.weekly[6]).toBeNull(); // Saturday
    expect(config.weekly[7]).toBeNull(); // Sunday
  });

  it("treats a day as closed when open is false, even if stray hours are present", () => {
    const config = configFromInput({
      weekly: { ...DEFAULT_WEEKLY_INPUT, mon: { open: false, start: "09:00", end: "18:00" } },
      exceptions: [],
    });
    expect(config.weekly[1]).toBeNull();
  });

  it("carries closed exceptions without hours and open exceptions with hours", () => {
    const config = configFromInput({
      weekly: DEFAULT_WEEKLY_INPUT,
      exceptions: [
        { date: "2026-12-25", closed: true, hours: null },
        { date: "2026-12-24", closed: false, hours: { start: "09:00", end: "13:00" } },
      ],
    });
    expect(config.exceptions).toEqual([
      { date: "2026-12-25", closed: true },
      { date: "2026-12-24", closed: false, hours: { start: "09:00", end: "13:00" } },
    ]);
  });
});

describe("parseStoredConfig (GF-20)", () => {
  it("falls back to the default schedule for null/empty stored values", () => {
    const config = parseStoredConfig(null);
    expect(config.weekly[1]).toEqual({ start: "09:00", end: "18:00" });
    expect(config.weekly[6]).toBeNull();
    expect(config.exceptions).toEqual([]);
  });

  it("round-trips a config written by configFromInput (the persisted shape)", () => {
    const written = configFromInput({
      weekly: { ...DEFAULT_WEEKLY_INPUT, sat: { open: true, start: "10:00", end: "14:00" } },
      exceptions: [{ date: "2026-12-25", closed: true, hours: null }],
    });
    const read = parseStoredConfig(written);
    expect(read).toEqual(written);
  });

  it("fills in missing weekdays from the default rather than crashing", () => {
    const read = parseStoredConfig({ weekly: { "1": { start: "08:00", end: "12:00" } } });
    expect(read.weekly[1]).toEqual({ start: "08:00", end: "12:00" });
    expect(read.weekly[2]).toEqual({ start: "09:00", end: "18:00" }); // default fallback
  });

  it("drops malformed exception rows instead of failing the whole read", () => {
    const read = parseStoredConfig({
      weekly: {},
      exceptions: [
        { date: "2026-12-25", closed: true },
        { date: "not-a-date", closed: true },
        { closed: true },
        "garbage",
      ],
    });
    expect(read.exceptions).toEqual([{ date: "2026-12-25", closed: true }]);
  });
});

describe("getDayHours + validateAppointmentWithinSchedule (GF-20)", () => {
  it("blocks a slot outside the configured weekly hours", () => {
    const config = configFromInput({ weekly: DEFAULT_WEEKLY_INPUT, exceptions: [] });
    expect(getDayHours(config, "2026-08-17")).toEqual({ start: "09:00", end: "18:00" }); // a Monday

    const error = validateAppointmentWithinSchedule(
      { startsAt: new Date(2026, 7, 17, 8, 0), endsAt: new Date(2026, 7, 17, 9, 0) },
      config,
    );
    expect(error).not.toBeNull();
  });

  it("allows a slot within the configured weekly hours", () => {
    const config = configFromInput({ weekly: DEFAULT_WEEKLY_INPUT, exceptions: [] });
    const error = validateAppointmentWithinSchedule(
      { startsAt: new Date(2026, 7, 17, 10, 0), endsAt: new Date(2026, 7, 17, 11, 0) },
      config,
    );
    expect(error).toBeNull();
  });
});
