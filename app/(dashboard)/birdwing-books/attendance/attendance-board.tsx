"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAttendance, markAllPresent, saveAttendance } from "@/lib/birdwing-books/actions";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_MARKS,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from "@/lib/birdwing-books/shared";
import { formatDate, formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

export type BoardRecord = {
  status: AttendanceStatus;
  inAt: string | null;
  outAt: string | null;
  breakMinutes: number;
  note: string | null;
};

type Person = { id: string; name: string; isActive: boolean };

const TONE: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success",
  half_day: "bg-info/15 text-info",
  leave: "bg-warning/15 text-warning",
  holiday_leave: "bg-foreground/[0.08] text-muted",
  absent: "bg-danger/10 text-danger",
};

/**
 * Today first — the morning's one job on a phone, each person a row of
 * big buttons — then the month, staff down the side and days across, for
 * putting a day right. Any day opens its status, times and note. A month
 * whose salary is confirmed is closed for that person (0116 holds it).
 */
export function AttendanceBoard({
  staff,
  days,
  today,
  records,
  closed,
}: {
  staff: Person[];
  days: string[];
  today: string;
  records: Record<string, Record<string, BoardRecord>>;
  closed: string[];
}) {
  const [open, setOpen] = useState<{ person: Person; day: string } | null>(null);
  const closedSet = new Set(closed);
  const showToday = days.includes(today);
  const working = staff.filter((person) => person.isActive);

  return (
    <div className="space-y-4">
      {showToday && working.length > 0 && (
        <TodayCard
          staff={working}
          today={today}
          records={records}
          closed={closedSet}
          onOpen={(person) => setOpen({ person, day: today })}
        />
      )}

      <div className="border-border bg-surface overflow-x-auto rounded-2xl border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-border border-b">
              <th className="bg-surface text-muted sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-medium tracking-[0.14em] uppercase">
                Staff
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className={cn(
                    "min-w-8 px-0.5 py-2 text-center font-medium tabular-nums",
                    day === today ? "text-accent" : "text-muted",
                  )}
                >
                  {Number(day.slice(8, 10))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {staff.map((person) => {
              const isClosed = closedSet.has(person.id);
              return (
                <tr key={person.id}>
                  <th
                    scope="row"
                    className="bg-surface text-foreground sticky left-0 z-10 px-3 py-1.5 text-left text-sm font-medium whitespace-nowrap"
                  >
                    {person.name}
                    {isClosed && (
                      <span className="text-muted block text-[10px]">Paid — closed</span>
                    )}
                  </th>
                  {days.map((day) => {
                    const record = records[person.id]?.[day];
                    const future = day > today;
                    return (
                      <td key={day} className="p-0.5">
                        <button
                          type="button"
                          disabled={future || isClosed}
                          onClick={() => setOpen({ person, day })}
                          title={`${person.name}, ${formatDate(day)}: ${record ? ATTENDANCE_LABELS[record.status] : "not marked"}`}
                          className={cn(
                            "focus-visible:ring-accent flex h-8 w-full items-center justify-center rounded-md font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default",
                            record
                              ? TONE[record.status]
                              : future
                                ? "text-muted/30"
                                : "text-muted/60 hover:bg-foreground/[0.05]",
                          )}
                        >
                          {record ? ATTENDANCE_MARKS[record.status] : "·"}
                          {record?.inAt && <span className="sr-only">, with times</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {ATTENDANCE_STATUSES.map((status) => (
          <span key={status}>
            <span className="text-foreground font-semibold">{ATTENDANCE_MARKS[status]}</span>{" "}
            {ATTENDANCE_LABELS[status]}
          </span>
        ))}
        <span>Tap a day to change it or add the times worked.</span>
      </p>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent>
          {open && (
            <DayForm
              key={`${open.person.id}-${open.day}`}
              person={open.person}
              day={open.day}
              record={records[open.person.id]?.[open.day] ?? null}
              onDone={() => setOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TodayCard({
  staff,
  today,
  records,
  closed,
  onOpen,
}: {
  staff: Person[];
  today: string;
  records: Record<string, Record<string, BoardRecord>>;
  closed: Set<string>;
  onOpen: (person: Person) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const unmarked = staff.filter((person) => !records[person.id]?.[today]).length;

  const quick = (person: Person, status: AttendanceStatus) => {
    setError(undefined);
    const formData = new FormData();
    formData.set("status", status);
    const record = records[person.id]?.[today];
    if (record?.inAt && (status === "present" || status === "half_day")) {
      formData.set("in_at", record.inAt);
      formData.set("out_at", record.outAt ?? "");
      formData.set("break_minutes", String(record.breakMinutes));
    }
    startTransition(async () => {
      const result = await saveAttendance(person.id, today, undefined, formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-foreground text-[15px] font-semibold tracking-tight">
          Today · {formatLongDate(today)}
        </h2>
        {unmarked > 0 && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markAllPresent(today);
                if (result?.error) setError(result.error);
              })
            }
          >
            Everyone not marked: present
          </Button>
        )}
      </div>
      <ul className="divide-border divide-y">
        {staff.map((person) => {
          const record = records[person.id]?.[today];
          const isClosed = closed.has(person.id);
          return (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <button
                type="button"
                onClick={() => onOpen(person)}
                disabled={isClosed}
                className="text-foreground hover:text-accent min-w-0 text-left text-sm font-medium"
              >
                {person.name}
                <span className="text-muted block text-xs font-normal">
                  {record
                    ? `${ATTENDANCE_LABELS[record.status]}${record.inAt ? ` · ${record.inAt}–${record.outAt}` : " · add times"}`
                    : "Not marked"}
                </span>
              </button>
              <div className="flex flex-wrap gap-1">
                {(["present", "half_day", "leave", "absent"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pending || isClosed}
                    onClick={() => quick(person, status)}
                    className={cn(
                      "focus-visible:ring-accent h-10 min-w-12 rounded-xl px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
                      record?.status === status
                        ? TONE[status]
                        : "border-border text-muted hover:bg-foreground/[0.05] border",
                    )}
                    aria-pressed={record?.status === status}
                  >
                    {ATTENDANCE_LABELS[status]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <FormMessage error={error} />
    </Card>
  );
}

function DayForm({
  person,
  day,
  record,
  onDone,
}: {
  person: Person;
  day: string;
  record: BoardRecord | null;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(record?.status ?? "present");
  const [state, formAction, pending] = useActionState(
    saveAttendance.bind(null, person.id, day),
    undefined,
  );
  const [clearing, startClear] = useTransition();
  const [clearError, setClearError] = useState<string>();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && !state?.error) onDone();
    was.current = pending;
  }, [pending, state, onDone]);
  const worked = status === "present" || status === "half_day";

  return (
    <form action={formAction}>
      <DialogHeader>
        <DialogTitle>{person.name}</DialogTitle>
        <DialogDescription>{formatLongDate(day)}</DialogDescription>
      </DialogHeader>
      <fieldset disabled={pending || clearing} className="space-y-3">
        <input type="hidden" name="status" value={status} />
        <div className="grid grid-cols-2 gap-2">
          {ATTENDANCE_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={cn(
                "focus-visible:ring-accent h-11 rounded-xl text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
                status === value ? TONE[value] : "border-border text-muted border",
              )}
            >
              {ATTENDANCE_LABELS[value]}
            </button>
          ))}
        </div>
        {worked && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="day-in">In</Label>
              <Input id="day-in" name="in_at" type="time" defaultValue={record?.inAt ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="day-out">Out</Label>
              <Input id="day-out" name="out_at" type="time" defaultValue={record?.outAt ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="day-break">Break (min)</Label>
              <Input
                id="day-break"
                name="break_minutes"
                inputMode="numeric"
                defaultValue={String(record?.breakMinutes ?? 0)}
              />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="day-note">Note</Label>
          <Input id="day-note" name="note" defaultValue={record?.note ?? ""} maxLength={200} />
        </div>
      </fieldset>
      <FormMessage error={state?.error ?? clearError} />
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {record ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={pending || clearing}
            onClick={() =>
              startClear(async () => {
                const result = await clearAttendance(person.id, day);
                if (result?.error) setClearError(result.error);
                else onDone();
              })
            }
          >
            Clear the day
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || clearing}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
