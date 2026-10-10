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
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";

/** An approved or paid bill's lines, as they stand — no longer editable. */
export function BillLinesTable({ lines }: { lines: BillLineRow[] }) {
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
        {lines.map((line) => {
          const money = billLineMoney({
            quantity: line.quantity,
            rate: line.rate,
            gst_pct: line.gst_pct,
            discount_amount: line.discount_amount,
            other_charges: line.other_charges,
          });
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
              <TableCell className="text-muted text-right">{formatPercent(line.gst_pct)}</TableCell>
              <TableCell className="text-muted text-right font-mono">
                {line.discount_amount ? formatMoney(line.discount_amount, { paise: true }) : "—"}
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
      </TableBody>
    </Table>
  );
}
