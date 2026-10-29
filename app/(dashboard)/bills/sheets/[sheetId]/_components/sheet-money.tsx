"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { reverseSheetMoney } from "@/lib/bills/sheet-actions";
import type { SheetMoneyEntry } from "@/lib/bills/sheets";
import { formatDate, formatMoney } from "@/lib/format";
import { useRouter } from "next/navigation";

/** Each payment or recovery as it was made, whole; a bill approver reverses one whole, with a reason. */
export function SheetMoney({
  payments,
  recoveries,
  canReverse,
}: {
  payments: SheetMoneyEntry[];
  recoveries: SheetMoneyEntry[];
  canReverse: boolean;
}) {
  const router = useRouter();
  const rows = [
    ...payments.map((entry) => ({ ...entry, kind: "payment" as const })),
    ...recoveries.map((entry) => ({ ...entry, kind: "recovery" as const })),
  ].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  if (rows.length === 0) return null;

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>On</TableHeaderCell>
          <TableHeaderCell>What</TableHeaderCell>
          <TableHeaderCell>Reference</TableHeaderCell>
          <TableHeaderCell>By</TableHeaderCell>
          <TableHeaderCell className="text-right">Amount</TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.kind}-${row.entry}`}>
            <TableCell className="whitespace-nowrap">{formatDate(row.on)}</TableCell>
            <TableCell>
              {row.reversal
                ? row.kind === "payment"
                  ? "Payment reversed"
                  : "Recovery reversed"
                : row.kind === "payment"
                  ? "Payment"
                  : "Advance recovered"}
              {row.reversed && (
                <Badge variant="neutral" className="ml-2">
                  Reversed
                </Badge>
              )}
              <div className="text-muted text-xs">
                {[
                  `over ${row.bills} ${row.bills === 1 ? "bill" : "bills"}`,
                  row.reason ?? undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{row.reference}</TableCell>
            <TableCell className="text-muted">{row.by ?? "—"}</TableCell>
            <TableCell className="text-right font-mono">
              {formatMoney(row.amount, { paise: true })}
            </TableCell>
            <TableCell className="text-right">
              {canReverse && !row.reversal && !row.reversed && (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      Reverse
                    </Button>
                  }
                  title={`Reverse this ${row.kind === "payment" ? "payment" : "recovery"}?`}
                  description="The same amount is entered the other way on every bill it covered, with your reason, so the sheet has it pending again. Both entries stay on record. This can't be undone."
                  confirmLabel="Reverse it"
                  pendingLabel="Reversing…"
                  reason={{ label: "Why", placeholder: "Paid twice by mistake" }}
                  onConfirm={async (reason) => {
                    const result = await reverseSheetMoney(row.kind, row.entry, reason);
                    if (!result?.error) router.refresh();
                    return result;
                  }}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
