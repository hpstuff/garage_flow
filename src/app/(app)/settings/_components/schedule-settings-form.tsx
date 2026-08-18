"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DAYS,
  DEFAULT_WEEKLY_INPUT,
  type ExceptionInput,
  type ScheduleConfig,
  type ScheduleConfigInput,
  type ScheduleDayInput,
  type WeeklyInput,
} from "@/lib/schedule";
import { setScheduleConfigAction } from "../_actions/schedule-actions";

type DayKey = (typeof DAYS)[number];

/** Render a stored (ISO-weekday-keyed) config back into the flat form shape. */
function toFormInput(config: ScheduleConfig | null): ScheduleConfigInput {
  if (!config) {
    return { weekly: { ...DEFAULT_WEEKLY_INPUT }, exceptions: [] };
  }
  const weekly: WeeklyInput = {} as WeeklyInput;
  for (const [index, dayKey] of DAYS.entries()) {
    const range = config.weekly[(index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7];
    const day: ScheduleDayInput = range
      ? { open: true, start: range.start, end: range.end }
      : { open: false, start: null, end: null };
    weekly[dayKey] = day;
  }
  const exceptions: ExceptionInput[] = (config.exceptions ?? []).map((e) => ({
    date: e.date,
    closed: e.closed,
    hours: e.closed ? null : (e.hours ?? null),
  }));
  return { weekly, exceptions };
}

type DayErrors = Record<string, string | undefined>;

function dayError(errors: DayErrors, key: string): string | undefined {
  return errors[key];
}

/**
 * Working-schedule settings form (GF-20, ADR-0006). The weekly table toggles each
 * day open/closed with `HH:mm` hours; date exceptions override a single calendar
 * day on top of the weekly default. Input is the flat {@link ScheduleConfigInput}
 * shape the Zod schema accepts; the service persists it as the ISO-weekday-keyed
 * {@link ScheduleConfig}.
 */
export function ScheduleSettingsForm({ config }: { config: ScheduleConfig | null }) {
  const t = useTranslations("settings.schedule");

  const initial = toFormInput(config);
  const [weekly, setWeekly] = useState<WeeklyInput>(initial.weekly);
  const [exceptions, setExceptions] = useState<ExceptionInput[]>(initial.exceptions);

  const [dayErrors, setDayErrors] = useState<DayErrors>({});
  const [exceptionErrors, setExceptionErrors] = useState<DayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function markDirty() {
    setSaved(false);
  }

  function updateDay(day: DayKey, patch: Partial<ScheduleDayInput>) {
    setWeekly((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    markDirty();
  }

  function toggleDayOpen(day: DayKey, open: boolean) {
    const current = weekly[day];
    updateDay(
      day,
      open
        ? { open: true, start: current.start ?? "09:00", end: current.end ?? "18:00" }
        : { open: false, start: null, end: null },
    );
  }

  function updateException(index: number, patch: Partial<ExceptionInput>) {
    setExceptions((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    markDirty();
  }

  function addException() {
    setExceptions((prev) => [...prev, { date: "", closed: true, hours: null }]);
    markDirty();
  }

  function removeException(index: number) {
    setExceptions((prev) => prev.filter((_, i) => i !== index));
    setExceptionErrors((prev) => {
      const { [String(index)]: _removed, ...rest } = prev;
      return rest;
    });
    markDirty();
  }

  /** Mirrors the service's Zod invariants so the common mistakes surface inline before the round trip. */
  function validate(): boolean {
    const nextDayErrors: DayErrors = {};
    for (const day of DAYS) {
      const row = weekly[day];
      if (!row.open) continue;
      if (!row.start || !row.end) {
        nextDayErrors[day] = t("invalidTime");
      } else if (row.end <= row.start) {
        nextDayErrors[day] = t("invalidRange");
      }
    }

    const nextExceptionErrors: DayErrors = {};
    exceptions.forEach((exception, index) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date)) {
        nextExceptionErrors[index] = t("invalidTime");
      } else if (!exception.closed) {
        if (!exception.hours?.start || !exception.hours?.end) {
          nextExceptionErrors[index] = t("invalidTime");
        } else if (exception.hours.end <= exception.hours.start) {
          nextExceptionErrors[index] = t("invalidRange");
        }
      }
    });

    setDayErrors(nextDayErrors);
    setExceptionErrors(nextExceptionErrors);
    const hasExceptionErrors = Object.keys(nextExceptionErrors).length > 0;
    setFormError(hasExceptionErrors ? t("exceptions.error") : null);
    return Object.keys(nextDayErrors).length === 0 && !hasExceptionErrors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    if (!validate()) return;

    setPending(true);
    setFormError(null);

    const result = await setScheduleConfigAction({ weekly, exceptions });

    if (result.ok) {
      setSaved(true);
      setPending(false);
      return;
    }

    setFormError(t("error"));
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("weeklyLabel")}</legend>
        <p className="text-sm text-muted-foreground">{t("weeklyHint")}</p>
        <div className="space-y-2">
          {DAYS.map((day) => {
            const row = weekly[day];
            const error = dayError(dayErrors, day);
            return (
              <div
                key={day}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <label
                  htmlFor={`schedule-day-${day}`}
                  className="flex w-36 shrink-0 items-center gap-2 text-sm font-medium"
                >
                  <Checkbox
                    id={`schedule-day-${day}`}
                    checked={row.open}
                    onCheckedChange={(checked) => toggleDayOpen(day, checked === true)}
                  />
                  {t(`days.${day}`)}
                </label>
                {row.open ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Field label={t("start")} className="w-32">
                      <Input
                        type="time"
                        value={row.start ?? ""}
                        onChange={(e) => updateDay(day, { start: e.target.value })}
                      />
                    </Field>
                    <Field label={t("end")} className="w-32">
                      <Input
                        type="time"
                        value={row.end ?? ""}
                        onChange={(e) => updateDay(day, { end: e.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}
                {error ? (
                  <p className="w-full text-sm font-medium text-destructive">{error}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("exceptions.title")}</legend>
        <p className="text-sm text-muted-foreground">{t("exceptions.hint")}</p>

        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("exceptions.empty")}</p>
        ) : (
          <div className="space-y-2">
            {exceptions.map((exception, index) => {
              const error = dayError(exceptionErrors, String(index));
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are fully controlled by index, no per-row local state
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t("exceptions.date")} className="w-40">
                      <Input
                        type="date"
                        value={exception.date}
                        onChange={(e) => updateException(index, { date: e.target.value })}
                      />
                    </Field>
                    <label
                      htmlFor={`schedule-exception-closed-${index}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={`schedule-exception-closed-${index}`}
                        checked={exception.closed}
                        onCheckedChange={(checked) =>
                          updateException(index, {
                            closed: checked === true,
                            hours:
                              checked === true
                                ? null
                                : (exception.hours ?? { start: "09:00", end: "18:00" }),
                          })
                        }
                      />
                      {t("exceptions.closed")}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeException(index)}
                    >
                      {t("exceptions.remove")}
                    </Button>
                  </div>
                  {!exception.closed ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Field label={t("start")} className="w-32">
                        <Input
                          type="time"
                          value={exception.hours?.start ?? ""}
                          onChange={(e) =>
                            updateException(index, {
                              hours: { start: e.target.value, end: exception.hours?.end ?? "" },
                            })
                          }
                        />
                      </Field>
                      <Field label={t("end")} className="w-32">
                        <Input
                          type="time"
                          value={exception.hours?.end ?? ""}
                          onChange={(e) =>
                            updateException(index, {
                              hours: { start: exception.hours?.start ?? "", end: e.target.value },
                            })
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                  {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
                </div>
              );
            })}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={addException}>
          {t("exceptions.newDate")}
        </Button>
      </fieldset>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-accent-green" role="status">
          {t("saved")}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
