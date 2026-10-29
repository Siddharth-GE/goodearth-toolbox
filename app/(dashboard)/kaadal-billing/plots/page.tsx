import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure } from "@/components/ui/figure";
import { HealthPill } from "@/components/ui/health-pill";
import { formatCrore, formatPercent } from "@/lib/format";
import { plotState, plotTotals, shortPlot, totals } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import Link from "next/link";
import { PaidBar, TotalsBand } from "../_components/parts";

export default async function PlotsPage() {
  const ledger = await getLedger();
  const plots = plotTotals(ledger);

  return (
    <div className="space-y-4">
      <TotalsBand totals={totals(ledger, "All")} scope="All plots" />
      {plots.length === 0 ? (
        <EmptyState title="No plots yet" description="Plots appear here once an order names one." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plots.map((t) => {
            const state = plotState(t);
            const pct = t.net ? Math.min(100, (t.paid / t.net) * 100) : 0;
            return (
              <Card key={t.plot} interactive className="relative space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Link
                    href={`/kaadal-billing/plots/${encodeURIComponent(t.plot)}`}
                    className="focus-visible:ring-accent/25 rounded-lg after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
                  >
                    <span className="text-muted block text-[11px] font-medium tracking-[0.14em] uppercase">
                      {t.plot.startsWith("Plot") ? "Plot" : "Area"}
                    </span>
                    <span className="text-foreground font-mono text-2xl font-bold tracking-tight">
                      {shortPlot(t.plot)}
                    </span>
                  </Link>
                  <span className="ml-auto">
                    <HealthPill label={state.label} tone={state.tone} />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Figure label="Value" value={formatCrore(t.net)} />
                  <Figure label="Paid" value={formatCrore(t.paid)} />
                  <Figure
                    label="Due"
                    value={formatCrore(t.balance)}
                    tone={t.balance > 0.5 ? "bad" : undefined}
                  />
                </div>
                <PaidBar kaadal={t.paid} client={0} total={t.net} done={state.tone === "success"} />
                <div className="text-muted flex justify-between text-xs tabular-nums">
                  <span>
                    {t.vendors} vendor{t.vendors === 1 ? "" : "s"} · {t.rows.length} order
                    {t.rows.length === 1 ? "" : "s"}
                  </span>
                  <span>{formatPercent(Math.round(pct))} paid</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
