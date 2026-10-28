"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { combineBills } from "@/lib/bills/actions";
import { combineProblem, keptBill } from "@/lib/bills/combine";
import type { CombinableBill } from "@/lib/bills/queries";
import type { BillStatus } from "@/lib/bills/workflow";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";
import { BillStatusBadge } from "../../_components/status-badge";

export function CombineBills({ bills }: { bills: CombinableBill[] }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const { pending, error, run, clearError } = useActionRunner();

  const open = bills.filter((bill) => !combineProblem(bill));
  const chosen = bills.filter((bill) => ticked.has(bill.id));
  const kept = keptBill(chosen);
  const total = chosen.reduce((sum, bill) => sum + bill.total, 0);
  const approved = chosen.filter((bill) => bill.status === "approved").length;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
    clearError();
  };

  // A success lands on the kept bill; only a refusal comes back.
  const combine = () => run(() => combineBills(chosen.map((bill) => bill.id)));

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={open.length < 2}
          onClick={() => setTicked(new Set(open.map((bill) => bill.id)))}
        >
          {`Tick all ${formatCount(open.length)} that can be combined`}
        </Button>
        {ticked.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
            Clear
          </Button>
        )}
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10"></TableHeaderCell>
            <TableHeaderCell>Bill</TableHeaderCell>
            <TableHeaderCell>For</TableHeaderCell>
            <TableHeaderCell>Date</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bills.map((bill) => {
            const problem = combineProblem(bill);
            return (
              <TableRow key={bill.id} className="align-top">
                <TableCell>
                  <Checkbox
                    checked={ticked.has(bill.id)}
                    disabled={Boolean(problem)}
                    onChange={(event) => toggle(bill.id, event.target.checked)}
                    aria-label={`Combine ${bill.reference}`}
                  />
                </TableCell>
                <TableCell>
                  <span className="text-foreground font-mono text-sm font-medium">
                    {bill.reference}
                  </span>
                  {problem && <div className="text-muted text-xs">{problem}</div>}
                </TableCell>
                <TableCell>
                  {bill.placeName}
                  <div className="text-muted text-xs">{bill.projectName}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(bill.invoiceDate)}</TableCell>
                <TableCell>
                  <BillStatusBadge status={bill.status as BillStatus} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(bill.total, { paise: true })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {chosen.length > 0 && (
        <div className="border-border bg-surface space-y-3 rounded-2xl border p-5">
          <p className="text-foreground text-[15px] font-semibold tracking-tight">
            {`${formatCount(chosen.length)} ${chosen.length === 1 ? "bill" : "bills"} → one bill`}
            {kept && (
              <span className="text-muted font-normal">
                {" · numbered "}
                <span className="text-foreground font-mono">{kept.reference}</span>
              </span>
            )}
          </p>
          <p className="text-muted text-sm">
            {`Total ${formatMoney(total, { paise: true })}. The other ${formatCount(Math.max(chosen.length - 1, 0))} go and their numbers stay used. The combined bill comes back recorded, waiting for approval${approved > 0 ? ` — ${formatCount(approved)} of these ${approved === 1 ? "is" : "are"} approved now and will need approving again as one` : ""}.`}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!error && chosen.length < 2 && (
              <p className="text-muted text-xs">Tick at least two bills.</p>
            )}
            <FormMessage error={error} size="xs" />
            <Button onClick={combine} disabled={pending || chosen.length < 2}>
              {pending ? "Combining…" : `Combine ${formatCount(chosen.length)} bills`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
