import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { BillLineRow } from "@/lib/bills/line-queries";
import { billLineMoney } from "@/lib/bills/math";
import {
  groupByVilla,
  spansProjects,
  villaLabel,
  villaOfLine,
  type LineVillas,
} from "@/lib/bills/villas";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { Fragment } from "react";

const moneyOf = (line: BillLineRow) =>
  billLineMoney({
    quantity: line.quantity,
    rate: line.rate,
    gst_pct: line.gst_pct,
    discount_amount: line.discount_amount,
    other_charges: line.other_charges,
  });

/** A contractor's bill across villas groups its lines by villa, each with its subtotal. */
export function BillLinesTable({ lines, villas }: { lines: BillLineRow[]; villas?: LineVillas }) {
  const groups = villas
    ? groupByVilla(
        lines,
        (line) => villaOfLine(line.villa, villas.bill),
        (line) => moneyOf(line)?.total ?? 0,
      )
    : [];
  const withProject = spansProjects(groups.map((group) => group.villa));
  const sections =
    villas && groups.length > 1
      ? groups.map((group) => ({
          key: group.key,
          label: villaLabel(group.villa, villas, withProject),
          group,
        }))
      : [{ key: "all", label: null, group: { lines, total: 0 } }];

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Line</TableHeaderCell>
          <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
          <TableHeaderCell className="text-right">Rate</TableHeaderCell>
          <TableHeaderCell className="text-right">GST</TableHeaderCell>
          <TableHeaderCell className="text-right">Discount</TableHeaderCell>
          <TableHeaderCell className="text-right">Other</TableHeaderCell>
          <TableHeaderCell className="text-right">Amount</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sections.map((section) => (
          <Fragment key={section.key}>
            {section.label && (
              <TableRow>
                <TableCell colSpan={6} className="text-foreground font-semibold">
                  {section.label}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatMoney(section.group.total, { paise: true })}
                </TableCell>
              </TableRow>
            )}
            {section.group.lines.map((line) => {
              const money = moneyOf(line);
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="text-foreground font-medium">{line.description}</span>
                    {line.work_label && <div className="text-muted text-xs">{line.work_label}</div>}
                    {line.note && <div className="text-muted text-xs">{line.note}</div>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {line.quantity === null
                      ? "Lump sum"
                      : `${formatQuantity(line.quantity)} ${line.uom ?? ""}`}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(line.rate, { paise: true })}
                  </TableCell>
                  <TableCell className="text-muted text-right">
                    {formatPercent(line.gst_pct)}
                  </TableCell>
                  <TableCell className="text-muted text-right font-mono">
                    {line.discount_amount
                      ? formatMoney(line.discount_amount, { paise: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted text-right font-mono">
                    {line.other_charges ? formatMoney(line.other_charges, { paise: true }) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(money?.total, { paise: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
