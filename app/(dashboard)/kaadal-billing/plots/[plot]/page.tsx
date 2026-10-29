import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { HealthPill } from "@/components/ui/health-pill";
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
import { formatMoney } from "@/lib/format";
import { plotState, plotTotals, rupees, shortPlot } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailHead } from "../../_components/parts";

export default async function PlotPage({ params }: { params: Promise<{ plot: string }> }) {
  let plot: string;
  try {
    plot = decodeURIComponent((await params).plot);
  } catch {
    notFound();
  }
  const ledger = await getLedger();
  const t = plotTotals(ledger).find((x) => x.plot === plot);
  const back = { href: "/kaadal-billing/plots", label: "Plots" };
  if (!t) {
    return (
      <div className="space-y-4">
        <DetailHead title={plot} back={back} />
        <EmptyState title="No orders on this plot" />
      </div>
    );
  }
  const state = plotState(t);
  const vendorName = new Map(ledger.vendors.map((v) => [v.id, v.name]));
  const rows = t.rows.slice().sort((a, b) => b.share.balance - a.share.balance);

  return (
    <div className="space-y-4">
      <DetailHead
        title={<span className="font-mono font-bold tracking-tight">{plot}</span>}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <HealthPill label={state.label} tone={state.tone} />
            {t.vendors} vendor{t.vendors === 1 ? "" : "s"} · {t.rows.length} order
            {t.rows.length === 1 ? "" : "s"}
          </span>
        }
        back={back}
        actions={
          <LinkButton
            href={`/kaadal-billing/orders?plot=${encodeURIComponent(plot)}`}
            variant="secondary"
          >
            Show this plot&apos;s orders
          </LinkButton>
        }
      />
      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure size="lg" label="Order value" value={formatMoney(t.net)} />
        </FigureBandCell>
        <FigureBandCell>
          <Figure size="lg" label="Paid" value={formatMoney(t.paid)} />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            size="lg"
            label="Balance"
            value={t.balance > 0.5 ? formatMoney(t.balance) : "Paid"}
            tone={t.balance > 0.5 ? "bad" : "good"}
            hint={t.deduction > 0 ? `Deductions on this plot ${rupees(t.deduction)}` : undefined}
          />
        </FigureBandCell>
      </FigureBand>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Vendor</TableHeaderCell>
            <TableHeaderCell className="text-right">Value</TableHeaderCell>
            <TableHeaderCell className="text-right">Paid</TableHeaderCell>
            <TableHeaderCell className="text-right">Balance</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {rows.map(({ order, share }) => (
            <TableRow key={order.id}>
              <TableCell>
                <Link
                  href={`/kaadal-billing/orders/${order.id}`}
                  className="text-accent font-medium hover:underline"
                >
                  {vendorName.get(order.vendorId) ?? "Unknown vendor"}
                </Link>
                {order.item ? <p className="text-muted text-xs">{order.item}</p> : null}
                {order.plots.length > 1 ? (
                  <p className="text-muted text-xs">
                    Share of {order.plots.map(shortPlot).join(" + ")}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap">
                {rupees(share.net)}
              </TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap">
                {rupees(share.paid)}
              </TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap">
                {Math.abs(share.balance) < 0.5 ? (
                  <HealthPill label="Paid" tone="success" />
                ) : (
                  rupees(share.balance)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFoot>
          <tr>
            <TableTotalCell>Total</TableTotalCell>
            <TableTotalCell className="text-right font-mono">{rupees(t.net)}</TableTotalCell>
            <TableTotalCell className="text-right font-mono">{rupees(t.paid)}</TableTotalCell>
            <TableTotalCell className="text-right font-mono">{rupees(t.balance)}</TableTotalCell>
          </tr>
        </TableFoot>
      </Table>
      <p className="text-muted text-xs">
        Orders shared between plots are split by each plot&apos;s value from the quote. A payment
        marked for one plot counts only for that plot.
      </p>
    </div>
  );
}
