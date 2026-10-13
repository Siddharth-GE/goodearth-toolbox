import { ChartBars } from "@/components/ui/chart/bar-chart";
import { ChartCard } from "@/components/ui/chart/chart-card";
import { ChartStacked } from "@/components/ui/chart/stacked-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
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
import {
  birdwingTiles,
  expenseStackModel,
  moneyByMonthModel,
  monthsSoFar,
  occupancyModel,
  resultModel,
  shortMonth,
  segmentSplitModel,
} from "@/lib/financial-management/birdwing";
import { getBirdwingPicture } from "@/lib/financial-management/birdwing-queries";
import {
  formatCount,
  formatCrore,
  formatMoney,
  formatPercent,
  formatQuantity,
  todayInIndia,
} from "@/lib/format";
import { Bed } from "lucide-react";

const USE_WORDS: Record<string, string> = {
  guest: "Paying guest",
  client: "Client",
  prospect: "Prospect",
  team: "Team",
  architect: "Architect",
  director: "Director",
  vendor: "Vendor",
};

/**
 * Birdwing Farmstay, live — the consolidated page (birdwing-consolidated
 * .html) rebuilt from 0117's views: the eight tiles, month by month, who
 * the rooms were for, where the money went, occupancy, and what is still
 * pending. Read-only; the stays and expenses are kept in Birdwing's own
 * two tools.
 */
