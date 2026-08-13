/**
 * The table half of a report — a Server Component, pure props in.
 *
 * Detail view: the chosen columns, sorted, cut to the spec's limit,
 * with an honest "showing N of M" from the database's exact count.
 * Grouped view: one row per group, subtotals per outer group when the
 * grouping is two-level, and a grand total row over every matched line
 * — computed over the COMPLETE set, never the visible rows.
 */
import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { GroupRow, ReportResult, ReportValue } from "@/lib/reporter/aggregate";
import { DATASETS, type FieldType } from "@/lib/reporter/datasets";
import { measureId, type ReportSpec } from "@/lib/reporter/spec";

import { measureLabel } from "@/lib/reporter/labels";

function formatValue(type: FieldType, value: ReportValue): string {
  if (value === null) return "—";
  switch (type) {
    case "money":
      return typeof value === "number" ? formatMoney(value) : String(value);
    case "number":
      return typeof value === "number" ? formatQuantity(value) : String(value);
    case "date":
      return formatDate(String(value));
    case "bool":
      return value === true ? "Yes" : "No";
    case "text":
      return String(value);
  }
}

/** A measure's cell: count aggregates are plain counts whatever the field. */
function formatMeasure(type: FieldType, agg: string, value: number | null): string {
  if (value === null) return "—";
  if (agg === "count" || agg === "count_distinct") return formatCount(value);
  if (type === "money") return formatMoney(value);
  return formatQuantity(value);
}

const numericTypes: FieldType[] = ["number", "money"];

// Sticky inside the scrolling wrapper; the inset shadow stands in for
// the header border, which border-collapse would scroll away.
const stickyHeader = "sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_0_var(--border)]";

export function ReportTable({ spec, result }: { spec: ReportSpec; result: ReportResult }) {
  const dataset = DATASETS[spec.dataset];

  if (result.matched === 0) {
    return (
      <p className="text-muted px-1 text-sm">
        Nothing matches this report. Loosen a filter or widen the date range.
      </p>
    );
  }

  if (result.groups) {
    return <GroupedTable spec={spec} result={result} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-muted px-1 text-xs">
        {result.truncated
          ? `Showing the first ${formatCount(result.detail.length)} of ${formatCount(result.matched)} lines.`
          : `${formatCount(result.matched)} lines.`}
      </p>
      <Table containerClassName="max-h-[70vh] overflow-auto">
        <TableHead>
          <TableRow>
            {result.columns.map((column) => {
              const field = dataset.fields[column];
              return (
                <TableHeaderCell
                  key={column}
                  className={`${stickyHeader} ${numericTypes.includes(field.type) ? "text-right" : ""}`}
                >
                  {field.label}
                </TableHeaderCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {result.detail.map((row, index) => (
            <TableRow key={index}>
              {result.columns.map((column) => {
                const field = dataset.fields[column];
                const numeric = numericTypes.includes(field.type);
                return (
                  <TableCell
                    key={column}
                    className={numeric ? "text-right font-mono text-xs tabular-nums" : ""}
                  >
                    {formatValue(field.type, row[column] ?? null)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupedTable({ spec, result }: { spec: ReportSpec; result: ReportResult }) {
  const dataset = DATASETS[spec.dataset];
  const twoLevel = spec.groupBy.length === 2;
  const measures = spec.measures;

  const measureCell = (values: Record<string, number | null>, extra = "") =>
    spec.measures.map((measure) => {
      const field = dataset.fields[measure.field];
      return (
        <TableCell
          key={measureId(measure)}
          className={`text-right font-mono text-xs tabular-nums ${extra}`}
        >
          {formatMeasure(field.type, measure.agg, values[measureId(measure)] ?? null)}
        </TableCell>
      );
    });

  const renderGroup = (group: GroupRow): ReactNode[] => {
    const outerKey = String(group.keys[0]);
    const rows: ReactNode[] = [
      <TableRow
        key={`group:${outerKey}`}
        className={twoLevel ? "bg-black/[0.02] dark:bg-white/[0.03]" : ""}
      >
        <TableCell className="font-medium">
          {formatValue(dataset.fields[spec.groupBy[0]].type, group.keys[0])}
        </TableCell>
        {twoLevel && <TableCell className="text-muted text-xs">All</TableCell>}
        <TableCell className="text-muted text-right font-mono text-xs tabular-nums">
          {formatCount(group.rowCount)}
        </TableCell>
        {measureCell(group.measures, twoLevel ? "font-medium" : "")}
      </TableRow>,
    ];
    for (const child of group.children ?? []) {
      rows.push(
        <TableRow key={`child:${outerKey}:${String(child.keys[1])}`}>
          <TableCell />
          <TableCell>{formatValue(dataset.fields[spec.groupBy[1]].type, child.keys[1])}</TableCell>
          <TableCell className="text-muted text-right font-mono text-xs tabular-nums">
            {formatCount(child.rowCount)}
          </TableCell>
          {measureCell(child.measures)}
        </TableRow>,
      );
    }
    return rows;
  };

  return (
    <div className="space-y-2">
      <p className="text-muted px-1 text-xs">
        {formatCount(result.matched)} lines in {formatCount(result.groups?.length ?? 0)} groups.
      </p>
      <Table containerClassName="max-h-[70vh] overflow-auto">
        <TableHead>
          <TableRow>
            <TableHeaderCell className={stickyHeader}>
              {dataset.fields[spec.groupBy[0]].label}
            </TableHeaderCell>
            {twoLevel && (
              <TableHeaderCell className={stickyHeader}>
                {dataset.fields[spec.groupBy[1]].label}
              </TableHeaderCell>
            )}
            <TableHeaderCell className={`${stickyHeader} text-right`}>Lines</TableHeaderCell>
            {measures.map((measure) => (
              <TableHeaderCell key={measureId(measure)} className={`${stickyHeader} text-right`}>
                {measureLabel(dataset.fields[measure.field].label, measure.agg)}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {(result.groups ?? []).flatMap(renderGroup)}
          <TableRow className="border-border border-t-2">
            <TableCell className="font-semibold">All lines</TableCell>
            {twoLevel && <TableCell />}
            <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
              {formatCount(result.matched)}
            </TableCell>
            {spec.measures.map((measure) => {
              const field = dataset.fields[measure.field];
              return (
                <TableCell
                  key={measureId(measure)}
                  className="text-right font-mono text-xs font-semibold tabular-nums"
                >
                  {formatMeasure(
                    field.type,
                    measure.agg,
                    result.totals[measureId(measure)] ?? null,
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
