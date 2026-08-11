"use client";

import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { saveMilestone } from "@/lib/client-relations/actions";
import type { MilestoneRow } from "@/lib/client-relations/queries";
import { milestoneLabel } from "@/lib/client-relations/stages";
import { formatMoney } from "@/lib/format";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

/**
 * One rung of the payment ladder, edited in place.
 *
 * All nine rows exist from the moment the plot does (seeded by
 * create_client_engagement), so there is no "add a row" step — you fill in
 * the amounts and dates that apply and leave the rest blank. That is the
 * shape the founder's sheet already had.
 *
 * Received and outstanding are computed, never typed: they come from the
 * receipts below via lib/client-relations/dues.ts.
 */
export function MilestoneRowEditor({ milestone }: { milestone: MilestoneRow }) {
  const initial = {
    dueAmount: milestone.dueAmount === null ? "" : String(milestone.dueAmount),
    dueOn: milestone.dueOn ?? "",
    invoiceNo: milestone.invoiceNo ?? "",
    invoicedOn: milestone.invoicedOn ?? "",
  };

  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof initial, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const { flush, error, saved } = useSaveOnBlur({
    initial,
    validate: (value) => {
      if (
        value.dueAmount !== "" &&
        (!Number.isFinite(Number(value.dueAmount)) || Number(value.dueAmount) < 0)
      ) {
        return "An amount has to be zero or more.";
      }
      // Mirrors client_payment_milestones_invoice_check.
      if (value.invoiceNo.trim() && !value.invoicedOn) {
        return "An invoice number needs the date it was raised.";
      }
      return undefined;
    },
    save: (value) =>
      saveMilestone(milestone.id, {
        dueAmount: value.dueAmount === "" ? null : Number(value.dueAmount),
        dueOn: value.dueOn || null,
        invoiceNo: value.invoiceNo || null,
        invoicedOn: value.invoicedOn || null,
        note: milestone.note,
      }),
  });

  const save = () => flush(form);
  const id = (name: string) => `milestone-${milestone.id}-${name}`;

  return (
    <TableRow>
      <TableCell className="text-foreground min-w-[160px] font-medium whitespace-nowrap">
        {milestoneLabel(milestone.stage)}
        {milestone.isOverdue && (
          <Badge variant="danger" className="ml-2">
            Overdue
          </Badge>
        )}
        {milestone.isSettled && !milestone.isOverdue && (
          <Badge variant="success" className="ml-2">
            Paid
          </Badge>
        )}
        <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
      </TableCell>

      <TableCell>
        <Input
          id={id("amount")}
          aria-label={`${milestoneLabel(milestone.stage)} amount`}
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          className="h-9 w-32"
          value={form.dueAmount}
          onChange={(event) => set("dueAmount", event.target.value)}
          onBlur={save}
          autoComplete="off"
        />
      </TableCell>

      <TableCell>
        <Input
          id={id("due")}
          aria-label={`${milestoneLabel(milestone.stage)} due date`}
          type="date"
          className="h-9 w-40"
          value={form.dueOn}
          onChange={(event) => set("dueOn", event.target.value)}
          onBlur={save}
        />
      </TableCell>

      <TableCell>
        <Input
          id={id("invoiced")}
          aria-label={`${milestoneLabel(milestone.stage)} invoiced on`}
          type="date"
          className="h-9 w-40"
          value={form.invoicedOn}
          onChange={(event) => set("invoicedOn", event.target.value)}
          onBlur={save}
        />
      </TableCell>

      <TableCell>
        <Input
          id={id("invoice-no")}
          aria-label={`${milestoneLabel(milestone.stage)} invoice number`}
          className="h-9 w-32"
          value={form.invoiceNo}
          onChange={(event) => set("invoiceNo", event.target.value)}
          onBlur={save}
          placeholder="—"
          autoComplete="off"
        />
      </TableCell>

      {/* Computed, never typed. */}
      <TableCell className="text-muted text-right font-mono text-xs whitespace-nowrap">
        {milestone.received > 0 ? formatMoney(milestone.received) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
        {milestone.outstanding > 0 ? (
          <span className={milestone.isOverdue ? "text-danger" : undefined}>
            {formatMoney(milestone.outstanding)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
