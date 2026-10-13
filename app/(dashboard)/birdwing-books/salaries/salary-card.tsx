"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Figure } from "@/components/ui/figure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { confirmSalary } from "@/lib/birdwing-books/actions";
import type { SalaryCard } from "@/lib/birdwing-books/queries";
import { monthLabel } from "@/lib/birdwing-books/shared";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useState } from "react";

const money = (value: number) => formatMoney(value, { paise: value % 1 !== 0 });

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function SalaryCardView({
  card,
  month,
  daysInMonth,
  canConfirm,
}: {
  card: SalaryCard;
  month: string;
  daysInMonth: number;
  canConfirm: boolean;
}) {
  const { staff, rule, preview, run } = card;
  const [incentives, setIncentives] = useState("");
  const [deductions, setDeductions] = useState("");
  const [note, setNote] = useState("");

  const ruleLine = rule
    ? [
        `${money(rule.baseSalary)} a month`,
        rule.shiftStart ? `shift ${rule.shiftStart}–${rule.shiftEnd}` : "fixed",
        rule.otRatePerHr ? `${money(rule.otRatePerHr)}/hr overtime` : null,
        rule.roomDayRate ? `${money(rule.roomDayRate)} a room-day` : null,
        rule.guestDayRate ? `${money(rule.guestDayRate)} a guest-day` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  if (run) {
    return (
      <Section
        title={staff.name}
        note={ruleLine ?? undefined}
        aside={<Badge variant="success">Confirmed</Badge>}
      >
        <div className="space-y-1">
          <Line label="Base" value={money(run.base)} />
          {run.otAmount > 0 && (
            <Line
              label={`Overtime, ${formatQuantity(run.otHours)} h`}
              value={money(run.otAmount)}
            />
          )}
          {run.roomAmount > 0 && (
            <Line label={`${run.roomDays} room-days`} value={money(run.roomAmount)} />
          )}
          {run.guestAmount > 0 && (
            <Line label={`${run.guestDays} guest-days`} value={money(run.guestAmount)} />
          )}
          {run.incentives > 0 && <Line label="Incentives" value={money(run.incentives)} />}
          {run.deductions > 0 && <Line label="Deductions" value={`− ${money(run.deductions)}`} />}
        </div>
        <div className="border-border mt-3 flex items-end justify-between gap-3 border-t pt-3">
          <Figure label="Salary" value={money(run.total)} size="lg" />
          <p className="text-muted text-right text-xs">
            Confirmed {formatDate(run.confirmedAt)}
            {run.confirmedByName ? ` by ${run.confirmedByName}` : ""}
            {run.note ? <span className="block">{run.note}</span> : null}
          </p>
        </div>
      </Section>
    );
  }

  if (!rule || !preview) {
    return (
      <Section title={staff.name}>
        <p className="text-muted text-sm">
          No pay rule for {monthLabel(month)} — an admin adds one in Settings.
        </p>
      </Section>
    );
  }

  const extra = Number(incentives.replace(/[,₹\s]/g, "")) || 0;
  const less = Number(deductions.replace(/[,₹\s]/g, "")) || 0;
  const total = Math.round((preview.gross + extra - less) * 100) / 100;

  return (
    <Section title={staff.name} note={ruleLine ?? undefined}>
      <div className="space-y-1">
        <Line label="Base" value={money(preview.base)} />
        {rule.shiftStart && (
          <Line
            label={`Overtime, ${formatQuantity(preview.otHours)} h`}
            value={money(preview.otAmount)}
          />
        )}
        {rule.roomDayRate > 0 && (
          <Line label={`${preview.roomDays} room-days`} value={money(preview.roomAmount)} />
        )}
        {rule.guestDayRate > 0 && (
          <Line label={`${preview.guestDays} guest-days`} value={money(preview.guestAmount)} />
        )}
      </div>
      <p className="text-muted mt-2 text-xs">
        {card.daysRecorded} of {daysInMonth} days marked · {preview.workedDays} present
        {preview.halfDays ? ` · ${preview.halfDays} half days` : ""}
        {preview.leaveDays ? ` · ${preview.leaveDays} leave` : ""}
        {preview.absentDays ? ` · ${preview.absentDays} absent` : ""}
      </p>
      {preview.missingTimes.length > 0 && (
        <p className="text-warning mt-1 text-xs">
          No in/out times on {preview.missingTimes.map((day) => formatDate(day)).join(", ")} — those
          days count no overtime. Add the times in Attendance first if there was any.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`inc-${staff.id}`}>Incentives (₹)</Label>
          <Input
            id={`inc-${staff.id}`}
            inputMode="decimal"
            value={incentives}
            onChange={(event) => setIncentives(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ded-${staff.id}`}>Deductions (₹)</Label>
          <Input
            id={`ded-${staff.id}`}
            inputMode="decimal"
            value={deductions}
            onChange={(event) => setDeductions(event.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`note-${staff.id}`}>Note</Label>
          <Input
            id={`note-${staff.id}`}
            value={note}
            maxLength={200}
            onChange={(event) => setNote(event.target.value)}
            placeholder={less > 0 ? "What the deduction is for" : "Optional"}
          />
        </div>
      </div>

      <div className="border-border mt-3 flex items-end justify-between gap-3 border-t pt-3">
        <Figure label="Comes to" value={money(total)} size="lg" />
        <ConfirmDialog
          tone="primary"
          trigger={<Button disabled={!canConfirm || total <= 0}>Confirm salary</Button>}
          title={`Confirm ${staff.name}'s ${monthLabel(month)} salary?`}
          description={`${money(total)} becomes ${monthLabel(month)}'s salary line in Expenses, and ${staff.name}'s attendance for the month closes. A confirmed salary can't be changed here.`}
          confirmLabel={`Confirm ${money(total)}`}
          pendingLabel="Confirming…"
          onConfirm={() => {
            const formData = new FormData();
            formData.set("incentives", incentives);
            formData.set("deductions", deductions);
            formData.set("note", note);
            return confirmSalary(staff.id, `${month}-01`, undefined, formData);
          }}
        />
      </div>
    </Section>
  );
}
