import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateFull, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgendaEntry, ScopedAppointment } from "@/server/services/appointment/service";
import { getDayAgendaAction } from "./_actions/appointment-actions";
import { CancelAppointmentButton } from "./_components/cancel-appointment-button";

/**
 * The Appointment agenda (GF-19, ADR-0007) — one **day** at a time, the basic
 * day/agenda view v1 ships instead of the deferred drag-and-drop calendar. Slots
 * read earliest-first; the day is chosen by `?date=YYYY-MM-DD` (today by default),
 * navigated with prev/next/today. Obvious conflicts — an overlapping slot sharing
 * a Mechanic or bay — are **warned** on, never blocked: the row is tinted and
 * badged, but the booking still stands.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const t = await getTranslations("appointments");
  const { date: dateParam } = await searchParams;
  const date = isDateParam(dateParam) ? dateParam : todayParam();

  const result = await getDayAgendaAction(date);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const agenda = result.data;
  const prev = shiftDay(date, -1);
  const next = shiftDay(date, 1);
  const today = todayParam();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={`/appointments/new?date=${date}`} className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/appointments?date=${prev}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← {t("prev")}
          </Link>
          <Link
            href={`/appointments?date=${today}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("today")}
          </Link>
          <Link
            href={`/appointments?date=${next}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("next")} →
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{formatDateFull(`${date}T00:00:00`)}</span>
          {agenda.conflictCount > 0 ? (
            <Badge variant="destructive">{t("conflicts", { count: agenda.conflictCount })}</Badge>
          ) : null}
        </div>
      </div>

      {agenda.entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("empty")}
            <p className="mt-1 text-sm">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.time")}</TableHead>
              <TableHead>{t("columns.customer")}</TableHead>
              <TableHead>{t("columns.vehicle")}</TableHead>
              <TableHead>{t("columns.mechanic")}</TableHead>
              <TableHead>{t("columns.bay")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agenda.entries.map((entry) => (
              <AgendaRow key={entry.appointment.id} entry={entry} t={t} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** One agenda row: the slot, its resources, status, and the arrival/cancel actions. */
function AgendaRow({
  entry,
  t,
}: {
  entry: AgendaEntry;
  t: Awaited<ReturnType<typeof getTranslations<"appointments">>>;
}) {
  const { appointment: a } = entry;
  const conflicting = entry.conflictsWith.length > 0;
  const scheduled = a.status === "scheduled";

  return (
    <TableRow className={cn(conflicting && "bg-destructive/5")}>
      <TableCell className="font-medium whitespace-nowrap">
        {formatTime(a.startsAt)} – {formatTime(a.endsAt)}
        {conflicting ? (
          <Badge variant="destructive" className="ml-2" title={t("conflictHint")}>
            {t("conflictRow")}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        {a.customerName ?? <span className="text-muted-foreground">{t("walkIn")}</span>}
      </TableCell>
      <TableCell className="text-muted-foreground">{vehicleLabel(a)}</TableCell>
      <TableCell className="text-muted-foreground">{a.mechanicName ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{a.bay ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={scheduled ? "outline" : "secondary"}>{t(`status.${a.status}`)}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {scheduled && a.vehicleId ? (
            <Link
              href={`/repair-orders/new?vehicleId=${a.vehicleId}&appointmentId=${a.id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t("openOrder")}
            </Link>
          ) : null}
          {scheduled ? <CancelAppointmentButton id={a.id} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** The Vehicle's everyday identifier for a row — plate, else VIN, else a dash. */
function vehicleLabel(a: ScopedAppointment): string {
  return a.vehiclePlate ?? a.vehicleVin ?? "—";
}

/** A well-formed `YYYY-MM-DD` day param, or a type guard rejecting anything else. */
function isDateParam(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Today as a local `YYYY-MM-DD` — the agenda's default day. */
function todayParam(): string {
  return toParam(new Date());
}

/** Shift a day param by whole days, staying on local calendar days (DST-safe). */
function shiftDay(date: string, delta: number): string {
  const parts = date.split("-");
  const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  base.setDate(base.getDate() + delta);
  return toParam(base);
}

/** A Date as a local `YYYY-MM-DD` day param. */
function toParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
