import { ChartBars } from "@/components/ui/chart/bar-chart";
import { ChartCard } from "@/components/ui/chart/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell, ResultPanel } from "@/components/ui/figure";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  buildMonthlySeriesModel,
  forwardCollections,
  fundingGap,
  nextMonths,
} from "@/lib/financial-management/cashflow";
import { todayInIndia } from "@/lib/financial-management/interest";
import { getForwardView } from "@/lib/financial-management/queries";
import { formatCrore } from "@/lib/format";
import { CalendarClock } from "lucide-react";

export default async function ForwardPage() {
  const view = await getForwardView();

  if (view.milestones.length === 0 && view.targets.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled yet"
        description="This screen reads the payment schedules in Client Relations and the targets published from Business Planning. When either holds a figure, the road ahead shows here."
      />
    );
  }

  const today = todayInIndia();
  const forward = forwardCollections(view.milestones, view.unallocatedByEngagement, today);

  const remainingSpend = view.targets.reduce(
    (sum, target) => sum + Math.max(0, target.totalCost - target.actualSpend),
    0,
  );
  const gap = fundingGap({
    remainingSpend,
    collectionsToCome: forward.toCome,
    undrawnSanctioned: view.undrawnSanctioned,
  });

  const months = nextMonths(today, 12);
  const chart = buildMonthlySeriesModel({
    id: "expected",
    label: "Expected collections",
    byMonth: forward.byMonth,
    months,
  });

  return (
    <div className="space-y-4">
      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Collections still to come"
            value={formatCrore(forward.toCome)}
            size="hero"
            hint="Everything unpaid on every payment schedule"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Already overdue"
            value={formatCrore(forward.overdue)}
            size="lg"
            tone={forward.overdue > 0 ? "warn" : undefined}
            hint="Due date passed, money not in"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Not yet scheduled"
            value={formatCrore(forward.unscheduled)}
            size="lg"
            hint="Priced rungs with no due date — never guessed into a month"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Remaining expected spend"
            value={formatCrore(remainingSpend)}
            size="lg"
            hint="Published plan cost, less what Bills has recorded"
          />
        </FigureBandCell>
      </FigureBand>

      <ChartCard
        title="Expected collections, next 12 months"
        note={
          forward.overdue > 0 || forward.unscheduled > 0
            ? "Overdue and unscheduled money is in the figures above, never drawn as a bar — a bar needs a real date."
            : undefined
        }
      >
        <ChartBars model={chart} />
      </ChartCard>

      <ResultPanel title="The funding gap" raised>
        <div className="grid gap-3 sm:grid-cols-4">
          <Figure label="Spend ahead" value={formatCrore(remainingSpend)} />
          <Figure label="Collections to come" value={`− ${formatCrore(forward.toCome)}`} />
          <Figure label="Undrawn headroom" value={`− ${formatCrore(view.undrawnSanctioned)}`} />
          <Figure
            label={gap > 0 ? "Still to find" : "Covered on paper"}
            value={formatCrore(Math.abs(gap))}
            size="lg"
            tone={gap > 0 ? "warn" : "good"}
          />
        </div>
        <p className="text-muted mt-3 text-xs">
          Spend ahead comes from plans published in Business Planning, so it covers only projects
          with a linked plan — and it has no dates, which is why it is a total here rather than a
          curve.
        </p>
      </ResultPanel>

      {view.targets.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Plan</TableHeaderCell>
              <TableHeaderCell className="text-right">Planned cost</TableHeaderCell>
              <TableHeaderCell className="text-right">Spent so far</TableHeaderCell>
              <TableHeaderCell className="text-right">Spend ahead</TableHeaderCell>
              <TableHeaderCell className="text-right">Planned revenue</TableHeaderCell>
              <TableHeaderCell className="text-right">Collected so far</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.targets.map((target) => (
              <TableRow key={target.id}>
                <TableCell className="text-foreground font-medium">{target.projectName}</TableCell>
                <TableCell className="text-muted">{target.planName}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCrore(target.totalCost)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCrore(target.actualSpend)}
                </TableCell>
                <TableCell className="text-foreground text-right font-mono font-medium">
                  {formatCrore(Math.max(0, target.totalCost - target.actualSpend))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCrore(target.revenue)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCrore(target.actualCollections)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
