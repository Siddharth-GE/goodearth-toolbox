import { Attribution } from "@/components/ui/attribution";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import type { PoReceiptRow } from "@/lib/inventory/queries";
import Link from "next/link";

/**
 * What has actually arrived against this order. Read from Inventory's
 * tables, which carry no money at all — this is the PO holder's own
 * screen asking "did it turn up?".
 */
export function ReceiptsSection({ receipts }: { receipts: PoReceiptRow[] }) {
  if (receipts.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">Deliveries</h2>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Delivery note</TableHeaderCell>
            <TableHeaderCell>Went to</TableHeaderCell>
            <TableHeaderCell>Challan</TableHeaderCell>
            <TableHeaderCell>Received</TableHeaderCell>
            <TableHeaderCell>What arrived</TableHeaderCell>
            <TableHeaderCell className="w-16">By</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {receipts.map((receipt) => (
            <TableRow key={receipt.id}>
              <TableCell>
                <Link
                  href={`/inventory/receipts/${receipt.id}`}
                  className="text-accent font-medium hover:underline"
                >
                  {receipt.reference}
                </Link>
              </TableCell>
              <TableCell className="text-muted">{receipt.destination}</TableCell>
              <TableCell className="text-muted">{receipt.challan_no ?? "—"}</TableCell>
              <TableCell className="text-muted">{formatDate(receipt.received_at)}</TableCell>
              <TableCell className="text-muted">
                {receipt.lines
                  .map((line) => `${line.item_name} ${formatQuantity(line.quantity)} ${line.uom}`)
                  .join(", ")}
              </TableCell>
              <TableCell>
                <Attribution name={receipt.received_by_name} label="Received by" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
