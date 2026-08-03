import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import { getGoodsReceipt } from "@/lib/inventory/queries";
import { notFound } from "next/navigation";

export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const receipt = await getGoodsReceipt(receiptId);
  if (!receipt) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={receipt.reference}
        description={`Received against ${receipt.po_reference} · ${receipt.project_name}`}
        backHref="/inventory"
        backLabel="Inventory"
        actions={
          <Badge variant={receipt.to_site ? "info" : "success"}>{receipt.destination}</Badge>
        }
      />

      <section className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-4">
        <Field label="Challan no." value={receipt.challan_no ?? "—"} />
        <Field label="Received on" value={formatDate(receipt.received_at)} />
        <Field label="Went to" value={receipt.destination} />
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Received by</p>
          <div className="mt-1 flex items-center gap-2">
            <Attribution name={receipt.received_by_name} label="Received by" />
            <span className="text-foreground truncate text-sm">
              {receipt.received_by_name ?? "—"}
            </span>
          </div>
        </div>
        {receipt.note && (
          <div className="sm:col-span-4">
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">Note</p>
            <p className="text-foreground mt-1 text-sm">{receipt.note}</p>
          </div>
        )}
      </section>

      {receipt.to_site && (
        <p className="text-muted text-sm">
          These goods were unloaded at site and are used where they landed — they count toward the
          purchase order but never entered store stock.
        </p>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-14"></TableHeaderCell>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell className="w-32">Quantity</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
            <TableHeaderCell className="w-16">By</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {receipt.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <ItemThumb
                  code={line.item_code}
                  name={line.item_name}
                  thumbUrl={line.item_thumb_url}
                  sizes="48px"
                  className="w-10"
                />
              </TableCell>
              <TableCell>
                <span className="text-foreground font-medium">{line.item_name}</span>
                <div className="text-muted text-xs">
                  {line.item_code ?? "—"}
                  {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
                </div>
              </TableCell>
              <TableCell className="text-foreground">
                {formatQuantity(line.quantity)} {line.uom}
              </TableCell>
              <TableCell className="text-muted">{line.note ?? "—"}</TableCell>
              <TableCell>
                <Attribution name={line.recorded_by_name} label="Recorded by" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted text-xs">
        A delivery note is a record of something that happened, so it cannot be deleted or its
        quantities rewritten. If a count was wrong, correct it with a stock adjustment — that keeps
        the reason visible.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground mt-1 truncate text-sm">{value}</p>
    </div>
  );
}
