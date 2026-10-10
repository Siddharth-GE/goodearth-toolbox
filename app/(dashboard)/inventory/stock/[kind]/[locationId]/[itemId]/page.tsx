import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { Batch } from "@/lib/inventory/batches";
import {
  getItemMovements,
  isLocationKind,
  listStoreBatches,
  type MovementRow,
} from "@/lib/inventory/stock-queries";
import { History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const KIND_LABEL: Record<MovementRow["kind"], string> = {
  receipt: "Received",
  issue: "Issued",
  transfer_in: "Arrived",
  adjustment: "Adjusted",
};

const KIND_VARIANT: Record<MovementRow["kind"], "success" | "warning" | "info"> = {
  receipt: "success",
  issue: "warning",
  transfer_in: "info",
  adjustment: "info",
};

/** Why the number is what it is: every movement of one item at one
 * location, newest first, adding up to the figure shown above them. */
export default async function ItemHistoryPage({
  params,
}: {
  params: Promise<{ kind: string; locationId: string; itemId: string }>;
}) {
  const { kind, locationId, itemId } = await params;
  if (!isLocationKind(kind)) notFound();

  const [history, batchesByItem] = await Promise.all([
    getItemMovements(kind, locationId, itemId),
    kind === "store"
      ? listStoreBatches(locationId, itemId)
      : Promise.resolve<Record<string, Batch[]>>({}),
  ]);
  if (!history) notFound();

  const isStore = history.location_kind === "store";
  const batches = batchesByItem[itemId] ?? [];

  return (
    <div className="space-y-4">
      <PageTitle
        title={history.item_name}
        description={`${history.location_name}${history.item_code ? ` · ${history.item_code}` : ""}`}
        backHref="/inventory/stock"
        backLabel="Stock"
        actions={
          <div className="flex items-center gap-3">
            <ItemThumb
              code={history.item_code}
              name={history.item_name}
              thumbUrl={history.item_thumb_url}
              sizes="48px"
              className="w-10"
            />
            <div className="text-right">
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                {isStore ? "On hand" : "Delivered here"}
              </p>
              <p className="text-foreground text-lg font-bold tracking-tight">
                {formatQuantity(history.balance)}
              </p>
            </div>
          </div>
        }
      />

      {!isStore && (
        <p className="text-muted text-sm">
          Material at a site is used where it lands, so nothing is ever issued back out of here —
          this is the running total of everything delivered.
        </p>
      )}

      {batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Batches in this store
          </h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Batch</TableHeaderCell>
                <TableHeaderCell className="w-32">Received</TableHeaderCell>
                <TableHeaderCell className="w-32">Left</TableHeaderCell>
                <TableHeaderCell className="w-36 text-right">Rate</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.receiptLineId}>
                  <TableCell className="font-mono">{batch.label}</TableCell>
                  <TableCell className="text-muted">{formatDate(batch.receivedAt)}</TableCell>
                  <TableCell>{formatQuantity(batch.quantity)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(batch.rate, { paise: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted text-xs">
            Each delivery into this store is a batch. An issue takes the oldest first unless the
            store-keeper picks another; stock older than batches has no rate and goes last.
          </p>
        </section>
      )}

      {history.movements.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing has moved yet"
          description={
            isStore
              ? "This store has never received or issued this item."
              : "Nothing of this item has been delivered here."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-32">Date</TableHeaderCell>
              <TableHeaderCell className="w-36">What happened</TableHeaderCell>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell>From / to</TableHeaderCell>
              <TableHeaderCell className="w-32">Change</TableHeaderCell>
              <TableHeaderCell className="w-16">By</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.movements.map((movement) => (
              <TableRow key={`${movement.kind}:${movement.id}`}>
                <TableCell className="text-muted">{formatDate(movement.at)}</TableCell>
                <TableCell>
                  <Badge variant={KIND_VARIANT[movement.kind]}>{KIND_LABEL[movement.kind]}</Badge>
                </TableCell>
                <TableCell className="text-foreground font-medium">
                  {movement.href ? (
                    <Link href={movement.href} className="text-accent hover:underline">
                      {movement.reference}
                    </Link>
                  ) : (
                    movement.reference
                  )}
                </TableCell>
                <TableCell className="text-muted">{movement.counterparty}</TableCell>
                <TableCell
                  className={
                    movement.quantity < 0
                      ? "text-warning font-medium"
                      : "text-foreground font-medium"
                  }
                >
                  {movement.quantity > 0 ? "+" : "−"}
                  {formatQuantity(Math.abs(movement.quantity))} {movement.uom}
                </TableCell>
                <TableCell>
                  <Attribution name={movement.actor_name} label="Recorded by" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
