"use client";

import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { MonthlySeries, ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

/**
 * The money, month by month — where it comes from, where it goes, and
 * what the balance does.
 *
 * Quarterly by default. Seventy-two monthly columns is a table nobody
 * reads; twenty-four quarters fits the shape of the thing (a dip, a
 * recovery) on one screen, and monthly is a switch away for the month a
 * particular payment lands.
 *
 * Buckets SUM their months, except the balance rows, which take the LAST
 * month of the bucket — averaging a closing balance would be meaningless
 * and summing it absurd. The trough figure quoted underneath is always
 * the true monthly one, so a quarterly view can never hide the worst
 * month inside a bucket.
 */

type Grain = "month" | "quarter" | "year";

const GRAIN_SIZE: Record<Grain, number> = { month: 1, quarter: 3, year: 12 };
const GRAIN_PREFIX: Record<Grain, string> = { month: "M", quarter: "Q", year: "Y" };

export function CashflowTable({ result }: { result: ScenarioResult }) {
  const [grain, setGrain] = useState<Grain>("quarter");
  const [lineId, setLineId] = useState<string>("all");

  const series: MonthlySeries =
    lineId === "all"
      ? result.monthly
      : (result.lines.find((line) => line.id === lineId)?.monthly ?? result.monthly);

  const buckets = useMemo(() => bucketise(series, GRAIN_SIZE[grain]), [series, grain]);
  const showPlanRows = lineId === "all";

  if (buckets.length === 0) {
    return <p className="text-muted text-sm">Add a line and the cashflow appears here.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Time grain"
          value={grain}
          onChange={(event) => setGrain(event.target.value as Grain)}
          className="h-9 w-auto"
        >
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
          <option value="year">Yearly</option>
        </Select>
        <Select
          aria-label="Which line"
          value={lineId}
          onChange={(event) => setLineId(event.target.value)}
          className="h-9 w-auto"
        >
          <option value="all">All lines, consolidated</option>
          {result.lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name || "Untitled line"}
            </option>
          ))}
        </Select>
        {!showPlanRows ? (
          <p className="text-muted text-xs">
            One line on its own: no overheads, no shared infrastructure, and no equity behind it.
          </p>
        ) : null}
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="bg-surface sticky left-0">
              {grain === "month" ? "Month" : grain === "quarter" ? "Quarter" : "Year"}
            </TableHeaderCell>
            {buckets.map((bucket) => (
              <TableHeaderCell key={bucket.label} className="text-right font-mono">
                {GRAIN_PREFIX[grain]}
                {bucket.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <Row label="Collections" values={buckets.map((b) => b.collections)} tone="in" />
          <Row label="Land" values={buckets.map((b) => -b.land)} />
          <Row label="Development" values={buckets.map((b) => -b.development)} />
          <Row label="Construction" values={buckets.map((b) => -b.construction)} />
          {showPlanRows ? (
            <>
              <Row label="Overheads" values={buckets.map((b) => -b.overheads)} />
              <Row label="Common infra" values={buckets.map((b) => -b.commonInfra)} />
            </>
          ) : null}
          <Row label="Interest" values={buckets.map((b) => -b.interest)} />
          <Row label="Net" values={buckets.map((b) => b.net - b.interest)} strong />
          <Row label="Closing cash" values={buckets.map((b) => b.closing)} strong signed />
          <Row label="Borrowed" values={buckets.map((b) => b.revolver)} />
        </TableBody>
      </Table>

      <p className="text-muted text-xs">
        Balances are the last month of each {grain === "month" ? "month" : "period"}; everything
        else is the total. The true monthly trough is{" "}
        <span className="text-foreground font-mono">{formatCrore(result.cashTrough)}</span>
        {result.peakFunding > 0 ? (
          <>
            , and the most ever borrowed is{" "}
            <span className="text-warning font-mono">{formatCrore(result.peakFunding)}</span>.
          </>
        ) : (
          <> — the balance never goes below zero, so nothing is ever borrowed.</>
        )}
      </p>
    </div>
  );
}

type Bucket = {
  label: string;
  collections: number;
  land: number;
  development: number;
  construction: number;
  overheads: number;
  commonInfra: number;
  interest: number;
  net: number;
  /** Last month of the bucket, not a sum. */
  closing: number;
  revolver: number;
};

function bucketise(series: MonthlySeries, size: number): Bucket[] {
  const months = series.collections.length;
  const buckets: Bucket[] = [];

  for (let start = 0; start < months; start += size) {
    const end = Math.min(start + size, months);
    const bucket: Bucket = {
      label: String(Math.floor(start / size) + 1),
      collections: 0,
      land: 0,
      development: 0,
      construction: 0,
      overheads: 0,
      commonInfra: 0,
      interest: 0,
      net: 0,
      closing: series.closing[end - 1],
      // The worst point inside the bucket, not the last — a quarter that
      // dipped and recovered still had to be funded through the dip.
      revolver: Math.max(...series.revolver.slice(start, end)),
    };
    for (let m = start; m < end; m += 1) {
      bucket.collections += series.collections[m];
      bucket.land += series.land[m];
      bucket.development += series.development[m];
      bucket.construction += series.construction[m];
      bucket.overheads += series.overheads[m];
      bucket.commonInfra += series.commonInfra[m];
      bucket.interest += series.interest[m];
      bucket.net += series.net[m];
    }
    buckets.push(bucket);
  }

  return buckets;
}

function Row({
  label,
  values,
  strong,
  tone,
  signed,
}: {
  label: string;
  values: number[];
  strong?: boolean;
  tone?: "in";
  /** Colour a negative balance as a warning; ordinary outflows aren't. */
  signed?: boolean;
}) {
  // A row of nothing is noise on a table this wide.
  if (values.every((value) => Math.abs(value) < 0.5)) return null;

  return (
    <TableRow>
      <TableCell
        className={cn(
          "bg-surface sticky left-0 whitespace-nowrap",
          strong ? "text-foreground font-semibold" : "text-muted",
        )}
      >
        {label}
      </TableCell>
      {values.map((value, index) => (
        <TableCell
          key={index}
          className={cn(
            "text-right font-mono whitespace-nowrap",
            strong && "font-semibold",
            tone === "in" && "text-success",
            signed && value < 0 && "text-danger",
          )}
        >
          {Math.abs(value) < 0.5 ? "—" : formatCrore(value)}
        </TableCell>
      ))}
    </TableRow>
  );
}
