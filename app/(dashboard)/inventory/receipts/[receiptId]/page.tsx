import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
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
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { getGoodsReceipt } from "@/lib/inventory/receipts-queries";
import { notFound } from "next/navigation";
import { ReceiptRate } from "../../_components/receipt-rate";

export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const receipt = await getGoodsReceipt(receiptId);
  if (!receipt) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={receipt.reference}
        description={`Received against ${receipt.po_reference} · ${receipt.project_name}`}
        backHref="/inventory/receive"
        backLabel="Receive"
        actions={
          <Badge variant={receipt.to_site ? "info" : "success"}>{receipt.destination}</Badge>
        }
      />

      <section className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-4">
        <Field label="Challan no." value={receipt.challan_no ?? "—"} />
        <Field label="Received on" value={formatDate(receipt.received_at)} />
        <Field label="Went to" value={receipt.destination} />
        {receipt.to_site && (
          <Field
            label={`For the work${receipt.work_category ? ` · ${receipt.work_category}` : ""}`}
            value={receipt.work_name ?? "— (before works were recorded)"}
          />
        )}
        <div className="min-w-0">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Received by
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Attribution name={receipt.received_by_name} label="Received by" />
            <span className="text-foreground truncate text-sm">
              {receipt.received_by_name ?? "—"}
            </span>
          </div>
        </div>
        {receipt.note && (
          <div className="sm:col-span-4">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Note</p>
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
            <TableHeaderCell className="w-44">Rate</TableHeaderCell>
            <TableHeaderCell className="w-36 text-right">Amount</TableHeaderCell>
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
                {line.batch_label && (
                  <div className="text-muted mt-0.5 font-mono text-xs">
                    Batch {line.batch_label}
                  </div>
                )}
                {line.bought_for && <div className="text-muted text-xs">For {line.bought_for}</div>}
              </TableCell>
              <TableCell className="text-foreground">
                {formatQuantity(line.quantity)} {line.uom}
              </TableCell>
              <TableCell>
                <ReceiptRate
                  receiptLineId={line.id}
                  itemName={line.item_name}
                  uom={line.uom}
                  rate={line.rate}
                />
              </TableCell>
              <TableCell className="text-right">
                <p className="text-foreground font-mono">
                  {formatMoney(line.amount.total, { paise: true })}
                </p>
                <p className="text-muted text-xs whitespace-nowrap">
                  {formatMoney(line.amount.taxable, { paise: true })} before GST
                </p>
              </TableCell>
              <TableCell className="text-muted">{line.note ?? "—"}</TableCell>
              <TableCell>
                <Attribution name={line.recorded_by_name} label="Recorded by" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFoot>
          <TableRow>
            <TableTotalCell colSpan={4}>Value of this delivery</TableTotalCell>
            <TableTotalCell className="text-right">
              <p className="font-mono">{formatMoney(receipt.totals.total, { paise: true })}</p>
              <p className="text-muted text-xs font-normal whitespace-nowrap">
                {formatMoney(receipt.totals.taxable, { paise: true })} before GST
              </p>
            </TableTotalCell>
            <TableTotalCell colSpan={2}></TableTotalCell>
          </TableRow>
        </TableFoot>
      </Table>

      <p className="text-muted text-xs">
        A delivery note is a record of something that happened, so it cannot be deleted or its
        quantities rewritten. If a count was wrong, correct it with a stock adjustment — that keeps
        the reason visible. Each rate came from the purchase order, net of its discount; change one
        only when the delivery bill differs. Rates are seen only by people with Inventory access.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</p>
      <p className="text-foreground mt-1 truncate text-sm">{value}</p>
    </div>
  );
}
