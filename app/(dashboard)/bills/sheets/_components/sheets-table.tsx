"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { SheetListRow } from "@/lib/bills/sheet-queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import Link from "next/link";
import { useState } from "react";
import { SheetStateBadge } from "./sheet-state-badge";

/** Sheets with tick boxes for the bulk Print. */
export function SheetsTable({ sheets }: { sheets: SheetListRow[] }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const chosen = sheets.filter((sheet) => ticked.has(sheet.id));
  const all = sheets.length > 0 && chosen.length === sheets.length;

  return (
    <div className="space-y-3">
      {chosen.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <span className="text-foreground text-sm font-medium">
            {`${formatCount(chosen.length)} ticked`}
          </span>
          <LinkButton
            size="sm"
            variant="secondary"
            newTab
            href={`/bills/print?sheets=${chosen.map((sheet) => sheet.id).join(",")}`}
          >
            Print
          </LinkButton>
          <Button size="sm" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear
          </Button>
        </Card>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10">
              <Checkbox
                checked={all}
                indeterminate={chosen.length > 0 && !all}
                onChange={(event) =>
                  setTicked(
                    event.target.checked ? new Set(sheets.map((sheet) => sheet.id)) : new Set(),
                  )
                }
                aria-label="Tick every sheet"
              />
            </TableHeaderCell>
            <TableHeaderCell>Sheet</TableHeaderCell>
            <TableHeaderCell>Contractor</TableHeaderCell>
            <TableHeaderCell>Company</TableHeaderCell>
            <TableHeaderCell className="text-right">Bills</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
            <TableHeaderCell className="text-right">Pending</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sheets.map((sheet) => (
            <TableRow key={sheet.id}>
              <TableCell>
                <Checkbox
                  checked={ticked.has(sheet.id)}
                  onChange={(event) => {
                    const next = new Set(ticked);
                    if (event.target.checked) next.add(sheet.id);
                    else next.delete(sheet.id);
                    setTicked(next);
                  }}
                  aria-label={`Tick ${sheet.reference}`}
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/bills/sheets/${sheet.id}`}
                  className="text-accent font-mono text-sm font-medium hover:underline"
                >
                  {sheet.reference}
                </Link>
                <div className="text-muted text-xs">{formatDate(sheet.created_at)}</div>
              </TableCell>
              <TableCell>{sheet.vendor_name}</TableCell>
              <TableCell className="text-muted">{sheet.company_name}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatCount(sheet.bill_count)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatMoney(sheet.total)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {sheet.state === "undone" ? "—" : formatMoney(sheet.pending)}
              </TableCell>
              <TableCell>
                <SheetStateBadge state={sheet.state} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
