import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { getFilterOptions, listDues } from "@/lib/client-relations/queries";
import { milestoneLabel } from "@/lib/client-relations/stages";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { PiggyBank } from "lucide-react";
import Link from "next/link";

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; overdue?: string }>;
}) {
  const { project, overdue } = await searchParams;
  const overdueOnly = overdue === "1";

  const [board, options] = await Promise.all([
    listDues({ project, overdueOnly }),
    getFilterOptions(),
  ]);

  return (
    <div className="space-y-4">
      <FigureBand>
        <FigureBandCell>
          <Figure label="Scheduled" value={formatMoney(board.totals.scheduled)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Invoiced" value={formatMoney(board.totals.invoiced)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Received"
            value={formatMoney(board.totals.received)}
            tone="good"
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Outstanding"
            value={formatMoney(board.totals.outstanding)}
            hint={`${formatCount(board.plotsOwing)} plots`}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Overdue"
            value={formatMoney(board.totals.overdue)}
            hint={`${formatCount(board.totals.overdueCount)} instalments`}
            tone={board.totals.overdue > 0 ? "bad" : undefined}
            size="sm"
          />
        </FigureBandCell>
      </FigureBand>

      <form action="/client-relations/dues" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="project">Project</Label>
          <Select id="project" name="project" defaultValue={project ?? ""}>
            <option value="">All</option>
            {options.projects.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="overdue">Show</Label>
          <Select id="overdue" name="overdue" defaultValue={overdue ?? ""}>
            <option value="">Everything outstanding</option>
            <option value="1">Overdue only</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(project || overdueOnly) && (
          <LinkButton href="/client-relations/dues" variant="ghost">
            Clear
          </LinkButton>
        )}
      </form>

      {board.lines.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={overdueOnly ? "Nothing is overdue" : "Nothing is outstanding"}
          description={
            board.totals.scheduled === 0
              ? "Set the amounts on a plot's payment schedule and they will show up here."
              : "Every instalment that has been scheduled has been received."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="min-w-[140px]">Plot</TableHeaderCell>
              <TableHeaderCell className="min-w-[160px]">Client</TableHeaderCell>
              <TableHeaderCell>Instalment</TableHeaderCell>
              <TableHeaderCell>Due</TableHeaderCell>
              <TableHeaderCell>Invoiced</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell className="text-right">Outstanding</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {board.lines.map((line) => (
              <TableRow key={`${line.engagementId}-${line.stage}`}>
                <TableCell className="text-foreground font-medium whitespace-nowrap">
                  <Link
                    href={`/client-relations/plots/${line.engagementId}`}
                    className="hover:underline"
                  >
                    {line.unitName}
                  </Link>
                  <span className="text-muted block text-xs">{line.projectName}</span>
                </TableCell>
                <TableCell>
                  {line.clientId ? (
                    <Link
                      href={`/client-relations/${line.clientId}`}
                      className="text-foreground hover:underline"
                    >
                      {line.clientName}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
                <TableCell>{milestoneLabel(line.stage)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {line.isOverdue ? (
                    <Badge variant="danger">{formatDate(line.dueOn)}</Badge>
                  ) : (
                    <span className="text-muted">{formatDate(line.dueOn)}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted whitespace-nowrap">
                  {formatDate(line.invoicedOn)}
                </TableCell>
                <TableCell className="text-muted text-right font-mono text-xs">
                  {formatMoney(line.dueAmount)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <span className={line.isOverdue ? "text-danger" : undefined}>
                    {formatMoney(line.outstanding)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
