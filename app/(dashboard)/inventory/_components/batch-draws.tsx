import { formatMoney, formatQuantity } from "@/lib/format";
import type { BatchDraw } from "@/lib/inventory/batches";
import { BatchId } from "./batch-id";

/** Shared by the issue note and the issue form's preview, so what the keeper saw before Save is what the note shows. */
export function BatchDraws({ draws, uom }: { draws: BatchDraw[]; uom: string }) {
  if (draws.length === 0) return <span className="text-muted/50 text-sm">—</span>;
  return (
    <ul className="space-y-1 text-xs">
      {draws.map((draw) => (
        <li key={draw.receiptLineId ?? "no-batch"} className="text-foreground">
          {formatQuantity(draw.quantity)} {uom}{" "}
          {draw.receiptLineId ? (
            <>
              from <BatchId label={draw.label} size="md" /> at{" "}
              {formatMoney(draw.rate, { paise: true })}
            </>
          ) : (
            <span className="text-muted">from stock older than batches — no rate</span>
          )}
        </li>
      ))}
    </ul>
  );
}