export default async function BirdwingFinancePage() {
  const today = todayInIndia();
  const picture = await getBirdwingPicture();
  const months = monthsSoFar(picture.months, today);

  if (months.length === 0) {
    return (
      <EmptyState
        icon={Bed}
        title="Nothing from Birdwing yet"
        description="This screen draws from Birdwing Stays and Birdwing Books. As soon as a stay is charged or an expense recorded, it shows here."
      />
    );
  }

  const tiles = birdwingTiles(picture.months, today);
  const first = shortMonth(months[0].month);
  const last = shortMonth(months[months.length - 1].month);
  const moneyModel = moneyByMonthModel(months);
  const splitModel = segmentSplitModel(months);
  const expenseModel = expenseStackModel(
    picture.expenseLines.filter((line) => months.some((row) => row.month === line.month)),
    months,
  );
  const top = picture.receivables.slice(0, 12);
  const byUse = new Map<string, number>();
  for (const stay of picture.receivables) {
    const key = stay.use ?? "guest";
    byUse.set(key, (byUse.get(key) ?? 0) + stay.pending);
  }

  return (
    <div className="space-y-4">
      <p className="text-muted text-sm">
        {first} – {last} · GST-inclusive, as charged · stays from Birdwing Stays, spending from
        Birdwing Books.
      </p>

      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Billed value"
            value={formatCrore(tiles.billed)}
            size="hero"
            hint={`${formatCrore(tiles.charged)} charged, less ${formatCrore(tiles.commissionAndDiscount)} commission and discount`}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Collected"
            value={formatCrore(tiles.collected)}
            size="lg"
            hint={
              tiles.collectedShare === null
                ? undefined
                : `${formatPercent(tiles.collectedShare * 100)} of billed value`
            }
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Pending"
            value={formatCrore(tiles.pending)}
            size="lg"
            tone={tiles.pending >= 1 ? "warn" : "good"}
            hint={`${formatCrore(tiles.pendingInternal)} Goodearth's own · ${formatCrore(tiles.pendingGuest)} guests`}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Expenses" value={formatCrore(tiles.expenses)} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Result on billed value"
            value={formatCrore(tiles.resultBilled)}
            size="lg"
            tone={tiles.resultBilled < 0 ? "bad" : "good"}
            hint="billed − expenses"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Result on cash"
            value={formatCrore(tiles.resultCash)}
            size="lg"
            tone={tiles.resultCash < 0 ? "bad" : "good"}
            hint="collected − expenses"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label={tiles.occupancyEstimated ? "Occupancy, estimated" : "Occupancy"}
            value={tiles.occupancy === null ? "—" : formatPercent(tiles.occupancy * 100)}
            size="lg"
            hint={`${formatQuantity(tiles.occupancyRoomNights)} of ${formatCount(tiles.occupancyCapacity)} room-nights, complete months`}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Average room rate"
            value={formatMoney(tiles.averageRoomRate)}
            size="lg"
            hint="room revenue ÷ room-nights, with GST"
          />
        </FigureBandCell>
      </FigureBand>

      <ChartCard title="Month by month" series={moneyModel.series}>
        <ChartBars model={moneyModel} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Result on billed value">
          <ChartBars model={resultModel(months)} />
        </ChartCard>
        <ChartCard
          title="Occupancy, % of room-nights"
          note={
            tiles.occupancyEstimated
              ? "Estimated for months from the old sheet, which counted rooms but never named them."
              : undefined
          }
        >
          <ChartBars model={occupancyModel(months, today)} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Who the rooms were for" series={splitModel.series}>
          <ChartStacked model={splitModel} />
        </ChartCard>
        <ChartCard title="Where the money went" series={expenseModel.series}>
          <ChartStacked model={expenseModel} />
        </ChartCard>
      </div>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Month</TableHeaderCell>
            <TableHeaderCell className="text-right">Stays</TableHeaderCell>
            <TableHeaderCell className="text-right">Billed</TableHeaderCell>
            <TableHeaderCell className="text-right">Collected</TableHeaderCell>
            <TableHeaderCell className="hidden text-right md:table-cell">Pending</TableHeaderCell>
            <TableHeaderCell className="text-right">Expenses</TableHeaderCell>
            <TableHeaderCell className="hidden text-right sm:table-cell">Result</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {months.map((row) => (
            <TableRow key={row.month}>
              <TableCell>{shortMonth(row.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.stays}</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(row.billed)}</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(row.collected)}</TableCell>
              <TableCell className="hidden text-right font-mono md:table-cell">
                {formatMoney(row.pending)}
              </TableCell>
              <TableCell className="text-right font-mono">{formatMoney(row.expenses)}</TableCell>
              <TableCell
                className={
                  row.billed - row.expenses < 0
                    ? "text-danger hidden text-right font-mono sm:table-cell"
                    : "text-success hidden text-right font-mono sm:table-cell"
                }
              >
                {formatMoney(row.billed - row.expenses)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFoot>
          <tr>
            <TableTotalCell>Total</TableTotalCell>
            <TableTotalCell className="text-right">
              {months.reduce((total, row) => total + row.stays, 0)}
            </TableTotalCell>
            <TableTotalCell className="text-right font-mono">
              {formatMoney(tiles.billed)}
            </TableTotalCell>
            <TableTotalCell className="text-right font-mono">
              {formatMoney(tiles.collected)}
            </TableTotalCell>
            <TableTotalCell className="hidden text-right font-mono md:table-cell">
              {formatMoney(tiles.pending)}
            </TableTotalCell>
            <TableTotalCell className="text-right font-mono">
              {formatMoney(tiles.expenses)}
            </TableTotalCell>
            <TableTotalCell className="hidden text-right font-mono sm:table-cell">
              {formatMoney(tiles.resultBilled)}
            </TableTotalCell>
          </tr>
        </TableFoot>
      </Table>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Still pending</TableHeaderCell>
              <TableHeaderCell className="text-right">Billed</TableHeaderCell>
              <TableHeaderCell className="text-right">Pending</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {top.map((stay) => (
              <TableRow key={stay.ref}>
                <TableCell>
                  <span className="font-medium">{stay.guestName ?? "—"}</span>
                  <div className="text-muted text-xs">
                    {stay.ref} · {USE_WORDS[stay.use ?? "guest"] ?? stay.use} ·{" "}
                    {shortMonth(stay.month)}
                    {stay.segment === "internal" &&
                      (stay.costCentre ? ` · ${stay.costCentre}` : " · no cost centre")}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoney(stay.billed)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(stay.pending)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ul className="border-border bg-surface space-y-2 self-start rounded-2xl border p-5 text-sm">
          <li className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Pending by who it was for
          </li>
          {[...byUse.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([use, amount]) => (
              <li key={use} className="flex justify-between gap-3">
                <span className="text-muted">{USE_WORDS[use] ?? use}</span>
                <span className="font-mono">{formatMoney(amount)}</span>
              </li>
            ))}
          <li className="text-muted pt-2 text-xs">
            Goodearth&rsquo;s own stays are closed in Birdwing Stays → Review, by charging them to a
            cost centre.
          </li>
        </ul>
      </div>
    </div>
  );
}
