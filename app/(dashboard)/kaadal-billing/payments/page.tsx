import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatMonthMark, formatShortDate } from "@/lib/format";
import {
  allocLabel,
  allocOf,
  amountIn,
  inPlot,
  orderLabel,
  paymentsByOrder,
  rupees,
  totals,
} from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import Link from "next/link";
import { PlotScope, TotalsBand, withParams } from "../_components/parts";
import { scopeOf } from "../_components/scope";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const ledger = await getLedger();
  const { plots, plot, q } = scopeOf(ledger, raw);
  const kept = { plot: plot === "All" ? undefined : plot, q: q || undefined };
  const orders = new Map(ledger.orders.map((o) => [o.id, o]));
  const vendorName = new Map(ledger.vendors.map((v) => [v.id, v.name]));
  const pays = paymentsByOrder(ledger.payments);

  const rows = ledger.payments
    .filter((p) => {
      const o = orders.get(p.orderId);
      if (!o || !inPlot(o, plot)) return false;
      if (!q) return true;
      return [
        vendorName.get(o.vendorId),
        o.item,
        o.plots.join(" "),
        p.kind,
        p.paidBy,
        p.reference,
        p.notes,
        allocLabel(p),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase());
    })
    .sort(
      (a, b) =>
        (b.paidOn ?? "").localeCompare(a.paidOn ?? "") || b.createdAt.localeCompare(a.createdAt),
    );

  const months = new Map<string, typeof rows>();
  for (const p of rows) {
    const key = p.paidOn ? p.paidOn.slice(0, 7) : "none";
    months.set(key, [...(months.get(key) ?? []), p]);
  }
  const keys = [...months.keys()].sort((a, b) =>
    a === "none" ? 1 : b === "none" ? -1 : b.localeCompare(a),
  );

  return (
    <div className="space-y-4">
      <TotalsBand totals={totals(ledger, plot)} scope={plot === "All" ? "All plots" : plot} />
      <PlotScope
        plots={plots}
        current={plot}
        href={(p) =>
          withParams("/kaadal-billing/payments", kept, { plot: p === "All" ? undefined : p })
        }
      />
      <ListToolbar
        action="/kaadal-billing/payments"
        values={{ q }}
        keep={{ plot: kept.plot }}
        search={{ placeholder: "Vendor, item, plot, type or reference" }}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : "No payments recorded"}
          description="Open an order and use Record payment to log one."
        />
      ) : (
        keys.map((key) => {
          const list = months.get(key)!;
          const sum = list.reduce(
            (s, p) => s + amountIn(p, orders.get(p.orderId)!, pays.get(p.orderId) ?? [], plot),
            0,
          );
          return (
            <section key={key} className="space-y-2">
              <SectionHead
                title={key === "none" ? "No date entered" : formatMonthMark(`${key}-01`)}
                count={list.length}
                hint={`${formatMoney(sum)}${plot !== "All" ? ` for ${plot}` : ""}`}
              />
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Vendor</TableHeaderCell>
                    <TableHeaderCell className="max-sm:hidden">Type</TableHeaderCell>
                    <TableHeaderCell className="max-sm:hidden">Paid by</TableHeaderCell>
                    <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {list.map((p) => {
                    const o = orders.get(p.orderId)!;
                    const part = amountIn(p, o, pays.get(o.id) ?? [], plot);
                    const href = `/kaadal-billing/orders/${o.id}?payment=${p.id}`;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {p.paidOn ? formatShortDate(p.paidOn) : "—"}
                        </TableCell>
                        <TableCell className="min-w-0">
                          <Link href={href} className="text-foreground font-medium hover:underline">
                            {vendorName.get(o.vendorId) ?? "Unknown vendor"}
                          </Link>
                          <p className="text-muted text-xs">
                            {orderLabel(o)}
                            {o.plots.length > 1 && allocOf(p) ? ` · ${allocLabel(p)}` : ""}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="max-sm:hidden">
                          <Pill>{p.kind}</Pill>
                        </TableCell>
                        <TableCell className="max-sm:hidden">
                          <Pill tone={p.paidBy === "Client" ? "plain" : "ink"}>{p.paidBy}</Pill>
                        </TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">
                          {rupees(part)}
                          {part !== p.amount ? (
                            <span className="text-muted block font-sans text-xs">
                              of {rupees(p.amount)}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          );
        })
      )}
    </div>
  );
}
