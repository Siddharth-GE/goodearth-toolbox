"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import type { BillListRow } from "@/lib/bills/queries";
import { consolidateBills } from "@/lib/bills/sheet-actions";
import type { ConsolidateResult } from "@/lib/bills/sheets";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BillStatusBadge } from "../../_components/status-badge";

/** The list with tick boxes: tick, then Consolidate or Print. Ticks are this page's bills. */
export function BillsTable({
  bills,
  total,
  sums,
}: {
  bills: BillListRow[];
  total: number;
  sums: { taxable: number; gst: number; total: number };
}) {
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ConsolidateResult | null>(null);

  const chosen = bills.filter((bill) => ticked.has(bill.id));
  const all = bills.length > 0 && chosen.length === bills.length;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };

  const consolidate = async () => {
    setResult(null);
    const answer = await run(() => consolidateBills(chosen.map((bill) => bill.id)));
    if (answer && "result" in answer && answer.result) {
      setResult(answer.result);
      setTicked(new Set());
      router.refresh();
    }
  };

  return (
    <div className="space-y-3">
      {chosen.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <span className="text-foreground text-sm font-medium">
            {`${formatCount(chosen.length)} ticked`}
          </span>
          <Button size="sm" disabled={pending} onClick={consolidate}>
            {pending ? "Consolidating…" : "Consolidate"}
          </Button>
          <LinkButton
            size="sm"
            variant="secondary"
            newTab
            href={`/bills/print?bills=${chosen.map((bill) => bill.id).join(",")}`}
          >
            Print
          </LinkButton>
          <Button size="sm" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear
          </Button>
          <FormMessage error={error} size="xs" />
        </Card>
      )}

      {result && <ConsolidateAnswer result={result} onClose={() => setResult(null)} />}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10">
              <Checkbox
                checked={all}
                indeterminate={chosen.length > 0 && !all}
                onChange={(event) =>
                  setTicked(
                    event.target.checked ? new Set(bills.map((bill) => bill.id)) : new Set(),
                  )
                }
                aria-label="Tick every bill on this page"
              />
            </TableHeaderCell>
            <TableHeaderCell>Reference</TableHeaderCell>
            <TableHeaderCell>Vendor</TableHeaderCell>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Invoice no.</TableHeaderCell>
            <TableHeaderCell>Invoice date</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell></TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bills.map((bill) => (
            <TableRow key={bill.id}>
              <TableCell>
                <Checkbox
                  checked={ticked.has(bill.id)}
                  onChange={(event) => toggle(bill.id, event.target.checked)}
                  aria-label={`Tick ${bill.reference}`}
                />
              </TableCell>
              <TableCell className="text-foreground font-medium">
                {bill.reference}
                {bill.kind === "nmr" && (
                  <span className="text-muted ml-1.5 text-[10px] font-semibold tracking-wider uppercase">
                    No WO
                  </span>
                )}
                {bill.sheet_id && (
                  <Link
                    href={`/bills/sheets/${bill.sheet_id}`}
                    className="text-accent block font-mono text-xs font-normal hover:underline"
                  >
                    {`On ${bill.sheet_reference ?? "a sheet"}`}
                  </Link>
                )}
              </TableCell>
              <TableCell>{bill.vendor_name ?? "Direct"}</TableCell>
              <TableCell>{bill.project_name}</TableCell>
              <TableCell className="font-mono text-xs">{bill.invoice_no}</TableCell>
              <TableCell className="text-muted">{formatDate(bill.invoice_date)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatMoney(bill.total_amount)}
              </TableCell>
              <TableCell>
                <BillStatusBadge status={bill.status} />
              </TableCell>
              <TableCell>
                <Link
                  href={`/bills/${bill.id}`}
                  className="text-accent text-sm font-medium hover:underline"
                >
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {/* Over every bill these filters match, not just this page. */}
        <TableFoot>
          <tr>
            <TableTotalCell colSpan={6}>
              {formatCount(total)} {total === 1 ? "bill" : "bills"}
              <span className="text-muted ml-2 text-xs font-normal">
                Taxable {formatMoney(sums.taxable)} · GST {formatMoney(sums.gst)}
              </span>
            </TableTotalCell>
            <TableTotalCell className="text-right font-mono text-xs">
              {formatMoney(sums.total)}
            </TableTotalCell>
            <TableTotalCell colSpan={2} />
          </tr>
        </TableFoot>
      </Table>
    </div>
  );
}

function ConsolidateAnswer({
  result,
  onClose,
}: {
  result: ConsolidateResult;
  onClose: () => void;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground text-[15px] font-semibold tracking-tight">
          {result.sheets.length === 0
            ? "Nothing was consolidated"
            : `On ${formatCount(result.sheets.length)} ${result.sheets.length === 1 ? "sheet" : "sheets"}`}
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {result.sheets.length > 0 && (
        <ul className="space-y-1 text-sm">
          {result.sheets.map((sheet) => (
            <li key={sheet.id}>
              <Link
                href={`/bills/sheets/${sheet.id}`}
                className="text-accent font-mono font-medium hover:underline"
              >
                {sheet.reference}
              </Link>
              <span className="text-muted">
                {` — ${formatCount(sheet.added)} ${sheet.added === 1 ? "bill" : "bills"} put on`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.skipped.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Left out</p>
          <ul className="space-y-1 text-sm">
            {result.skipped.map((bill) => (
              <li key={bill.id}>
                <span className="text-foreground font-mono">{bill.reference ?? "A bill"}</span>
                <span className="text-muted">{` — ${bill.reason}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
