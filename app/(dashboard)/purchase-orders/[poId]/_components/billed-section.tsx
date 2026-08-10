import { formatCount, formatMoney } from "@/lib/format";
import type { PoBilledTotals } from "@/lib/purchase-orders/queries";

/**
 * What the vendor has invoiced against this order — the accounts-side
 * mirror of ReceiptsSection's "did it turn up?". One ordered total, one
 * billed total, from the po_billing_totals window (migration 0025);
 * the bills themselves live in the Bills tool.
 */
export function BilledSection({ totals }: { totals: PoBilledTotals }) {
  if (totals.bill_count === 0) return null;

  const over = totals.billed_total > totals.ordered_total;

  return (
    <section className="space-y-2">
      <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">Billing</h2>
      <div className="border-border bg-surface rounded-2xl border p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">Ordered</p>
            <p className="text-foreground mt-1 font-mono text-sm">
              {formatMoney(totals.ordered_total)}
            </p>
          </div>
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">Billed</p>
            <p className="text-foreground mt-1 font-mono text-sm">
              {formatMoney(totals.billed_total)}
            </p>
          </div>
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">Bills</p>
            <p className="text-foreground mt-1 font-mono text-sm">
              {formatCount(totals.bill_count)}
            </p>
          </div>
        </div>
        {over && (
          <p className="text-warning mt-3 text-xs font-medium" role="alert">
            Billed past the order&apos;s value — deliberate over-billing is allowed, but worth a
            look.
          </p>
        )}
      </div>
    </section>
  );
}
