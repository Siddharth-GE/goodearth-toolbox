import { ChartBars } from "@/components/ui/chart/bar-chart";
import { ChartCard } from "@/components/ui/chart/chart-card";
import { ChartStacked } from "@/components/ui/chart/stacked-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import {
  buildInOutModel,
  buildOutflowStackModel,
  lastMonths,
  sumAmounts,
} from "@/lib/financial-management/cashflow";
import { todayInIndia } from "@/lib/format";
import { getCashPosition } from "@/lib/financial-management/queries";
import { formatCount, formatCrore } from "@/lib/format";
import { Wallet } from "lucide-react";

export default async function CashPage() {
  const position = await getCashPosition();

  const inflows = [...position.collections, ...position.drawdowns];
  const outflows = [...position.billsPaid, ...position.repayments, ...position.interestPaid];

  if (inflows.length === 0 && outflows.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nothing to add up yet"
        description="This screen draws from what the other tools record — client receipts in Client Relations, paid bills in Bills — plus the funding ledger here. As soon as any of those hold a rupee, it shows."
      />
    );
  }

  const inTotal = sumAmounts(inflows);
  const outTotal = sumAmounts(outflows);
  const net = inTotal - outTotal;

  const today = todayInIndia();
  const months = lastMonths(today, 12);
  const inOut = buildInOutModel({ inflows, outflows, months });
  const outStack = buildOutflowStackModel({
    streams: [
      { id: "bills", label: "Bills paid", entries: position.billsPaid },
      { id: "repayments", label: "Loan repayments", entries: position.repayments },
      { id: "interest", label: "Interest paid", entries: position.interestPaid },
    ],
    months,
  });

  return (
    <div className="space-y-4">
      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Money in to date"
            value={formatCrore(inTotal)}
            size="hero"
            hint={`Collections ${formatCrore(sumAmounts(position.collections))} · funds drawn ${formatCrore(sumAmounts(position.drawdowns))}`}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Money out to date"
            value={formatCrore(outTotal)}
            size="lg"
            hint={
              position.approvedUnpaidCount > 0
                ? `Plus ${formatCrore(position.approvedUnpaidTotal)} across ${formatCount(position.approvedUnpaidCount)} approved bills waiting to be paid`
                : "Every approved bill is paid"
            }
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Net, as recorded"
            value={formatCrore(net)}
            size="lg"
            tone={net < 0 ? "warn" : "good"}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Interest paid to date"
            value={formatCrore(sumAmounts(position.interestPaid))}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <ChartCard title="Money in vs money out, last 12 months" series={inOut.series}>
        <ChartBars model={inOut} />
      </ChartCard>

      <ChartCard
        title="What the money out was, by month"
        series={outStack.series}
        note="Bills are counted when they are marked paid, not when the invoice arrived."
      >
        <ChartStacked model={outStack} />
      </ChartCard>

      <p className="text-muted text-xs">
        This is the net of what the toolbox has recorded — client receipts, paid bills and the
        funding ledger. It is not a bank balance: salaries, overheads and anything paid outside
        Bills are not in it.
      </p>
    </div>
  );
}
